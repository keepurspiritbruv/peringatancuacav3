# Frontend Design — Peringatan Dini Bencana

**Tanggal:** 2026-05-09

---

## 1. Overview

Responsive website (Silent PWA) for fishermen to submit natural warning sign reports and view alerts + BMKG weather data. No authentication required.

**Tech Stack:**
- Next.js 14+ (App Router)
- shadcn/ui + Lucide icons + Tailwind CSS
- Bahasa Indonesia

**Target Users:**
- Elderly fishermen, low ICT literacy
- Elementary/middle school education
- Predominantly active on WhatsApp

## 2. Design Principles

- Icon-first, minimal text
- Large touch targets (min 48px)
- High contrast colors
- Zero typing, zero keyboard interaction
- Single page, vertical scroll
- No authentication required
- Silent PWA (service worker + manifest, no install prompt)

## 3. Page Layout

Single page with 3 sections, scrollable vertically:

### 3.1 Alert Feed (Top)

- Card-based feed showing recent alerts
- Each card: beach name, timestamp, colored risk badge (Merah/Kuning/Hijau), sign icons
- Newest alerts on top
- Auto-refreshes via SSE connection to backend
- Empty state: "Belum ada peringatan saat ini" with calm icon

### 3.2 BMKG Weather Cards (Middle)

- One card per beach
- Each card shows: weather icon, wave height (big number), wind info, beach name
- Status badge: "Aman Melaut" (green) or "Tidak Aman Melaut" (red) based on wave/wind thresholds
- Data fetched from backend (which pre-fetches from BMKG)

### 3.3 Floating Action Button (Bottom-Right)

- Always visible FAB with "+" or report icon
- Opens bottom sheet for report flow

## 4. Report Flow (4 Taps)

**Tap 1:** Tap FAB button → bottom sheet slides up

**Tap 2:** Select beach
- 5 beach cards: Pantai Lampuuk, Lhoknga, Ulee Lheue, Depok, Samas
- Each card: beach name + location icon, large tappable area
- GPS pre-selects nearest beach (optional enhancement)

**Tap 3:** Select natural signs
- Icon grid with visual representations:
  - Dark clouds (awan gelap)
  - Big waves (ombak besar)
  - Strong wind (angin kencang)
  - Heavy rain (hujan deras)
  - Additional signs from LIK codes
- Multi-select allowed
- Selected items get highlighted border

**Tap 4:** Tap "Kirim Laporan" button → auto-submits with GPS timestamp

**Confirmation:** "Laporan terkirim!" toast, bottom sheet closes.

## 5. Data Flow

### Frontend → Backend

| Endpoint | Method | Purpose |
|---|---|---|
| `/api/report` | POST | Submit report (beach_location, lik_codes[], clientReportId, createdAtClient) |
| `/api/sse` | GET | Real-time alert stream via SSE (existing) |
| `/api/bmkg/:beach` | GET | Fetch BMKG weather data per beach (new endpoint) |

### Offline Behavior

- Service worker caches page shell (HTML, CSS, JS, icons)
- Last-seen alerts and weather data served from cache when offline
- Report submission requires network — show "Tidak ada koneksi" message if offline

## 6. Color System

| Color | Hex | Usage |
|---|---|---|
| Danger Red | #EF4444 | High risk alerts, "Tidak Aman Melaut" |
| Warning Yellow | #F59E0B | Medium risk alerts |
| Safe Green | #22C55E | Safe status, "Aman Melaut" |
| Ocean Blue | #3B82F6 | Primary brand, FAB button, links |
| White | #FFFFFF | Card backgrounds |
| Light Gray | #F3F4F6 | Page background |

## 7. File Structure (Planned)

```
frontend/
  src/
    app/
      layout.tsx          # Root layout with font, metadata, manifest link
      page.tsx            # Single page: AlertFeed + WeatherCards + FAB
      globals.css         # Tailwind base + custom theme
    components/
      alert-feed.tsx      # Alert card feed with SSE auto-refresh
      alert-card.tsx      # Single alert card
      weather-cards.tsx   # BMKG weather card grid
      weather-card.tsx    # Single beach weather card
      report-fab.tsx      # Floating action button
      report-sheet.tsx    # Bottom sheet container
      beach-select.tsx    # Beach selection grid
      sign-select.tsx     # Natural sign icon grid
      status-badge.tsx    # Reusable Aman/Tidak Aman badge
    lib/
      api.ts              # Backend API client (fetch helpers)
      sse.ts              # SSE connection manager
      types.ts            # Shared types
    public/
      icons/              # Natural sign icons, beach icons
      manifest.json       # PWA manifest
      sw.js               # Service worker
```
