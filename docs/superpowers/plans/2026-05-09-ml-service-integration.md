# ML Service Full Integration

**Date:** 2026-05-09
**Approach:** A (Minimal Polish) — fix gaps, add endpoints/tests, docker-compose update

## Context

The `SHAP-model-api/` directory contains a working FastAPI rule-based inference engine that the backend calls at `/predict`. The backend's `MlResult` type expects `{active_warning, sign_description, community_characteristics, action_recommendation}`. The existing engine returns exactly that shape **except** it's missing `triggered_lik_codes` which the backend reads at `report.ts:213`.

There is no `/health`, `/retrain`, or `/model/info` endpoint. No tests exist. Docker-compose pulls a stale image instead of building locally.

## File Map

| File | Action | Purpose |
|------|--------|---------|
| `SHAP-model-api/src/engine/inference_engine.py` | Modify | Add `triggered_lik_codes` to response, trim dead LIK codes from `lik_code_list` |
| `SHAP-model-api/src/main.py` | Modify | Add `/health`, `/retrain`, `/model/info` endpoints |
| `SHAP-model-api/requirements.txt` | Modify | Add `pytest`, `httpx` |
| `SHAP-model-api/tests/__init__.py` | Create | Package marker |
| `SHAP-model-api/tests/conftest.py` | Create | Shared fixtures (engine, client) |
| `SHAP-model-api/tests/test_inference.py` | Create | Unit tests for inference engine logic |
| `SHAP-model-api/tests/test_api.py` | Create | Integration tests for API endpoints |
| `disaster-backend/docker-compose.yml` | Modify | Replace `image:` with `build: ../../SHAP-model-api` for disaster-ml |
| `disaster-backend/.env.local` | Modify | Add `ML_BASE_URL=http://localhost:8000` |

## Tasks

### Task 1: Fix inference engine response

**File:** `SHAP-model-api/src/engine/inference_engine.py`

1. In the `predict()` method, add `"triggered_lik_codes": combined_codes` to the return dict (line ~170-175).
2. Trim `lik_code_list` in `get_lik_sign_description()` to only contain the 10 trusted codes (Wn-1 through Wn-9 plus Wn-13). Remove Wn-10 through Wn-18.

**Verify:** Engine's `predict()` now returns 5 fields including `triggered_lik_codes`.

### Task 2: Add `/health`, `/retrain`, `/model/info` endpoints

**File:** `SHAP-model-api/src/main.py`

1. `GET /health` returns `{status: "ok", model_loaded: true}`.
2. `POST /retrain` returns 501 with `{detail: "Retrain not yet implemented"}`.
3. `GET /model/info` returns:
   ```json
   {
     "name": "Hybrid SHAP Model",
     "version": "1.1",
     "type": "rule-based",
     "supported_beaches": ["pantai_lampuuk", "pantai_lhoknga", "pantai_ulee_lheue", "pantai_depok", "pantai_samas"],
     "trusted_signs": ["Wn-1", "Wn-2", "Wn-3", "Wn-4", "Wn-5", "Wn-6", "Wn-7", "Wn-8", "Wn-9", "Wn-13"]
   }
   ```

**Verify:** `pytest tests/test_api.py` passes.

### Task 3: Update requirements.txt

**File:** `SHAP-model-api/requirements.txt`

Add:
```
pytest>=8.0
httpx>=0.27
```

**Verify:** `pip install -r requirements.txt` succeeds.

### Task 4: Create test conftest

**File:** `SHAP-model-api/tests/conftest.py`

Shared fixtures:
- `engine` — `InferenceEngine` instance
- `client` — FastAPI `TestClient` for the app

**Verify:** Fixtures imported correctly by test files.

### Task 5: Write inference engine unit tests

**File:** `SHAP-model-api/tests/test_inference.py`

Test cases:
- Trusted sign filtering: codes not in trusted list are dropped
- Action escalation: Wn-3 (sesuaikan) > Wn-1 (siaga) > Wn-2 (berhati-hati)
- Empty input returns safe message
- `triggered_lik_codes` is present in response
- Sign descriptions returned for valid codes
- Sign descriptions empty for invalid codes
- Beach community characteristics: depok=Unsafe, lampuuk=Safe

**Verify:** `pytest tests/test_inference.py` passes.

### Task 6: Write API integration tests

**File:** `SHAP-model-api/tests/test_api.py`

Test cases:
- `POST /predict` with valid input returns 200 with all 5 fields
- `POST /predict` with invalid beach returns 400
- `GET /health` returns 200 with `{status: "ok"}`
- `POST /retrain` returns 501
- `GET /model/info` returns 200 with metadata

Use FastAPI `TestClient` from `httpx`.

**Verify:** `pytest tests/test_api.py` passes.

### Task 7: Update docker-compose.yml

**File:** `disaster-backend/docker-compose.yml`

Change the `disaster-ml` service from:
```yaml
disaster-ml:
  image: scaferuzzz/shap-api:latest
```
To:
```yaml
disaster-ml:
  build: ../../SHAP-model-api
```

Keep all other fields (container_name, restart, profiles).

**Verify:** `docker compose config` validates without errors.

### Task 8: Update .env.local

**File:** `disaster-backend/.env.local`

Add:
```
ML_BASE_URL=http://localhost:8000
```

**Verify:** Backend starts and can reach ML service at localhost:8000.

### Task 9: Run full test suite and verify

1. `cd SHAP-model-api && python -m pytest tests/ -v`
2. Verify all tests pass
3. Start ML service: `cd SHAP-model-api && uvicorn src.main:app --port 8000`
4. `curl http://localhost:8000/health` returns `{status: "ok", model_loaded: true}`
5. `curl http://localhost:8000/model/info` returns metadata

**Verify:** All green.
