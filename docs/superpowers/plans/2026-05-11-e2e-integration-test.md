# E2E Integration Test — Full Services

## Goal
Create an end-to-end test that starts all 4 services (Redis, SHAP API, Backend, Frontend), sends a real `POST /report`, and verifies the complete data flow: **Report → Backend crowdsource → SHAP predict → Alert → SSE → Frontend UI**.

## Prerequisites
- Docker (for Redis)
- bun, npx, python (all already installed)
- No Redis/SHAP/Backend need to be pre-running — the test script handles everything

## Architecture

```
docker (Redis :6379)
  ↑
Backend (bun :3000)  →  SHAP API (uvicorn :8000)
  ↑
Frontend (next :3001) — rewrites /api/* → localhost:3000
  ↑
Playwright tests
```

## File Structure

| File | Purpose |
|---|---|
| `e2e-test.sh` | Shell script: starts all services, runs Playwright, tears down |
| `frontend/e2e/integration.spec.ts` | New Playwright spec: full data flow assertions |
| `frontend/e2e/fixtures/test-data.ts` | Existing — may need minor update |

## Tasks

### Task 1: Create `e2e-test.sh` orchestration script

**File:** `e2e-test.sh` (project root)

This script:
1. Starts Redis via Docker (`docker run -d --name e2e-redis -p 6379:6379 redis:alpine`)
2. Waits for Redis to be ready (`redis-cli ping` via docker exec)
3. Installs SHAP deps if needed (`pip install -r SHAP-model-api/requirements.txt`)
4. Starts SHAP API in background (`cd SHAP-model-api && uvicorn src.main:app --port 8000`)
5. Waits for SHAP health (`curl http://localhost:8000/health`)
6. Starts Backend in background (`cd disaster-backend && bun run src/index.ts`)
7. Waits for Backend health (`curl http://localhost:3000/api/health`)
8. Starts Frontend in background (`cd frontend && npm run dev`)
9. Waits for Frontend (`curl http://localhost:3001`)
10. Flushes Redis keys before tests (`docker exec e2e-redis redis-cli FLUSHALL`)
11. Runs `cd frontend && npx playwright test e2e/integration.spec.ts`
12. Captures exit code
13. Tears down: kills all background processes, `docker rm -f e2e-redis`
14. Exits with Playwright's exit code

**Trap SIGINT/SIGTERM** for cleanup on Ctrl+C.

### Task 2: Create `frontend/e2e/integration.spec.ts`

**File:** `frontend/e2e/integration.spec.ts`

Tests the complete data flow with real services:

```
describe("E2E: Report → SHAP → Alert → UI")
  test("single sign report: queues until threshold")
    - POST /api/report with 1 LIK code
    - Assert response: { ok: true, status: "queued" }

  test("multi-report triggers SHAP prediction")
    - Send reports until threshold (5 reports)
    - Assert final response has alertEvent with riskLevel
    - Assert alertEvent contains firstReportAt, lastReportAt, reporterCount

  test("alert appears in GET /api/alerts")
    - Call GET /api/alerts
    - Assert response.data has the alert
    - Assert fields: riskLevel, reporterCount, firstReportAt, lastReportAt

  test("alert card renders on frontend")
    - Navigate to /
    - Assert alert card is visible (.border-l-4)
    - Assert beach name, risk badge, LIK codes visible

  test("SSE delivers new alert in real-time")
    - Open page, count initial alerts
    - Send enough reports to trigger a new alert
    - Assert new alert card appears within timeout

  test("SHAP community_characteristics flows to riskLevel")
    - Send report with codes that trigger "Actionable" community_characteristics
    - Assert riskLevel is "unsafe" or "unsafe-high"
```

Uses the existing `seedAlert` helper from `fixtures/test-data.ts` but sends multiple reports to hit threshold.

### Task 3: Update `playwright.config.ts` for integration tests

**File:** `frontend/playwright.config.ts`

Add a second project for integration tests that:
- Does NOT auto-start the frontend webServer (we manage it in the shell script)
- Uses a distinct `testMatch` pattern or put integration tests in a separate config

Actually, simpler approach: the shell script handles service startup, and Playwright config already has `reuseExistingServer: true`. So existing config works — we just need to ensure `webServer` doesn't conflict.

**Change:** Add `testIgnore` to exclude integration.spec.ts from normal `test:e2e` runs, and create a separate npm script `test:e2e:integration` that only runs the integration spec.

### Task 4: Run and verify

1. Execute `bash e2e-test.sh`
2. Verify all tests pass
3. Verify cleanup happened (no orphan Docker containers/processes)

## Key Implementation Details

### Threshold = 5
The crowdsource threshold is 5 for all beaches. The test needs to send 5 reports with the same beach + LIK code to trigger the alert. Use a helper that sends N reports in a loop.

### SHAP Response Fields
The SHAP API returns: `community_characteristics`, `sign_description`, `action_recommendation`, `triggered_lik_codes`, `active_warning`.

### Risk Level Logic
- `community_characteristics === "Actionable"` + single sign → `unsafe`
- `community_characteristics === "Actionable"` + multi sign → `unsafe-high`
- Otherwise → `safe`

### Alert Event Fields (from backend)
`alertId`, `beachLocation`, `riskLevel`, `reporterCount`, `firstReportAt`, `lastReportAt`, `decision`, `input`, `ml`

### Frontend Derives
`signDescription`, `actionRecommendation`, `triggeredCodes` from `ml` sub-object.
