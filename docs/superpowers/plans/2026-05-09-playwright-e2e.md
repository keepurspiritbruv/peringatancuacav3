# Plan: Playwright E2E Tests for Frontend

## Context

Frontend is Next.js 16 PWA at `frontend/`. Backend is Hono/Bun at `disaster-backend/`. API calls go through Next.js rewrites (`/api/*` → `http://localhost:3000/api/*`). Tests run against real servers — no mocking.

## Prerequisites

- Backend running: `cd disaster-backend && bun run dev` (port 3000)
- Memurai running (Windows service)
- Frontend dev server: `cd frontend && npm run dev` (port 3001)

## File Structure

```
frontend/
  playwright.config.ts          — Playwright config
  e2e/
    weather.spec.ts             — Weather cards tests
    alerts.spec.ts              — Alert feed tests
    report.spec.ts              — Report submission tests
    sse.spec.ts                 — SSE real-time update tests
    pwa.spec.ts                 — PWA basics tests
    fixtures/
      test-data.ts              — Shared test constants and helpers
```

## Tasks

### Task 1: Install Playwright

Add `@playwright/test` to frontend devDependencies. Install browser binaries. Add test script to package.json.

**Files:** `frontend/package.json`
**Verify:** `npx playwright --version` succeeds

### Task 2: Create Playwright config

Create `frontend/playwright.config.ts`. Base URL `http://localhost:3001`. Use Chromium only ( fishermen use Android — Chromium is closest). Timeout 30s. Web server not configured (user starts servers manually).

**Files:** `frontend/playwright.config.ts`
**Verify:** `npx playwright test --list` shows config loaded

### Task 3: Create test fixtures and helpers

Create `frontend/e2e/fixtures/test-data.ts` with:
- `BEACH_NAMES` — the 5 beach labels visible in UI (Lampuuk, Lhoknga, Ulee Lheue, Depok, Samas)
- `LIK_SIGN_LABELS` — sample sign labels (Awan turun, Kilat, Ombak besar)
- `API_BASE` — `http://localhost:3000/api`
- Helper `seedAlert()` — POST to `/api/report` with known data to create an alert in Redis stream (for testing alert display)
- Helper `clearAlerts()` — optional, may skip to avoid destroying real data

**Files:** `frontend/e2e/fixtures/test-data.ts`
**Verify:** No runtime errors importing the file

### Task 4: Weather cards tests

Create `frontend/e2e/weather.spec.ts`:
- `page loads and shows weather section` — heading "Cuaca" or similar visible
- `displays 5 beach weather cards` — count cards with beach names
- `each card shows weather data` — check wind speed, temperature displayed (values are dynamic from BMKG)
- `safety badge present` — each card has a status indicator

Note: Since BMKG data is live and changes, tests use `getByText` with regex patterns and `toHaveText` with flexible matchers rather than exact values.

**Files:** `frontend/e2e/weather.spec.ts`
**Verify:** `npx playwright test e2e/weather.spec.ts` passes

### Task 5: Alert feed tests

Create `frontend/e2e/alerts.spec.ts`:
- `alert feed section is visible` — section heading visible
- `displays existing alerts from backend` — check alert cards show beach location, risk level, sign description
- `each alert shows timestamp` — time string present in alert card
- `shows empty state when no alerts` — this test may need to run in isolation or after clearing alerts

**Files:** `frontend/e2e/alerts.spec.ts`
**Verify:** `npx playwright test e2e/alerts.spec.ts` passes

### Task 6: Report submission tests

Create `frontend/e2e/report.spec.ts`:
- `FAB button is visible` — floating action button present on page
- `clicking FAB opens report sheet` — click FAB, bottom sheet appears with beach and sign selectors
- `beach selector shows all 5 beaches` — dropdown/list contains all beach names
- `sign selector shows LIK signs` — signs are displayed with icons/labels
- `select beach and sign, submit report` — interact with selectors, click submit, verify POST request sent (use `page.waitForResponse`)

**Files:** `frontend/e2e/report.spec.ts`
**Verify:** `npx playwright test e2e/report.spec.ts` passes

### Task 7: SSE real-time update tests

Create `frontend/e2e/sse.spec.ts`:
- `SSE connection established on page load` — intercept SSE request, verify it's made
- `new alert appears in feed via SSE` — seed an alert via API, verify it appears in the feed without page reload

This test uses `page.waitForResponse` and `page.route` to observe SSE behavior.

**Files:** `frontend/e2e/sse.spec.ts`
**Verify:** `npx playwright test e2e/sse.spec.ts` passes

### Task 8: PWA basics tests

Create `frontend/e2e/pwa.spec.ts`:
- `page has PWA manifest` — check `<link rel="manifest">` in head
- `service worker registered` — verify `navigator.serviceWorker` has a registration after page load
- `page works offline after load` — go offline after page loads, verify cached content still displays (weather cards, alert feed)

**Files:** `frontend/e2e/pwa.spec.ts`
**Verify:** `npx playwright test e2e/pwa.spec.ts` passes

### Task 9: Run full suite and fix issues

Run `npx playwright test` across all specs. Fix any failures. Ensure all tests pass together.

**Verify:** `npx playwright test` — all pass, no failures
