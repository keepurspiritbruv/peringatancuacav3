# Lapor Cuaca Redesign + PWA Push Notifications

## Summary

Redesign the Lapor Cuaca page from a simple 10-icon grid to a 3-level hierarchical observation system (Category > Attribute Group > Condition) matching the SAMUDRA-fe reference. Add PWA push notification subscription (toggle on/off per beach) and GPS location permission toggle to the homepage.

## Scope

1. **Lapor Cuaca Redesign** — Replace the current 2-step wizard (beach select > sign grid) with a 3-level observation picker + summary step
2. **PWA Push Notifications** — Add push notification subscription UI on homepage (per-beach toggle using VAPID keys from backend)
3. **Service Worker Upgrade** — Upgrade `sw.js` to handle push events, IndexedDB preferences, and notification click routing

Only trusted LIK codes are accepted: WN-1 through WN-9 + WN-13 (10 codes total). No Ts-* codes. The ML code extractor filters observations to only produce trusted codes.

Out of scope: form fields for user demographics (age, interaction level, etc.), backend push API changes, ML model changes.

## Lapor Cuaca Redesign

### Current Flow (being replaced)

1. Step 1: Select beach (5 beaches grid)
2. Step 2: Select signs (10 trusted signs icon grid, WN-1 through WN-13)
3. Submit directly with `lik_codes`

### New Flow

1. **Step 1: Select Beach** — Same 5-beach grid (unchanged)
2. **Step 2: Select Category** — 4 categories with emoji icons:
   - Kondisi Laut & Gempa
   - Cuaca, Angin & Awan
   - Bintang & Bulan
   - Tanda dari Hewan
3. **Step 3: Select Attribute Group** — Sub-categories within selected category (e.g., "Air Laut & Ombak", "Getaran Bumi", "Awan", "Angin & Cuaca", "Petir", etc.)
4. **Step 4: Select Conditions** — Multi-select checklist of specific observations (e.g., "Air laut sangat tenang", "Ombak tiba-tiba membesar")
5. **Step 5: Summary** — Review all selected observations, grouped by category. Can remove individual items. Submit button.
6. **On Submit** — Convert observations to LIK codes via `mlCodeExtractor` decision tree logic, then POST to `/api/report`

### Observation Data Structure

Adopted from SAMUDRA-fe `observationData.ts`:

```ts
interface IObservation {
  label: string;      // Display text e.g. "Air laut sangat tenang"
  attribute: string;  // ML attribute e.g. "Sea"
  object: string;     // ML object e.g. "Tidal Movement"
  value: string;      // ML value e.g. "Calm (no high or low tide)"
}
```

Organized as `Record<category, Record<attributeGroup, IObservation[]>>`.

Full observation catalog (~30+ items across 4 categories, 11 attribute groups):

- **Kondisi Laut & Gempa** (2 groups, 8 items): Air Laut & Ombak (7), Getaran Bumi (1)
- **Cuaca, Angin & Awan** (3 groups, 12 items): Awan (3), Angin & Cuaca (8), Petir (1)
- **Bintang & Bulan** (2 groups, 7 items): Bintang (6), Bulan (1)
- **Tanda dari Hewan** (5 groups, 6 items): Burung Camar (2), Lumba-lumba (1), Paus (1), Serangga (1), Hewan Peliharaan (1)

### LIK Code Extraction

Ported from SAMUDRA-fe `mlCodeExtractor.ts`. Decision tree with AND/OR rules:

- Simple: single observation → single code (e.g., "Awan turun merendah" → `Wn-1`)
- Complex AND: requires multiple observations (e.g., Rumbling + Felt Earthquake → `Ts-2`)
- Complex OR: any of several observations (e.g., Rain OR Thick Clouds + East Wind → `Wn-9`)

Code mapping table — **trusted codes only** (filtered from SAMUDRA-fe logic):

| Code | Trigger |
|------|---------|
| Wn-1 | Awan turun merendah |
| Wn-2 | Awan terlihat menyatu |
| Wn-3 | Petir menyambar satu sisi |
| Wn-4 | Ombak membesar & rapat |
| Wn-5 | Lumba-lumba mengawal perahu |
| Wn-6 | Burung camar terbang tergesa + bersuara nyaring (AND) |
| Wn-7 | Transisi musim angin |
| Wn-8 | Mendung tebal |
| Wn-9 | (Hujan OR Mendung tebal) + Angin Timur (AND+OR) |
| Wn-13 | Bintang tidak terlihat |

Observations that would produce Ts-* codes are still selectable in the UI (fishermen can report what they see), but the extractor silently drops them — only trusted Wn-* codes are sent to the backend. This keeps the UI comprehensive while the backend only processes what the ML model trusts.

### API Contract

No changes to existing backend API. The frontend converts observations to `lik_codes` client-side before calling `POST /api/report` with the same payload:

```json
{
  "beach_location": "pantai_lampuuk",
  "lik_codes": ["WN-1", "WN-4", "WN-9"],
  "channel": "web",
  "clientReportId": "uuid",
  "createdAtClient": 1234567890
}
```

### UI Style

Follows existing "Laut Tenang" design system:
- Same color palette (navy `#0A2540`, ocean `#0EA5E9`, sand `#F5EFE6`, amber `#F59E0B`)
- Same fonts (Outfit headings, Plus Jakarta Sans body)
- Large touch targets (min 60px), icon-first
- Category cards with emoji + label
- Attribute group cards with emoji + label
- Condition items as checkbox-style list with clear labels
- Summary page shows selected observations as removable chips

## PWA Push Notifications

### UI: Notification Card on Homepage

A new card on the homepage (similar to existing "Lokasi Saya" card) that shows push notification status:

- **Not subscribed**: Shows bell icon + "Aktifkan Notifikasi" text. Tap triggers browser permission prompt then subscribes via PushManager.
- **Subscribed**: Shows bell icon (filled) + "Notifikasi Aktif" + beach name. Tap to unsubscribe.
- **Denied**: Shows bell-off icon + "Notifikasi Diblokir" + hint to enable in browser settings.
- **Loading**: Skeleton placeholder.

The card requires a beach to be selected first (via the beach selector on homepage or GPS). Subscription is per-beach — switching beach unsubscribes from old beach and subscribes to new one.

### Subscription Flow

1. User taps "Aktifkan Notifikasi"
2. Browser shows native permission prompt
3. If granted, frontend calls `GET /api/push/vapid-public-key` to get the VAPID public key
4. Frontend calls `registration.pushManager.subscribe()` with the VAPID key
5. Frontend POSTs the subscription object to `POST /api/push/subscribe` with `{ subscription, beach_location }`
6. Service worker stores `selectedBeach` in IndexedDB for push event filtering

### Unsubscribe Flow

1. User taps "Notifikasi Aktif" to toggle off
2. Frontend calls `subscription.unsubscribe()` via PushManager
3. Frontend POSTs to `POST /api/push/unsubscribe` with `{ endpoint }`
4. Service worker clears beach preference from IndexedDB

### Backend API Dependencies

These endpoints must exist on the backend (may already exist from OpenClaw integration):

- `GET /api/push/vapid-public-key` — Returns VAPID public key
- `POST /api/push/subscribe` — Store push subscription + beach
- `POST /api/push/unsubscribe` — Remove push subscription

VAPID keys configured via env vars: `VAPID_SUBJECT`, `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`.

### GPS Location Permission

Already implemented as "Lokasi Saya" card on homepage. No changes needed — just ensure the notification card sits alongside it in the UI.

## Service Worker Upgrade

### Current `sw.js`

Basic cache-first strategy with static asset precaching. No push event handling.

### New `sw.js` Features

1. **Push event handler** — Receives push payload, shows notification with title/body/url/tag
2. **IndexedDB preferences** — Store `selectedBeach` for filtering push events by beach
3. **Notification click handler** — Opens the app URL from push payload
4. **Push subscription change handler** — Updates backend when browser refreshes subscription

Push payload format (from backend):

```json
{
  "title": "Peringatan Cuaca",
  "body": "Gelombang tinggi terdeteksi di Pantai Lampuuk",
  "url": "/",
  "tag": "alert-pantai_lampuuk-123",
  "beach_location": "pantai_lampuuk"
}
```

### Service worker keeps existing features:

- Cache-first for static assets
- Network-first for API calls with offline fallback
- `skipWaiting` + `clients.claim` for instant updates

## Files to Create/Modify

### New files:
- `src/lib/observation-data.ts` — Observation catalog (3-level hierarchy)
- `src/lib/ml-code-extractor.ts` — Decision tree for observation → LIK code mapping
- `src/components/notification-card.tsx` — Push notification toggle UI
- `src/hooks/use-push-notifications.ts` — Push subscription management hook

### Modified files:
- `src/app/lapor/page.tsx` — Rewrite with 5-step wizard (beach > category > attribute > condition > summary)
- `src/app/page.tsx` — Add notification card to homepage
- `src/lib/api.ts` — Add push API functions (getVapidKey, subscribe, unsubscribe)
- `public/sw.js` — Add push event handler, IndexedDB, notification click handler

### Deleted files:
- `src/components/sign-select.tsx` — No longer needed after lapor redesign (only used by old lapor page). Can be deleted.
- `src/lib/trusted-signs.ts` — Keep. Still used by homepage for alert display (sign icons/labels).

## Error Handling

- **Observation selection**: Must select at least 1 observation before submit. Show inline error.
- **Push permission denied**: Show persistent message pointing to browser settings.
- **Network offline during submit**: Show toast "Tidak ada koneksi", keep form state.
- **VAPID key fetch fails**: Show toast "Gagal memuat kunci notifikasi", retry on next tap.
- **Subscription API fails**: Unsubscribe locally, show toast error.

## Testing

- E2E: Lapor flow with full 5-step wizard
- E2E: Push notification card states (default, subscribed, denied)
- Unit: `mlCodeExtractor` decision tree (AND/OR rule correctness)
- Unit: Observation data structure completeness (no missing labels, all categories have groups)
