# Frontend Redesign — "Laut Tenang" (Calm Sea)

## Overview

Redesign the CuacaPesisir PWA frontend from a generic shadcn dashboard into a distinctive, elderly-friendly coastal weather app. UI-only changes — all backend connections, API calls, SSE, and data flows remain identical.

## Design Direction

**Aesthetic:** "Laut Tenang" (Calm Sea) — Warm Coastal Minimal

**DFII Score:** Impact 5 + Fit 5 + Feasibility 4 + Performance 5 - Consistency Risk 1 = **18 (Excellent)**

**Differentiation anchor:** The alert banner occupies the top 30% of the viewport when danger is detected — it is impossible to miss. No other Indonesian weather app prioritizes danger visibility this aggressively.

**Target users:** Elderly traditional fishermen in rural Indonesia (Aceh + Bantul, Yogyakarta), low digital literacy, SD-SMP education. Large touch targets, icon-first, minimal text.

---

## App Shell & Navigation

### Header
- Sticky, navy `#0A2540` background, full-width
- App title: "CUACA PESISIR" in Outfit Bold 20px, white
- No hamburger menu, no search, no user profile

### Bottom Navigation
- Fixed at bottom, navy `#0A2540` background
- 4 tabs, each 64px tall (plus safe area inset):

| Tab | Icon (Lucide) | Label | Route |
|-----|---------------|-------|-------|
| Beranda | `Home` | Beranda | `/` |
| Lapor | `MessageSquarePlus` | Lapor | `/lapor` |
| Peta | `Map` | Peta | `/peta` |
| Pengetahuan | `BookOpen` | Pengetahuan | `/pengetahuan` |

- Active tab: icon + label in ocean teal `#0EA5E9`
- Inactive tab: icon + label in slate `#94A3B8`
- Touch target: full tab width, 64px height

### Content Area
- Sandy white `#F8F6F0` background
- Scrollable between header and bottom nav
- 16px horizontal padding

### Routing
Next.js App Router with 4 routes:
- `/` → Beranda (dashboard)
- `/lapor` → Lapor (full-page report form)
- `/peta` → Peta (Leaflet map)
- `/pengetahuan` → Pengetahuan (LIK signs reference)

### PWA Updates
- App name: "CuacaPesisir" (was "Peringatan Dini Bencana")
- Short name: "CuacaPesisir" (was "Peringatan")
- Theme color: `#0A2540` (was `#3B82F6`)
- Background color: `#F8F6F0` (was `#F3F4F6`)

---

## Page 1: Beranda (Dashboard)

Layout top-to-bottom:

### 1. Unified Alert Banner
Full-width card, edge-to-edge within content area.

**States:**

| State | Background | Icon | Text |
|-------|-----------|------|------|
| Aman | `#16A34A` green | `ShieldCheck` (40px, white) | "AMAN UNTUK MELAUT" (24px bold white) |
| Bahaya | `#DC2626` red, CSS `animate-pulse` | `TriangleAlert` (40px, white) | "BAHAYA! JANGAN MELAUT" (24px bold white) |
| Loading | `#0EA5E9` teal | `Loader2` (40px, white, animate-spin) | "Memuat data..." |
| No alerts (fallback) | `#16A34A` green | `ShieldCheck` (40px, white) | "AMAN UNTUK MELAUT" |

Subtitle text (14px, white 70% opacity):
- Aman: "BMKG: Aman. Tanda Alam: Aman."
- Bahaya: Shows which source flagged danger (e.g., "Tanda Alam: Ombak besar terdeteksi")

**Logic:** Scan all alerts from feed. If ANY alert has `riskLevel` containing "unsafe", "tidak aman", or "high" → Bahaya. Otherwise → Aman.

### 2. Dashboard Summary Cards (2-column horizontal row)

**Left card — BMKG:**
- White bg, `shadow-sm`, rounded-2xl
- "BMKG" label in 12px slate
- `CloudSun` icon (32px, teal `#0EA5E9`)
- Horizontally scrollable row of mini beach weather pills
- Each pill: beach short name + wave height (e.g., "Lampuuk 0.5m 28°")
- Data from `fetchAllBmkgData()`

**Right card — Laporan Warga:**
- White bg, `shadow-sm`, rounded-2xl
- "LAPORAN WARGA" label in 12px slate
- `Eye` icon (32px, teal `#0EA5E9`)
- Large number: today's alert count (from `fetchAlerts()`)
- Subtitle: "Laporan hari ini" in 14px slate

### 3. Report CTA Button
- Full-width, amber `#F59E0B` background
- `Megaphone` icon (left) + "LAPOR CUACA SEKARANG" text
- Outfit Bold 18px, white
- 56px height, rounded-2xl, `shadow-md`
- `active:scale-[0.98]` press feedback
- Navigates to `/lapor` on tap

### 4. Recent Alert Feed
- "Peringatan Terbaru" section header (16px semibold slate)
- Vertical list of the 5 most recent alerts
- Each alert card: white bg, rounded-xl, left border (green `#16A34A` for aman, red `#DC2626` for tidak aman)
- Card content: beach name (14px semibold), relative time (12px muted), Aman/Tidak Aman badge, triggered codes as small pills (max 3 shown), action recommendation (12px muted)
- "Lihat Semua" link at bottom toggles between 5 and 20 items

### 5. BMKG Data Source Footer
- "Sumber Data: BMKG" header with `Cloud` icon
- Disclaimer: "Data cuaca dari BMKG (Badan Meteorologi, Klimatologi, dan Geofisika)" in 12px muted
- Detailed per-beach weather data in a simple list:
  - Each beach: name, weather description, wave height, wind speed + direction, temperature, Aman/Tidak Aman badge
  - Data from `fetchAllBmkgData()`
- Styled as compact cards or a simple table-like layout

---

## Page 2: Lapor (Report)

Full-page replacement for the current FAB + bottom sheet flow.

### Step 1: Pilih Pantai
- "Langkah 1 dari 2" step indicator (10px dots)
- "Pilih Pantai Anda" heading (20px Outfit Bold)
- 2-column grid of 5 beach buttons
- Each button: 72px min-height, rounded-2xl, white bg, `border-2` navy
- `MapPin` icon (28px) + beach label (16px semibold)
- Selected state: teal `#0EA5E9` bg, white text, `scale(1.02)`
- Tapping a beach advances to Step 2

### Step 2: Pilih Tanda Alam
- Back arrow + "Pilih Tanda Alam" heading (20px Outfit Bold)
- "Pilih yang Anda lihat" subtitle (14px slate)
- 2-column grid of 10 trusted sign buttons (WN-1 through WN-9 + WN-13)
- Each button: 80px min-height, rounded-2xl, white bg, `border-2`
- Lucide icon (28px) + label (14px semibold) + code (12px muted)
- Selected state: teal `#0EA5E9` bg, white text, `Check` icon overlay
- Multi-select (tap to toggle)
- Back arrow returns to Step 1 (preserves beach selection)

### Submit Button
- Full-width, amber `#F59E0B` bg, white text
- "KIRIM LAPORAN (N)" where N is selected count
- 56px height, rounded-2xl
- Disabled (opacity 50%) when no signs selected or submitting
- `Loader2` icon + "Mengirim..." while submitting

### Success State
- Full-screen green overlay (`#16A34A` at 90% opacity)
- `ShieldCheck` icon (48px, white)
- "Laporan Terkirim!" text (24px Outfit Bold, white)
- Auto-dismiss after 2 seconds, return to Step 1

### Error Handling
- Sonner toast at top-center, red variant
- "Gagal mengirim. Coba lagi." on API error
- "Tidak ada koneksi" on network failure
- Stays on current step, preserves selections

---

## Page 3: Peta (Map)

Full-screen Leaflet map between header and bottom nav.

### Map Configuration
- Center: Pantai Depok, Bantul (`-8.0225, 110.3300`)
- Default zoom: 11
- Tile layer: CartoDB Positron (light, high contrast for outdoor readability)
- Fills viewport between header and bottom nav

### Beach Markers
5 markers at real coordinates:

| Beach | Coordinates |
|-------|-------------|
| Pantai Lampuuk | `5.4833, 95.1333` |
| Pantai Lhoknga | `5.4667, 95.1167` |
| Pantai Ulee Lheue | `5.5500, 95.3167` |
| Pantai Depok | `-8.0225, 110.3300` |
| Pantai Samas | `-8.0400, 110.3100` |

**Marker styles:**
- Aman: Teal `#0EA5E9` circle (24px) with white checkmark SVG inside
- Tidak Aman: Red `#DC2626` circle (24px) with white X SVG inside

### Popup (on tap)
- Beach name (18px semibold)
- Weather: temperature, wind speed + direction, wave height
- Status badge: Aman (green) or Tidak Aman (red)
- "Terakhir diperbarui: [relative time]"

### Data Source
- `fetchAllBmkgData()` for weather + `isSafe` status
- `fetchAlerts()` for cross-referencing risk levels

### Dependencies
- `leaflet` + `react-leaflet` (new packages to install)
- Custom marker icons via `L.divIcon` with inline SVG

---

## Page 4: Pengetahuan (Knowledge)

### Layout
- "Pengetahuan Nelayan" heading (20px Outfit Bold)
- "Tanda-tanda alam yang dipercaya nelayan" subtitle (14px slate)

### Content
Vertical list of 10 trusted LIK sign cards. Each card:

| Field | Content |
|-------|---------|
| Icon | Lucide icon (40px, teal `#0EA5E9`) |
| Name | Sign label (18px semibold, e.g., "Awan turun") |
| Code | Code badge (12px, e.g., "WN-1") |
| Action | Recommendation (14px, e.g., "Tunggu di darat") |
| Description | Plain Bahasa explanation of what the sign means |

### Card Styling
- White bg, rounded-2xl, `shadow-sm`
- Left border: 4px teal `#0EA5E9`
- Padding: 16px
- Vertical stack layout (not grid)

### Data Source
Hardcoded in constants (same `LIK_SIGNS` array, filtered to 10 trusted codes). Each sign needs a new `action` and `description` field added to the constant.

### 10 Trusted Signs Reference Data

| Code | Label | Action | Description |
|------|-------|--------|-------------|
| WN-1 | Awan turun | Tunggu di darat | Awan turun rendah menandakan akan terjadi badai atau angin kencang |
| WN-2 | Awan bergumpal | Waspada | Awan bergumpal besar menandakan cuaca akan berubah |
| WN-3 | Kilat | Tunggu di darat | Kilat menandakan badai petir, berbahaya untuk melaut |
| WN-4 | Ombak besar | Tunggu di darat | Ombak besar menandakan angin kencang di laut |
| WN-5 | Lumba-lumba | Berlayar hati-hati | Lumba-lumba mendekat ke pantai, perhatikan arus |
| WN-6 | Burung camar | Aman melaut | Burung camar terbang rendah menandakan cuaca baik |
| WN-7 | Peralihan angin | Waspada | Arah angin berubah tiba-tiba, waspada gelombang |
| WN-8 | Langit merah | Waspada | Langit merah saat senja menandakan cuaca buruk esok hari |
| WN-9 | Bintang redup | Berlayar hati-hati | Bintang redup menandakan udara lembab, bisa hujan |
| WN-13 | Ikan naik | Tunggu di darat | Ikan naik ke permukaan menandakan perubahan tekanan air |

---

## Design System

### Typography
- **Display/heading:** `Outfit` (Google Fonts), Bold 700
  - Used for: app title, alert banner text, page headings, CTA labels
- **Body:** `Plus Jakarta Sans` (Google Fonts), Regular 400 / Medium 500
  - Used for: descriptions, subtitles, card text, labels

### Color Variables
```css
--navy: #0A2540;
--ocean: #0EA5E9;
--sand: #F8F6F0;
--white: #FFFFFF;
--amber: #F59E0B;
--safety: #16A34A;
--danger: #DC2626;
--slate-400: #94A3B8;
--slate-600: #475569;
```

### Spacing & Touch Targets
- Minimum touch target height: 60px
- Card padding: 16px
- Page horizontal padding: 16px
- Section gap: 24px
- Bottom nav height: 64px + `env(safe-area-inset-bottom)`

### Motion
- Alert banner (Bahaya): CSS `animate-pulse` on opacity
- Button press: `active:scale-[0.98]` with `transition-transform`
- Success overlay: `opacity` fade-in 200ms
- No page transitions (instant navigation for simplicity)
- No decorative animations

### Shadows
- Cards: `shadow-sm` (0 1px 2px rgba(0,0,0,0.05))
- CTA button: `shadow-md` (0 4px 6px rgba(0,0,0,0.1))

### Icons
- Library: Lucide React (already installed)
- Sizes: 28px in buttons, 32px in cards, 40px in alert banner, 48px in success overlay
- Color: teal `#0EA5E9` for informational, white for on-dark-backgrounds

---

## Constraints

- **UI-only changes:** All API calls (`api.ts`), SSE (`sse.ts`), types (`types.ts`) remain unchanged
- **Existing data flow preserved:** `fetchAlerts()`, `fetchAllBmkgData()`, `submitReport()`, `connectSSE()` all used as-is
- **No authentication:** App remains fully anonymous
- **LIK codes in report:** Only 10 trusted codes (WN-1 through WN-9 + WN-13) shown in the UI
- **New dependencies:** `leaflet`, `react-leaflet` (for Peta page only)
- **Font loading:** Use `next/font/google` for Outfit and Plus Jakarta Sans (replace Geist)

---

## Files Changed (Summary)

| File | Change |
|------|--------|
| `src/app/layout.tsx` | New fonts (Outfit + Plus Jakarta Sans), new theme color, app metadata update |
| `src/app/globals.css` | New color variables (navy, ocean, sand, amber), remove shadcn defaults |
| `src/app/page.tsx` | Dashboard redesign: alert banner, summary cards, CTA, feed, BMKG footer |
| `src/app/lapor/page.tsx` | New: full-page report form (2-step) |
| `src/app/peta/page.tsx` | New: Leaflet map page |
| `src/app/pengetahuan/page.tsx` | New: LIK signs encyclopedia |
| `src/components/alert-banner.tsx` | New: unified alert banner component |
| `src/components/summary-cards.tsx` | New: BMKG + Laporan summary cards |
| `src/components/report-cta.tsx` | New: inline report CTA button |
| `src/components/alert-feed.tsx` | Updated: 5-item preview, new card styling |
| `src/components/alert-card.tsx` | Updated: new styling per design system |
| `src/components/weather-footer.tsx` | New: BMKG data source footer |
| `src/components/beach-select.tsx` | Updated: 72px buttons, 2-col, new styling |
| `src/components/sign-select.tsx` | Updated: 80px buttons, 2-col, 10 codes only |
| `src/components/bottom-nav.tsx` | New: 4-tab bottom navigation |
| `src/components/sign-card.tsx` | New: individual LIK sign card for Pengetahuan page |
| `src/lib/constants.ts` | Add `action` and `description` fields to LIK_SIGNS, add beach coordinates |
| `src/lib/trusted-signs.ts` | New: array of 10 trusted LIK codes |
| `public/manifest.json` | Update name, theme_color, background_color |
