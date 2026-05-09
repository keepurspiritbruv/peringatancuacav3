# Implementation Plan: Lapor Cuaca Redesign + PWA Push Notifications

## Context

This plan implements the design spec at `docs/superpowers/specs/2026-05-09-lapor-cuaca-redesign-pwa-notifications-design.md`.

The engineer has zero context. All file paths are relative to `frontend/`.

**Design aesthetic:** "Laut Tenang" — Warm Coastal Minimal (navy/ocean/sand/amber). Fonts: Outfit (display) + Plus Jakarta Sans (body). Large touch targets (min 60px), icon-first, zero typing required.

**Trusted LIK codes only:** WN-1 through WN-9 + WN-13 (10 codes total). These are defined in `src/lib/trusted-signs.ts`.

## File Structure

### New files:
| File | Purpose |
|------|---------|
| `src/lib/observation-data.ts` | 3-level observation catalog (Category > Attribute Group > Observation) — only observations that map to trusted WN codes |
| `src/lib/ml-code-extractor.ts` | Converts selected observations → trusted WN codes using decision tree logic |
| `src/hooks/use-push-notifications.ts` | Push subscription management hook (subscribe/unsubscribe/status) |
| `src/components/notification-card.tsx` | Push notification toggle UI card for homepage |
| `src/components/observation-picker.tsx` | Step 2-4 of lapor wizard (category > attribute > condition selection) |
| `src/components/observation-summary.tsx` | Step 5 of lapor wizard (review selected observations before submit) |

### Modified files:
| File | Change |
|------|--------|
| `src/app/lapor/page.tsx` | Replace 2-step wizard with new 5-step flow |
| `src/app/page.tsx` | Add NotificationCard to homepage |
| `src/lib/api.ts` | Add push API functions (getVapidKey, subscribe, unsubscribe) |
| `public/sw.js` | Add push event handler, IndexedDB, notification click handler |
| `src/lib/types.ts` | Add IObservation type |

### Deleted files:
| File | Reason |
|------|--------|
| `src/components/sign-select.tsx` | Replaced by observation-picker.tsx |

---

## Tasks

### Task 1: Create observation data catalog

**File:** `src/lib/observation-data.ts`

Create the 3-level observation hierarchy. Only include observations that map to the 10 trusted WN codes (WN-1 through WN-9 + WN-13). Port from SAMUDRA-fe `observationData.ts` but filtered to trusted-only.

**Structure:**
```ts
export interface IObservation {
  label: string;       // e.g. "Awan turun merendah"
  attribute: string;   // e.g. "Cloud"
  object: string;      // e.g. "Cloud Pattern"
  value: string;       // e.g. "Descending Clusters"
}

export type ObservationData = Record<string, Record<string, IObservation[]>>;

export const OBSERVATION_DATA: ObservationData = { ... };
export const CATEGORY_LIST = [ ... ]; // { id, label, icon }
```

**Categories and observations (trusted WN codes only):**

- **Kondisi Laut & Gempa** (🌊)
  - Air Laut & Ombak: "Ombak tiba-tiba membesar" (→ WN-4)
  - Lumba-lumba: "Mengawal perahu" (→ WN-5)

- **Cuaca, Angin & Awan** (☁️)
  - Awan: "Awan turun merendah" (→ WN-1), "Awan terlihat menyatu" (→ WN-2)
  - Angin & Cuaca: "Transisi musim angin" (→ WN-7), "Langit merah saat senja" (→ WN-8)
  - Petir: "Petir menyambar satu sisi" (→ WN-3)

- **Bintang & Bulan** (🌌)
  - Bintang: "Bintang redup/tidak terlihat" (→ WN-9)

- **Tanda dari Hewan** (🐋)
  - Ikan: "Ikan naik ke permukaan" (→ WN-13)
  - Burung Camar: "Terbang tergesa-gesa" (→ WN-6 partial, needs sound too for AND rule)

Also export `CATEGORY_LIST` with `{ id, label, icon }` for each top-level category.

**Verification:** Each observation should map to exactly one WN code. Total observations ~10-12 items across 4 categories.

---

### Task 2: Create ML code extractor

**File:** `src/lib/ml-code-extractor.ts`

Port decision tree logic from SAMUDRA-fe `mlCodeExtractor.ts`, but ONLY produce the 10 trusted WN codes. Ignore all Ts-* codes.

**Function signature:**
```ts
import type { IObservation } from './observation-data';
export function extractLikCodes(observations: IObservation[]): string[];
```

**Mapping rules (from SAMUDRA-fe, trusted-only):**

Simple rules (single observation):
- `Cloud + Cloud Pattern + Descending Clusters` → `WN-1`
- `Cloud + Cloud Pattern + Merging Clusters` → `WN-2`
- `Lightning + Lightning Activity + Single-Sided` → `WN-3`
- `Sea + Wave Pattern + Small and Frequent (to) Large and Close` → `WN-4`
- `Dolphin + Dolphin Activity + Approaching/Guiding Boat` → `WN-5`
- `Atmosphere + Wind/Monsoon Season + West-to-East Transition` → `WN-7`
- `Atmosphere + Weather Condition + Red Sky/Sunset` → `WN-8`
- `Star + Star Condition + Dim/Not Visible` → `WN-9`
- `Fish + Fish Activity + Surfacing Unusually` → `WN-13`

Complex AND rule:
- `Seagull Movement = Hasty Flying` AND `Seagull Sound = Loud Calling` → `WN-6`

**Important:** The output codes must match the EXACT format in `trusted-signs.ts`: uppercase `WN-X` (not `Wn-X`).

**Test:** Write unit tests for each rule including the AND rule for WN-6.

---

### Task 3: Add IObservation type

**File:** `src/lib/types.ts`

Add:
```ts
export interface IObservation {
  label: string;
  attribute: string;
  object: string;
  value: string;
}
```

---

### Task 4: Create observation picker component

**File:** `src/components/observation-picker.tsx`

A 3-step sub-wizard within the lapor page (category > attribute > condition). This is the core UX improvement.

**Props:**
```ts
type ObservationPickerProps = {
  observations: IObservation[];
  onObservationsChange: (obs: IObservation[]) => void;
  onComplete: () => void;
  onBack: () => void;
};
```

**Steps:**
1. **Category selection** — Grid of 4 large cards with emoji + label. Min 60px touch target.
2. **Attribute group selection** — List of attribute groups within selected category. Back button to return to categories.
3. **Condition selection** — Multi-select checklist of observations within selected attribute group. User can go back to pick more groups/categories. "Selesai memilih" button when done.

**UI style:** Follow "Laut Tenang" design — navy cards on sand background, ocean accent for selected state, rounded-2xl corners, emoji icons. Clean spacing. No generic borders.

**Key UX:** Allow user to browse multiple categories/groups before finishing. Accumulate all selected observations. Show a floating badge/counter of how many observations selected so far.

---

### Task 5: Create observation summary component

**File:** `src/components/observation-summary.tsx`

Summary screen showing all selected observations before submit.

**Props:**
```ts
type ObservationSummaryProps = {
  observations: IObservation[];
  beach: string;
  onRemove: (obs: IObservation) => void;
  onBack: () => void;
  onSubmit: () => void;
  submitting: boolean;
};
```

**UI:**
- Show beach name at top
- List selected observations as removable chips/cards, grouped by category
- Each chip has label + X button to remove
- Big "KIRIM LAPORAN" button at bottom (ocean blue, full width)
- Show observation count badge
- If no observations, show "Pilih tanda alam terlebih dahulu" with back button

---

### Task 6: Rewrite lapor page

**File:** `src/app/lapor/page.tsx`

Replace current 2-step wizard with new flow:

**Steps:**
1. **Select Beach** — Same BeachSelect grid (unchanged)
2. **Observation Picker** — Use `<ObservationPicker>` component
3. **Summary** — Use `<ObservationSummary>` component
4. **Submit** — Convert observations to LIK codes via `extractLikCodes()`, then call `submitReport()` from api.ts
5. **Success** — Same green full-screen success overlay (unchanged)

**Keep existing:** ArrowLeft back button, success overlay, toast error handling, submitting state.

**Flow state:**
```ts
type Step = 'beach' | 'observe' | 'summary' | 'success';
```

**On submit:**
```ts
const codes = extractLikCodes(selectedObservations);
await submitReport(beach, codes);
```

Delete import of `SignSelect`. Import `ObservationPicker`, `ObservationSummary`, `extractLikCodes` instead.

---

### Task 7: Add push API functions

**File:** `src/lib/api.ts`

Add three functions after existing ones:

```ts
export async function getVapidPublicKey(): Promise<string> { ... }
export async function subscribePush(subscription: PushSubscriptionJSON, beachLocation: string): Promise<void> { ... }
export async function unsubscribePush(endpoint: string): Promise<void> { ... }
```

Endpoints:
- `GET /api/push/vapid-public-key` → returns `{ publicKey: string }` or plain text
- `POST /api/push/subscribe` → `{ subscription, beach_location }`
- `POST /api/push/unsubscribe` → `{ endpoint }`

Include proper error handling (throw on !ok).

---

### Task 8: Create push notification hook

**File:** `src/hooks/use-push-notifications.ts`

Port logic from SAMUDRA-fe `usePushNotifications.ts`.

```ts
export function usePushNotifications(selectedBeach?: string) {
  // Returns: { permission, isSupported, isSubscribed, isLoading, error, subscribe, unsubscribe }
}
```

**Logic:**
1. Check `"serviceWorker" in navigator && "PushManager" in window`
2. On mount, check `navigator.serviceWorker.ready` then `registration.pushManager.getSubscription()` to see if already subscribed
3. `subscribe()`: get VAPID key → `registration.pushManager.subscribe()` → POST to backend → store beach in IndexedDB
4. `unsubscribe()`: `subscription.unsubscribe()` → POST to backend → clear IndexedDB
5. Track `Notification.permission` state

---

### Task 9: Create notification card component

**File:** `src/components/notification-card.tsx`

A card for the homepage, similar style to existing cards in `summary-cards.tsx`.

**Props:**
```ts
type NotificationCardProps = {
  selectedBeach?: string | null;
};
```

**States:**
- **Loading:** Skeleton placeholder (animate-pulse)
- **Not supported:** Hidden (return null)
- **Default (not subscribed):** Bell icon + "Aktifkan Notifikasi" text. Tap calls `subscribe()`.
- **Subscribed:** Bell icon (filled/ringing) + "Notifikasi Aktif" + beach label. Tap calls `unsubscribe()`.
- **Denied:** BellOff icon + "Notifikasi Diblokir" + muted text explaining how to re-enable in browser settings.

**UI:** Card with navy border, sand bg, icon-left layout. Match existing card style from `summary-cards.tsx`.

---

### Task 10: Add notification card to homepage

**File:** `src/app/page.tsx`

Import and render `<NotificationCard>` in the homepage layout.

**Placement:** After `<SummaryCards>`, before `<ReportCTA>`. Pass the nearest beach from location state if available.

The homepage currently renders:
```
AlertBanner → SummaryCards → ReportCTA → AlertFeed → WeatherFooter
```

Change to:
```
AlertBanner → SummaryCards → NotificationCard → ReportCTA → AlertFeed → WeatherFooter
```

---

### Task 11: Upgrade service worker

**File:** `public/sw.js`

Add to existing service worker (keep all current cache logic):

1. **Push event handler:**
```js
self.addEventListener("push", (event) => {
  const payload = event.data?.json() ?? {};
  // Check if beach matches user's selected beach from IndexedDB
  // Show notification with title, body, tag
});
```

2. **IndexedDB helpers** (inline in sw.js):
- `openDb()` — opens "peringatan-db" v1 with "preferences" store
- `setPreference(key, value)` / `getPreference(key)`

3. **Notification click handler:**
```js
self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = event.notification.data?.url ?? "/";
  event.waitUntil(clients.openWindow(url));
});
```

4. **Push subscription change handler:**
```js
self.addEventListener("pushsubscriptionchange", (event) => {
  // Re-subscribe and update backend
});
```

---

### Task 12: Delete unused sign-select component

Delete `src/components/sign-select.tsx`.

Verify no other files import it. The lapor page will no longer use it. If homepage or other pages reference it, remove those imports too.

---

### Task 13: Build verification

Run `npx next build` and verify zero errors. Fix any type errors or missing imports.

---

## Execution Order

Tasks must be done in this order due to dependencies:

1. Task 3 (types) → no deps
2. Task 1 (observation data) → depends on Task 3
3. Task 2 (ml code extractor) → depends on Task 1
4. Task 4 (observation picker) → depends on Task 1
5. Task 5 (observation summary) → depends on Task 1
6. Task 6 (lapor page rewrite) → depends on Tasks 2, 4, 5
7. Task 7 (push API) → no deps (parallel with 1-5)
8. Task 8 (push hook) → depends on Task 7
9. Task 9 (notification card) → depends on Task 8
10. Task 10 (homepage) → depends on Task 9
11. Task 11 (service worker) → no deps (parallel)
12. Task 12 (cleanup) → depends on Task 6
13. Task 13 (build) → depends on all

**Parallelizable:** Tasks 7+8+9+10 can run parallel with Tasks 1-6. Task 11 can run anytime.

## Commit Strategy

- Commit after each task or logical group
- Suggested commits:
  1. "feat: add observation data catalog and ML code extractor"
  2. "feat: add observation picker and summary components"
  3. "feat: rewrite lapor page with 3-level observation flow"
  4. "feat: add PWA push notification support"
  5. "feat: upgrade service worker with push handling"
  6. "chore: cleanup unused sign-select component"
