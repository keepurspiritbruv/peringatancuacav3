# Frontend Implementation Plan — Peringatan Dini Bencana

**Tanggal:** 2026-05-09
**Spec:** `docs/superpowers/specs/2026-05-09-frontend-design.md`

---

## Scope Check

This plan covers two subsystems:
1. **Backend API additions** — new BMKG endpoint + alert feed endpoint for frontend consumption
2. **Frontend app** — Next.js silent PWA with report flow, alert feed, weather cards

Both are in one plan because the frontend depends on the new backend endpoints.

---

## File Structure

### New Backend Files

| File | Responsibility |
|---|---|
| `disaster-backend/src/routes/bmkg.ts` | `GET /api/bmkg/:beach` endpoint — returns cached BMKG data for a beach |
| `disaster-backend/src/routes/alerts.ts` | `GET /api/alerts` endpoint — returns recent alert events from Redis stream |
| `disaster-backend/src/lib/bmkg-fetch.ts` | BMKG data fetcher — fetches from BMKG sources, stores in Redis cache |

### New Frontend Files

| File | Responsibility |
|---|---|
| `frontend/package.json` | Dependencies: next, react, shadcn/ui deps |
| `frontend/src/app/layout.tsx` | Root layout, metadata, manifest link, font |
| `frontend/src/app/page.tsx` | Single page: AlertFeed + WeatherCards + FAB |
| `frontend/src/app/globals.css` | Tailwind directives + custom theme colors |
| `frontend/src/components/alert-feed.tsx` | Alert card list, SSE auto-refresh |
| `frontend/src/components/alert-card.tsx` | Single alert card component |
| `frontend/src/components/weather-cards.tsx` | Beach weather card grid |
| `frontend/src/components/weather-card.tsx` | Single beach weather card with status badge |
| `frontend/src/components/report-fab.tsx` | Floating action button |
| `frontend/src/components/report-sheet.tsx` | Bottom sheet container with step management |
| `frontend/src/components/beach-select.tsx` | Beach selection grid (5 beaches) |
| `frontend/src/components/sign-select.tsx` | Natural sign icon grid (multi-select) |
| `frontend/src/components/status-badge.tsx` | Reusable Aman/Tidak Aman badge |
| `frontend/src/lib/api.ts` | Backend API client (fetch helpers) |
| `frontend/src/lib/sse.ts` | SSE connection manager |
| `frontend/src/lib/types.ts` | Shared TypeScript types |
| `frontend/src/lib/constants.ts` | Beach list, LIK codes, BMKG thresholds |
| `frontend/public/manifest.json` | PWA manifest |
| `frontend/public/sw.js` | Service worker (cache-first for shell) |

### Modified Backend Files

| File | Change |
|---|---|
| `disaster-backend/src/index.ts` | Mount new bmkg and alerts routes |
| `disaster-backend/src/config.ts` | Add BMKG-related config vars |

---

## Task 1: Backend — Add BMKG Config

**Files:** `disaster-backend/src/config.ts`

**What:** Add configuration constants for BMKG data sources.

```ts
export const BMKG_CACHE_TTL_SECONDS = Number(process.env.BMKG_CACHE_TTL_SECONDS ?? 30 * 60); // 30 minutes
export const BMKG_MARITIM_URL = process.env.BMKG_MARITIM_URL ?? "https://www.bmkg.go.id/cuaca/maritim/P.N.02";
export const BMKG_DATA_CAP_GIT = process.env.BMKG_DATA_CAP_GIT ?? "https://raw.githubusercontent.com/infoBMKG/data-cap/main/";
export const BMKG_DATA_CUACA_GIT = process.env.BMKG_DATA_CUACA_GIT ?? "https://raw.githubusercontent.com/infoBMKG/data-cuaca/main/";
```

**Verify:** `bun run src/index.ts` starts without errors.

---

## Task 2: Backend — Create BMKG Fetcher

**Files:** `disaster-backend/src/lib/bmkg-fetch.ts` (new)

**What:** Module that fetches BMKG weather/wave data and caches results in Redis.

**Functions:**
- `getBmkgData(beachLocation: string): Promise<BmkgData>` — returns cached data or fetches fresh
- Uses Redis hash `bmkg:data:{beach}` with TTL for caching
- Fetches maritime weather page (webfetch) and parses wave height, wind speed, weather condition
- Maps beach location to BMKG area code

**BMKG Data shape:**
```ts
type BmkgData = {
  beach: string;
  weather: string;        // "Cerah", "Berawan", "Hujan Ringan", etc.
  waveHeight: number;     // in meters
  windSpeed: number;      // in km/h
  windDirection: string;  // "Barat", "Timur Laut", etc.
  temperature: number;    // in Celsius
  isSafe: boolean;        // wave < 1.5m AND wind < 30km/h
  fetchedAt: number;      // timestamp
};
```

**Verify:** Unit test that `getBmkgData` returns structured data. Can mock fetch.

---

## Task 3: Backend — Add BMKG Route

**Files:** `disaster-backend/src/routes/bmkg.ts` (new), `disaster-backend/src/index.ts`

**What:** `GET /api/bmkg/:beach` returns BMKG weather data for a beach.

- Validate `:beach` param against `ALLOWED_BEACH_LOCATIONS`
- Call `getBmkgData(beach)` from Task 2
- Return JSON: `{ ok: true, data: BmkgData }`

**Verify:** `curl http://localhost:3000/api/bmkg/pantai_lampuuk` returns structured JSON.

---

## Task 4: Backend — Add Alert Feed Route

**Files:** `disaster-backend/src/routes/alerts.ts` (new), `disaster-backend/src/index.ts`

**What:** `GET /api/alerts?limit=20` returns recent alert events for frontend consumption.

- Read from `ALERTS_STREAM` Redis stream (same as `history.ts`)
- Return simplified alert objects (no experiment IDs, no internal fields)
- Query params: `limit` (default 20, max 50)
- Response shape:
```ts
type AlertFeedItem = {
  alertId: string;
  beachLocation: string;
  riskLevel: string;        // "Safe" | "Unsafe"  
  communityCharacteristics: string;
  actionRecommendation: string;
  signDescription: string;
  triggeredCodes: string[];
  serverTimestamp: number;
};
```

**Verify:** `curl http://localhost:3000/api/alerts?limit=5` returns array of alerts.

---

## Task 5: Frontend — Scaffold Next.js Project

**Files:** `frontend/` (new directory)

**What:** Create Next.js 14+ project with App Router.

```bash
cd D:/Skripsi/gue/peringatancuacav3
npx create-next-app@latest frontend --typescript --tailwind --eslint --app --src-dir --no-import-alias
```

**Then install shadcn/ui:**
```bash
cd frontend
npx shadcn@latest init
npx shadcn@latest add button card sheet toast badge
```

**Additional deps:**
```bash
npm install lucide-react
```

**Verify:** `npm run dev` starts at localhost:3001 (to avoid conflict with backend on 3000).

---

## Task 6: Frontend — Configure Theme and Constants

**Files:**
- `frontend/src/app/globals.css` — add custom theme colors from spec
- `frontend/src/lib/types.ts` — shared types
- `frontend/src/lib/constants.ts` — beach list, LIK codes, BMKG thresholds

**Types (`types.ts`):**
```ts
export type BeachLocation = "pantai_lampuuk" | "pantai_lhoknga" | "pantai_ulee_lheue" | "pantai_depok" | "pantai_samas";

export type AlertFeedItem = {
  alertId: string;
  beachLocation: string;
  riskLevel: string;
  communityCharacteristics: string;
  actionRecommendation: string;
  signDescription: string;
  triggeredCodes: string[];
  serverTimestamp: number;
};

export type BmkgData = {
  beach: string;
  weather: string;
  waveHeight: number;
  windSpeed: number;
  windDirection: string;
  temperature: number;
  isSafe: boolean;
  fetchedAt: number;
};
```

**Constants (`constants.ts`):**
```ts
export const BEACHES = [
  { id: "pantai_lampuuk", name: "Pantai Lampuuk", label: "Lampuuk" },
  { id: "pantai_lhoknga", name: "Pantai Lhoknga", label: "Lhoknga" },
  { id: "pantai_ulee_lheue", name: "Pantai Ulee Lheue", label: "Ulee Lheue" },
  { id: "pantai_depok", name: "Pantai Depok", label: "Depok" },
  { id: "pantai_samas", name: "Pantai Samas", label: "Samas" },
] as const;

export const LIK_SIGNS = [
  { code: "WN-1", label: "Awan turun", icon: "cloud-lightning" },
  { code: "WN-2", label: "Awan bergumpal", icon: "cloud" },
  { code: "WN-3", label: "Kilat", icon: "zap" },
  { code: "WN-4", label: "Ombak besar", icon: "waves" },
  { code: "WN-5", label: "Lumba-lumba", icon: "fish" },
  { code: "WN-6", label: "Burung camar", icon: "bird" },
  { code: "WN-7", label: "Peralihan angin", icon: "wind" },
  { code: "WN-8", label: "Langit merah", icon: "sunset" },
  { code: "WN-9", label: "Bintang redup", icon: "star" },
  { code: "WN-10", label: "Bulan sabit", icon: "moon" },
  { code: "WN-11", label: "Pasang naik", icon: "arrow-up-circle" },
  { code: "WN-12", label: "Arus deras", icon: "arrow-right" },
  { code: "WN-13", label: "Ikan naik", icon: "fish" },
  { code: "WN-14", label: "Udara panas", icon: "thermometer" },
  { code: "WN-15", label: "Gempa kecil", icon: "activity" },
  { code: "WN-16", label: "Bau lumpur", icon: "cloud-fog" },
  { code: "WN-17", label: "Air laut keruh", icon: "droplets" },
  { code: "WN-18", label: "Suara dentuman", icon: "volume-2" },
] as const;

export const WAVE_UNSAFE_THRESHOLD = 1.5; // meters
export const WIND_UNSAFE_THRESHOLD = 30;  // km/h
```

**Verify:** TypeScript compiles without errors.

---

## Task 7: Frontend — API Client and SSE Manager

**Files:**
- `frontend/src/lib/api.ts` — fetch helpers
- `frontend/src/lib/sse.ts` — SSE connection manager

**API Client (`api.ts`):**
```ts
const API_BASE = process.env.NEXT_PUBLIC_API_BASE ?? "http://localhost:3000/api";

export async function submitReport(beachLocation: string, likCodes: string[]): Promise<ReportResult> { ... }
export async function fetchAlerts(limit = 20): Promise<AlertFeedItem[]> { ... }
export async function fetchBmkgData(beach: string): Promise<BmkgData> { ... }
export async function fetchAllBmkgData(): Promise<BmkgData[]> { ... }
```

**SSE Manager (`sse.ts`):**
```ts
export function connectSSE(onAlert: (data: AlertFeedItem) => void): () => void {
  // Connect to /api/sse
  // Parse "alert" events
  // Return disconnect function
}
```

**Verify:** Can call `fetchAlerts()` and get data from running backend.

---

## Task 8: Frontend — Status Badge Component

**File:** `frontend/src/components/status-badge.tsx`

**What:** Reusable badge showing "Aman Melaut" (green) or "Tidak Aman Melaut" (red).

Props: `{ isSafe: boolean; size?: "sm" | "lg" }`

Uses shadcn `Badge` component with custom green/red styling. Large touch target, high contrast.

**Verify:** Renders correctly in Storybook or simple test page.

---

## Task 9: Frontend — Alert Card + Alert Feed

**Files:**
- `frontend/src/components/alert-card.tsx`
- `frontend/src/components/alert-feed.tsx`

**AlertCard:**
- Shows: beach name, timestamp (relative: "5 menit lalu"), risk level badge, sign icons (from triggeredCodes), action recommendation text
- Color-coded left border: red for Unsafe, green for Safe
- Uses shadcn `Card` component

**AlertFeed:**
- Fetches alerts from `GET /api/alerts`
- Connects SSE for real-time updates (prepends new alerts)
- Renders list of AlertCard components
- Empty state: calm wave icon + "Belum ada peringatan saat ini"
- Pull-to-refresh (optional enhancement)

**Verify:** Shows alerts when backend has data. New alerts appear via SSE.

---

## Task 10: Frontend — Weather Card + Weather Cards

**Files:**
- `frontend/src/components/weather-card.tsx`
- `frontend/src/components/weather-cards.tsx`

**WeatherCard:**
- Shows: beach name, weather icon, wave height (big number + "m"), wind speed + direction, temperature
- StatusBadge: "Aman Melaut" / "Tidak Aman Melaut" based on `isSafe` field
- Loading skeleton while fetching
- Error state: "Data tidak tersedia"

**WeatherCards:**
- Grid of WeatherCard, one per beach (5 beaches)
- Fetches all beach data from `GET /api/bmkg/:beach` for each beach
- Auto-refreshes every 30 minutes

**Verify:** Shows weather cards with real BMKG data (or placeholder if backend not running).

---

## Task 11: Frontend — Report Flow (FAB + Sheet + Selectors)

**Files:**
- `frontend/src/components/report-fab.tsx`
- `frontend/src/components/report-sheet.tsx`
- `frontend/src/components/beach-select.tsx`
- `frontend/src/components/sign-select.tsx`

**ReportFAB:**
- Fixed bottom-right button, big round (56px), ocean blue
- Lucide `MessageSquarePlus` icon
- `onClick` opens report sheet

**ReportSheet:**
- shadcn `Sheet` component (slides from bottom)
- Step management: step 1 = beach select, step 2 = sign select, step 3 = confirm
- Back button to go to previous step
- Step indicator dots at top

**BeachSelect:**
- Grid of 5 beach cards (2 columns on mobile)
- Each card: Lucide `MapPin` icon + beach name, large tappable area (min 48px height)
- Selected beach gets highlighted border + blue background
- GPS enhancement: detect location and pre-select nearest beach (optional)

**SignSelect:**
- Icon grid (3 columns on mobile) showing LIK signs
- Each cell: Lucide icon (from LIK_SIGNS mapping) + short label
- Multi-select: tap to toggle, selected gets highlighted border
- "Kirim Laporan" button at bottom (disabled if none selected)

**Submit flow:**
1. Tap "Kirim Laporan" → calls `submitReport(beach, selectedCodes)`
2. Show loading spinner on button
3. On success: toast "Laporan terkirim!", close sheet, reset form
4. On error: toast "Gagal mengirim. Coba lagi.", keep sheet open

**Verify:** Complete 4-tap flow works: FAB → beach → signs → submit.

---

## Task 12: Frontend — Main Page Assembly

**File:** `frontend/src/app/page.tsx`

**What:** Compose all components into single page.

```
[AlertFeed]
[WeatherCards]
[ReportFAB]
```

Layout: vertical scroll, max-width container, mobile-first.

**Verify:** Full page renders with all sections.

---

## Task 13: Frontend — Root Layout

**File:** `frontend/src/app/layout.tsx`

**What:**
- Set metadata (title: "Peringatan Dini Bencana", description, lang: "id")
- Import `globals.css`
- Link to `manifest.json`
- Set viewport for mobile
- Register service worker via `<script>` tag

**Verify:** Page loads with correct title and metadata.

---

## Task 14: Frontend — Silent PWA (Manifest + Service Worker)

**Files:**
- `frontend/public/manifest.json`
- `frontend/public/sw.js`

**Manifest:**
```json
{
  "name": "Peringatan Dini Bencana",
  "short_name": "Peringatan",
  "description": "Sistem peringatan dini bencana berbasis pengetahuan lokal",
  "start_url": "/",
  "display": "standalone",
  "background_color": "#F3F4F6",
  "theme_color": "#3B82F6",
  "lang": "id",
  "icons": [...]
}
```

**Service Worker:**
- Cache-first strategy for static assets (HTML, CSS, JS, icons)
- Network-first for API calls (bypass cache)
- Stale-while-revalidate for weather data
- No install prompt displayed

**Verify:** DevTools > Application > Service Workers shows registered SW. Static assets load from cache on reload.

---

## Task 15: Frontend — Backend CORS and Proxy Setup

**Files:** `frontend/next.config.js`

**What:** Configure Next.js rewrites to proxy API calls in development, avoiding CORS issues.

```js
module.exports = {
  async rewrites() {
    return [
      {
        source: "/api/:path*",
        destination: "http://localhost:3000/api/:path*",
      },
    ];
  },
};
```

This way `NEXT_PUBLIC_API_BASE` can just be `/api` and all requests go through Next.js proxy.

**Verify:** Frontend can fetch `/api/alerts` without CORS errors.

---

## Task 16: Integration Test — Full Flow

**What:** Manual end-to-end test of the complete system.

1. Start Redis, backend, frontend
2. Open frontend in browser
3. Verify alert feed loads (or shows empty state)
4. Verify weather cards load with BMKG data
5. Tap FAB → select beach → select signs → submit
6. Verify report appears in backend logs
7. If threshold met, verify alert appears in feed via SSE
8. Test offline: disable network → page loads from cache → report shows "Tidak ada koneksi"

**Verify:** All steps pass.

---

## Dependency Graph

```
Task 1 (config) ─┐
                 ├─ Task 2 (BMKG fetcher) ── Task 3 (BMKG route)
                 │
Task 4 (alerts route) ──────────────────────────────────┐
                                                        │
Task 5 (scaffold Next.js) ── Task 6 (theme/constants) ──┤
                                                        │
Task 7 (API client + SSE) ──────────────────────────────┤
                                                        │
Task 8 (status badge) ── Task 10 (weather cards) ───────┤
                                                        │
Task 9 (alert feed) ────────────────────────────────────┤
                                                        │
Task 11 (report flow) ──────────────────────────────────┤
                                                        │
Task 12 (main page) ────────────────────────────────────┤
Task 13 (root layout) ──────────────────────────────────┤
Task 14 (PWA manifest + SW) ────────────────────────────┤
Task 15 (CORS/proxy) ───────────────────────────────────┘
                                                        │
                                            Task 16 (integration test)
```

Tasks 1-4 (backend) can run in parallel with Tasks 5-7 (frontend scaffold).
Tasks 8-11 (components) depend on 5-7.
Task 12-15 (assembly) depends on 8-11.
Task 16 depends on everything.
