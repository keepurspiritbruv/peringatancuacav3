#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")" && pwd)"
REDIS_CONTAINER="e2e-redis-test"
PIDS=()

cleanup() {
  echo ""
  echo "=== Cleaning up ==="
  if docker ps -q -f "name=$REDIS_CONTAINER" | grep -q .; then
    echo "Stopping Redis container..."
    docker stop "$REDIS_CONTAINER" > /dev/null 2>&1 || true
    docker rm "$REDIS_CONTAINER" > /dev/null 2>&1 || true
  fi
  for pid in "${PIDS[@]}"; do
    if kill -0 "$pid" 2>/dev/null; then
      echo "Killing process $pid..."
      kill -TERM "$pid" 2>/dev/null || true
    fi
  done
  wait 2>/dev/null || true
  echo "Cleanup done."
}
trap cleanup EXIT

echo "=========================================="
echo "  E2E Integration Test — Full Services"
echo "=========================================="
echo ""

echo "[1/6] Starting Redis (Docker)..."
docker stop "$REDIS_CONTAINER" > /dev/null 2>&1 || true
docker rm "$REDIS_CONTAINER" > /dev/null 2>&1 || true
docker run -d --name "$REDIS_CONTAINER" -p 6379:6379 redis:7-alpine > /dev/null
echo "  Redis ready on :6379"

echo "[2/6] Starting SHAP API (port 8000)..."
cd "$ROOT_DIR/SHAP-model-api"
python -m uvicorn src.main:app --host 127.0.0.1 --port 8000 &
PIDS+=($!)
sleep 2

for i in $(seq 1 10); do
  if curl -sf http://127.0.0.1:8000/health > /dev/null 2>&1; then
    echo "  SHAP API ready on :8000"
    break
  fi
  if [ "$i" -eq 10 ]; then
    echo "  ERROR: SHAP API failed to start" >&2
    exit 1
  fi
  sleep 1
done

echo "[3/6] Starting Backend (port 3000)..."
cd "$ROOT_DIR/disaster-backend"
bun run src/index.ts &
PIDS+=($!)
sleep 2

for i in $(seq 1 15); do
  if curl -sf http://127.0.0.1:3000/api/health > /dev/null 2>&1; then
    echo "  Backend ready on :3000"
    break
  fi
  if [ "$i" -eq 15 ]; then
    echo "  ERROR: Backend failed to start" >&2
    exit 1
  fi
  sleep 1
done

echo "[4/6] Flushing Redis (clean state)..."
docker exec "$REDIS_CONTAINER" redis-cli FLUSHALL > /dev/null
echo "  Redis flushed"

echo "[5/6] Running Playwright E2E tests..."
cd "$ROOT_DIR/frontend"
npx playwright test e2e/e2e-flow.spec.ts --reporter=list
PW_EXIT=$?

echo ""
if [ "$PW_EXIT" -eq 0 ]; then
  echo "=== ALL E2E TESTS PASSED ==="
else
  echo "=== E2E TESTS FAILED (exit $PW_EXIT) ==="
fi

exit $PW_EXIT
