# Frontend Redesign — Implementation Plan

**Spec:** `docs/superpowers/specs/2026-05-09-frontend-redesign-design.md`

## Scope

Redesign the CuacaPesisir PWA frontend from a generic shadcn dashboard into a distinctive "Laut Tenang" coastal theme. 4 pages, new design system, new components. All backend API connections remain identical.

## File Structure

### New Files
| File | Purpose |
|------|---------|
| `src/components/bottom-nav.tsx` | Fixed 4-tab bottom navigation bar |
| `src/components/alert-banner.tsx` | Unified alert banner (Aman/Bahaya/Loading) |
| `src/components/summary-cards.tsx` | BMKG + Laporan Warga summary cards |
| `src/components/report-cta.tsx` | Inline "LAPOR CUACA SEKARANG" button |
| `src/components/weather-footer.tsx` | BMKG data source footer with per-beach details |
| `src/components/sign-card.tsx` | Individual LIK sign card (Pengetahuan page) |
| `src/lib/trusted-signs.ts` | Array of 10 trusted LIK codes with actions + descriptions |
| `src/lib/beach-coords.ts` | Beach coordinate data for Leaflet map |
| `src/app/lapor/page.tsx` | Full-page report form (2-step) |
| `src/app/peta/page.tsx` | Leaflet map page |
| `src/app/pengetahuan/page.tsx` | LIK signs encyclopedia page |

### Modified Files
| File | Change |
|------|--------|
| `src/app/layout.tsx` | Replace Geist fonts with Outfit + Plus Jakarta Sans, update metadata/theme |
| `src/app/globals.css` | Replace shadcn default colors with Laut Tenang palette |
| `src/app/page.tsx` | Rebuild dashboard with new components |
| `src/lib/constants.ts` | Add beach coordinates, filter LIK_SIGNS to 10 trusted |
| `src/components/alert-feed.tsx` | Update to show 5-item preview with "Lihat Semua" toggle |
| `src/components/alert-card.tsx` | New styling per design system |
| `src/components/beach-select.tsx` | Larger buttons (72px), 2-col, new colors |
| `src/components/sign-select.tsx` | Larger buttons (80px), 2-col, 10 codes only |
| `public/manifest.json` | Update name/theme/background colors |
| `package.json` | Add `leaflet` + `react-leaflet` dependencies |

### Deleted Files
| File | Reason |
|------|--------|
| `src/components/report-fab.tsx` | Replaced by report-cta + /lapor page |
| `src/components/report-sheet.tsx` | Replaced by /lapor page |
| `src/components/weather-cards.tsx` | Replaced by summary-cards + weather-footer |
| `src/components/weather-card.tsx` | Replaced by weather-footer |
| `src/components/status-badge.tsx` | Replaced by inline badge logic in alert-banner |

---

## Tasks

### Task 1: Install new dependencies
**What:** Add Leaflet packages for the Peta page.
**Commands:**
```bash
cd frontend
npm install leaflet react-leaflet
npm install -D @types/leaflet
```
**Verify:** `npm ls leaflet react-leaflet` shows both installed.

---

### Task 2: Update data constants
**What:** Add beach coordinates, create trusted-signs module, update LIK_SIGNS.
**Files:**
- `src/lib/constants.ts` — Add `coords` field to each beach (`{ lat: number, lng: number }`), remove unused LIK codes (WN-10 through WN-18 minus WN-13) from the displayed list
- `src/lib/trusted-signs.ts` — New file. Export `TRUSTED_SIGNS` array with 10 entries. Each entry: `{ code, label, icon, action, description }`. Values from the spec's Pengetahuan table.
- `src/lib/beach-coords.ts` — New file. Export `BEACH_COORDS` as a `Record<string, { lat: number, lng: number }>` for easy lookup.

**Beach coordinates:**
```
pantai_lampuuk:   { lat: 5.4833, lng: 95.1333 }
pantai_lhoknga:   { lat: 5.4667, lng: 95.1167 }
pantai_ulee_lheue:{ lat: 5.5500, lng: 95.3167 }
pantai_depok:     { lat: -8.0225, lng: 110.3300 }
pantai_samas:     { lat: -8.0400, lng: 110.3100 }
```

**Test:** Unit test `trusted-signs.ts` — verify it has exactly 10 entries, all codes are WN-1 through WN-9 + WN-13, each has non-empty action and description.

---

### Task 3: Replace fonts and update metadata
**What:** Swap Geist for Outfit + Plus Jakarta Sans in layout.tsx. Update PWA manifest.
**Files:**
- `src/app/layout.tsx` — Import `Outfit` and `Plus_Jakarta_Sans` from `next/font/google`. Apply Outfit as `--font-heading` and Plus Jakarta Sans as `--font-sans`. Update `metadata.title` to "CuacaPesisir", `metadata.description` to "Sistem peringatan cuaca pesisir untuk nelayan", `appleWebApp.title` to "CuacaPesisir". Update `viewport.themeColor` to `#0A2540`.
- `public/manifest.json` — name: "CuacaPesisir", short_name: "CuacaPesisir", theme_color: "#0A2540", background_color: "#F8F6F0".

**Verify:** `npm run build` passes. No Geist font references remain.

---

### Task 4: Replace color system in globals.css
**What:** Replace shadcn default oklch colors with the Laut Tenang hex palette.
**File:** `src/app/globals.css`

Replace the `:root` CSS variables with:
```css
:root {
  --background: #F8F6F0;
  --foreground: #0A2540;
  --card: #FFFFFF;
  --card-foreground: #0A2540;
  --popover: #FFFFFF;
  --popover-foreground: #0A2540;
  --primary: #0A2540;
  --primary-foreground: #FFFFFF;
  --secondary: #E2E8F0;
  --secondary-foreground: #0A2540;
  --muted: #E2E8F0;
  --muted-foreground: #475569;
  --accent: #0EA5E9;
  --accent-foreground: #FFFFFF;
  --destructive: #DC2626;
  --border: #CBD5E1;
  --input: #CBD5E1;
  --ring: #0EA5E9;
  --radius: 1rem;
}
```

Remove the `.dark` block entirely (no dark mode needed). Remove sidebar variables (unused). Keep the `@theme inline` block but ensure it maps to the new variables.

**Verify:** `npm run build` passes. Existing shadcn components render with new colors.

---

### Task 5: Build BottomNav component
**What:** Fixed 4-tab navigation bar.
**File:** `src/components/bottom-nav.tsx`

Client component. Uses `usePathname()` from `next/navigation` to determine active tab.
4 tabs: Beranda (`Home`, `/`), Lapor (`MessageSquarePlus`, `/lapor`), Peta (`Map`, `/peta`), Pengetahuan (`BookOpen`, `/pengetahuan`).

Styling: `fixed bottom-0 left-0 right-0 z-50`, bg `#0A2540`, height 64px + safe area, flex row, each tab is `flex-1` with centered column (icon 24px + label 12px). Active: `#0EA5E9`, Inactive: `#94A3B8`. Touch target full width x 64px.

**Test:** Unit test — renders 4 tabs, correct icon for each, correct active class for `/` path.

---

### Task 6: Integrate BottomNav into layout
**What:** Add BottomNav to the root layout so it appears on all pages.
**File:** `src/app/layout.tsx`

- Import and render `<BottomNav />` after `{children}`
- Add `pb-20` (80px bottom padding) to the body/main content area so content doesn't hide behind the nav
- The `max-w-2xl mx-auto` constraint stays on individual pages, not the layout

**Verify:** `npm run build` passes. Bottom nav visible on all routes.

---

### Task 7: Build AlertBanner component
**What:** Unified alert banner that derives risk from alert feed.
**File:** `src/components/alert-banner.tsx`

Client component. Props: `alerts: AlertFeedItem[]`.

Logic: scan all alerts. If ANY has `riskLevel` containing "unsafe", "tidak aman", or "high" → Bahaya. If alerts array empty and still loading → Loading. Otherwise → Aman.

States:
- **Aman:** bg `#16A34A`, ShieldCheck icon 40px white, "AMAN UNTUK MELAUT" 24px bold white, subtitle "BMKG: Aman. Tanda Alam: Aman." 14px white/70
- **Bahaya:** bg `#DC2626`, `animate-pulse`, TriangleAlert icon 40px white, "BAHAYA! JANGAN MELAUT" 24px bold white, subtitle with danger source
- **Loading:** bg `#0EA5E9`, Loader2 icon 40px white animate-spin, "Memuat data..."

Styling: full-width, `rounded-2xl`, `p-5`, flex column centered, `gap-2`.

**Test:** Unit tests — (a) empty alerts → Aman, (b) alert with "unsafe" → Bahaya, (c) alert with "tidak aman" → Bahaya, (d) alert with "high" → Bahaya, (e) all safe alerts → Aman.

---

### Task 8: Build SummaryCards component
**What:** BMKG + Laporan Warga horizontal cards.
**File:** `src/components/summary-cards.tsx`

Client component. Props: `bmkgData: BmkgData[]`, `alertCount: number`.

Two cards side by side (`grid grid-cols-2 gap-3`):

**BMKG card:** White bg, `rounded-2xl shadow-sm p-4`. "BMKG" label 12px slate. CloudSun icon 32px teal. Horizontal scroll of beach pills — each pill: `{beach.label} {data.waveHeight}m {data.temperature}°` in a `flex gap-2 overflow-x-auto` row.

**Laporan card:** White bg, `rounded-2xl shadow-sm p-4`. "LAPORAN WARGA" label 12px slate. Eye icon 32px teal. Large number `alertCount` in 32px bold navy. "Laporan hari ini" subtitle 14px slate.

**Test:** Unit test — renders both cards, shows correct alert count, shows BMKG data pills.

---

### Task 9: Build ReportCTA component
**What:** Inline report call-to-action button.
**File:** `src/components/report-cta.tsx`

Simple component. Uses `next/link` to navigate to `/lapor`.
Full-width button: bg `#F59E0B`, rounded-2xl, h-14, `shadow-md`, `active:scale-[0.98] transition-transform`.
Content: Megaphone icon (20px, white) + "LAPOR CUACA SEKARANG" in Outfit Bold 18px white.

**Test:** Renders correctly, link points to `/lapor`.

---

### Task 10: Update AlertFeed and AlertCard
**What:** Show 5-item preview with "Lihat Semua" toggle. New styling.
**Files:**
- `src/components/alert-feed.tsx` — Add `showAll` state (boolean, default false). Pass `showAll ? alerts : alerts.slice(0, 5)` to the render. Add "Lihat Semua" / "Tampilkan Sedikit" toggle button at bottom (only if alerts.length > 5).
- `src/components/alert-card.tsx` — Restyle: white bg, `rounded-xl shadow-sm`, left border 4px (green/red). Beach name 14px semibold. Time 12px muted. Aman/Tidak Aman badge with ShieldCheck/ShieldAlert icons. Triggered codes as small pills (max 3, then "+N"). Action recommendation 12px muted.

**Test:** Unit tests — (a) shows 5 items by default, (b) "Lihat Semua" shows all, (c) "Tampilkan Sedikit" goes back to 5, (d) no toggle when <= 5 items.

---

### Task 11: Build WeatherFooter component
**What:** BMKG data source footer with per-beach weather details.
**File:** `src/components/weather-footer.tsx`

Client component. Props: `bmkgData: BmkgData[]`.

Header: "Sumber Data: BMKG" with Cloud icon 20px. Disclaimer text 12px muted.

Per-beach list: vertical stack of compact cards. Each card: white bg, `rounded-xl shadow-sm p-3`, shows:
- Beach name (16px semibold)
- Weather icon (Cloud) + weather text (14px)
- Wave icon + "{waveHeight}m" | Wind icon + "{windSpeed} km/h {windDirection}" | Thermometer icon + "{temperature}°C" — all on one or two lines
- Aman/Tidak Aman badge (green/red pill)

**Test:** Renders beach list, shows "Data tidak tersedia" for null entries, shows correct weather values.

---

### Task 12: Rebuild Dashboard page
**What:** Compose all new components into the Beranda page.
**File:** `src/app/page.tsx`

Import and compose: AlertBanner, SummaryCards, ReportCTA, AlertFeed, WeatherFooter.
Fetch data with `useEffect`: `fetchAlerts(20)` and `fetchAllBmkgData()`.
Pass data to components. Wrap in `<main className="flex flex-col gap-6 px-4 py-4 max-w-2xl mx-auto pb-24">`.

Data flow:
- `alerts` state → AlertBanner (for risk derivation) + AlertFeed (for list) + SummaryCards (alert count)
- `bmkgData` state → SummaryCards (BMKG card) + WeatherFooter (per-beach details)

**Test:** E2E test — dashboard renders with alert banner, summary cards, CTA button, alert feed, weather footer.

---

### Task 13: Build Lapor page (full-page report form)
**What:** Replace FAB + sheet with a dedicated report page.
**File:** `src/app/lapor/page.tsx`

Client component. 2-step wizard with `step` state (1 or 2).

**Step 1 (Pilih Pantai):**
- "Langkah 1 dari 2" indicator with 2 dots (10px, active = teal, inactive = slate/30)
- "Pilih Pantai Anda" heading 20px Outfit Bold
- Reuse BeachSelect component (updated in Task 14)
- Tapping a beach sets `beach` state and advances to step 2

**Step 2 (Pilih Tanda Alam):**
- Back arrow button (ArrowLeft icon) + "Pilih Tanda Alam" heading
- "Pilih yang Anda lihat" subtitle
- Reuse SignSelect component (updated in Task 15)
- Submit button: full-width amber, "KIRIM LAPORAN ({count})", disabled when count=0 or submitting
- Calls `submitReport(beach, selectedCodes)`
- Success: green overlay with ShieldCheck + "Laporan Terkirim!", auto-dismiss 2s, reset to step 1
- Error: sonner toast "Gagal mengirim. Coba lagi." / "Tidak ada koneksi"

**Test:** E2E test — navigate to /lapor, select beach, select signs, submit, see success overlay.

---

### Task 14: Update BeachSelect for Lapor page
**What:** Larger buttons, 2-column grid, new colors.
**File:** `src/components/beach-select.tsx`

Changes:
- Grid: `grid grid-cols-2 gap-3` (already 2-col, keep)
- Button min-height: 72px (was 72px, keep)
- Border: `border-2 border-[#0A2540]` (navy)
- Selected: `bg-[#0EA5E9] text-white border-[#0EA5E9] scale-[1.02]`
- Unselected: `bg-white text-[#0A2540] hover:border-[#0EA5E9]/50`
- MapPin icon: 28px (was 24px)
- Label: 16px semibold (was 14px)
- Rounded: `rounded-2xl` (was `rounded-xl`)

**Test:** Renders 5 beaches, selected state applies correct classes.

---

### Task 15: Update SignSelect for Lapor page
**What:** Larger buttons, 2-column grid, 10 trusted codes only.
**File:** `src/components/sign-select.tsx`

Changes:
- Data source: import `TRUSTED_SIGNS` from `@/lib/trusted-signs` instead of `LIK_SIGNS`
- Grid: `grid grid-cols-2 gap-3` (was `grid-cols-3`)
- Button min-height: 80px (was 64px)
- Border: `border-2 border-[#0A2540]`
- Selected: `bg-[#0EA5E9] text-white border-[#0EA5E9]` + Check icon overlay
- Unselected: `bg-white text-[#0A2540] hover:border-[#0EA5E9]/50`
- Icon: 28px (was 20px)
- Label: 14px semibold (was 12px)
- Code: 12px muted badge below label
- Rounded: `rounded-2xl`

**Test:** Renders exactly 10 signs, multi-select works, correct icons.

---

### Task 16: Delete old report components
**What:** Remove FAB and sheet components that are no longer used.
**Files to delete:**
- `src/components/report-fab.tsx`
- `src/components/report-sheet.tsx`

Verify no remaining imports reference these files. `npm run build` must pass.

---

### Task 17: Build Peta (Map) page
**What:** Full-screen Leaflet map with beach markers.
**File:** `src/app/peta/page.tsx`

Client component. Uses `react-leaflet` (MapContainer, TileLayer, Marker, Popup).

**Important:** Leaflet requires `window` object. Must use `dynamic` import with `ssr: false` or wrap in a client-only check.

Implementation approach:
1. Create a `MapInner` component that renders the Leaflet map
2. In `page.tsx`, use `next/dynamic` with `{ ssr: false }` to import `MapInner`
3. Fetch `fetchAllBmkgData()` and `fetchAlerts()` on mount
4. Combine data to determine each beach's safety status
5. Render markers with custom `L.divIcon` (teal circle + white checkmark for aman, red circle + white X for tidak aman)
6. Popups on tap: beach name, weather data, status badge, last updated

Map config:
- Center: `[-8.0225, 110.3300]` (Pantai Depok)
- Zoom: 11
- Tile: `https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png`
- Height: `calc(100vh - 128px - 64px)` (minus header + bottom nav)

Include Leaflet CSS: `import 'leaflet/dist/leaflet.css'` in the component.

**Beach markers:** Map over `BEACHES`, look up coordinates from `BEACH_COORDS`, look up BMKG data and alert data for each beach.

**Test:** E2E test — map renders, markers visible, popup shows beach data.

---

### Task 18: Build Pengetahuan (Knowledge) page
**What:** LIK signs encyclopedia with 10 trusted signs.
**File:** `src/app/pengetahuan/page.tsx`

Simple page. Import `TRUSTED_SIGNS` from `@/lib/trusted-signs`.

Layout:
- "Pengetahuan Nelayan" heading 20px Outfit Bold
- "Tanda-tanda alam yang dipercaya nelayan" subtitle 14px slate
- Vertical stack (`flex flex-col gap-4`) of `SignCard` components

Each SignCard shows: icon (40px teal), name (18px semibold), code badge (12px muted pill), action (14px, bold, colored by severity — green for "Aman", amber for "Berlayar hati-hati", red for "Tunggu di darat"), description (14px slate).

**File:** `src/components/sign-card.tsx` — Simple presentational component. Props: sign from TRUSTED_SIGNS.

**Test:** Unit test — renders 10 sign cards, each shows name, code, action, description.

---

### Task 19: Update Playwright E2E tests
**What:** Update existing E2E tests to match new UI structure.
**Files:**
- `e2e/weather.spec.ts` — Update selectors to match new SummaryCards + WeatherFooter
- `e2e/alerts.spec.ts` — Update selectors to match new AlertBanner + AlertFeed (5-item preview)
- `e2e/report.spec.ts` — Rewrite to test /lapor page instead of FAB + sheet
- `e2e/sse.spec.ts` — Update to verify alert banner changes on SSE push
- `e2e/pwa.spec.ts` — Verify new manifest name/theme

Also add new E2E tests:
- `e2e/peta.spec.ts` — Map renders, markers visible
- `e2e/pengetahuan.spec.ts` — Knowledge page renders 10 signs
- `e2e/navigation.spec.ts` — Bottom nav tabs work, correct active states

**Verify:** `npx playwright test` passes all suites.

---

### Task 20: Final build and verify
**What:** Full build, lint, typecheck, and visual verification.
**Commands:**
```bash
cd frontend
npm run build
npm run lint
npx playwright test
```
**Verify:** Build passes, no TypeScript errors, all E2E tests pass, no console errors.
