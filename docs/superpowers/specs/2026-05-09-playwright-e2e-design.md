# Playwright E2E Tests for Frontend

## Context

Thesis project: disaster early warning system for Aceh fishermen. Frontend is a Next.js 16 PWA with weather cards, alert feed, report submission, SSE real-time updates, and offline support. Target users are elderly fishermen with low ICT literacy.

## Approach

Full integration tests — Playwright hits the real backend (`localhost:3000`) and real frontend (`localhost:3001`). Prerequisites: backend running (`bun run dev`), Memurai running. No API mocking.

## Setup

- Framework: Playwright (TypeScript)
- Config: `frontend/playwright.config.ts`
- Tests: `frontend/e2e/`
- Base URL: `http://localhost:3001`
- API URL: `http://localhost:3000`
- Install: `npm install -D @playwright/test` then `npx playwright install`

## Test Suites

### 1. Weather Cards (`e2e/weather.spec.ts`)

- Page loads and renders 5 beach weather cards
- Each card displays: beach name, weather condition, wind speed/direction, temperature, humidity
- Safety badge is present on each card (safe = green, unsafe = red)
- Data comes from real `/api/bmkg` endpoint

### 2. Alert Feed (`e2e/alerts.spec.ts`)

- Alert feed section is visible on page load
- Existing alerts from `/api/alerts` are displayed
- Each alert shows: beach location, risk level badge, sign description, timestamp
- Risk level badge has correct color styling

### 3. Report Submission (`e2e/report.spec.ts`)

- FAB button is visible at bottom-right
- Clicking FAB opens the bottom sheet overlay
- Beach selection dropdown shows all 5 beaches
- LIK sign checkboxes are selectable/deselectable
- Submit sends POST to `/api/report`
- Sheet closes after successful submission

### 4. SSE Real-time Updates (`e2e/sse.spec.ts`)

- Page connects to `/api/sse` on load
- New alert published to Redis appears in feed without reload

### 5. PWA Basics (`e2e/pwa.spec.ts`)

- Service worker registration script is present in layout
- Manifest link exists in `<head>`
- PWA installability (manifest has required fields)

## File Structure

```
frontend/
  playwright.config.ts
  e2e/
    weather.spec.ts
    alerts.spec.ts
    report.spec.ts
    sse.spec.ts
    pwa.spec.ts
```

## Constraints

- Tests must pass with real backend data (not hardcoded mocks)
- Backend must have at least 3 alerts in Redis stream for alert feed tests
- All 5 beaches must be seeded for weather card tests
- SSE test requires Redis pub/sub to be functional
