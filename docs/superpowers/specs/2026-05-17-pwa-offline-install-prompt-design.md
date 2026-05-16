# PWA Offline Support & Install Prompt

**Date:** 2026-05-17
**Status:** Approved

## Problem

The PWA is installable but cannot function offline. Only `/` and `/manifest.json` are pre-cached. API calls return a generic 503 error when offline. There is no install prompt to guide users to add the app to their home screen.

## Solution

Enhance the existing hand-written `sw.js` with proper caching strategies and add an install prompt banner component on the homepage. No new dependencies.

## Files Changed

| File | Action |
|------|--------|
| `frontend/public/sw.js` | Rewrite with runtime caching strategies |
| `frontend/public/build-id.js` | New — generated at Docker build, exports cache version |
| `frontend/Dockerfile` | Add build-id generation step |
| `frontend/src/components/install-prompt.tsx` | New — install banner component |
| `frontend/src/components/service-worker-registrar.tsx` | Update — pass build ID to SW |
| `frontend/src/app/page.tsx` | Update — add InstallPrompt between NotificationCard and ReportCTA |

## Service Worker Caching Strategies

### Static assets (JS/CSS/fonts/images)
- **Strategy:** Cache-First
- **Match:** URL ends with `.js`, `.css`, `.woff2`, `.ttf`, `.png`, `.jpg`, `.svg`, `.ico`
- **TTL:** 30 days
- **Behavior:** Serve from cache immediately. If not cached, fetch from network, cache response, return it. Background refresh on cache hit is skipped for hashed assets (content-hash busting handles freshness).

### API GET requests
- **Strategy:** Network-First with Cache-Fallback
- **Match:** `GET /api/alerts*`, `GET /api/bmkg*`, `GET /api/health`
- **Behavior:** Try network first. If network succeeds, cache the response and return it. If network fails, return cached response if available and less than 1 hour old. If no cache or stale beyond 1 hour, return 503 JSON error.

### API POST/other requests
- **Strategy:** Network-Only
- **Match:** All non-GET requests to `/api/*`
- **Behavior:** No caching. Return 503 JSON error on failure.

### Navigation requests (HTML pages)
- **Strategy:** Stale-While-Revalidate with offline fallback
- **Match:** `request.mode === "navigate"`
- **Behavior:** Serve from cache if available. Fetch from network in background to update cache. If both fail, serve a minimal inline offline HTML page.

### Offline fallback page
A minimal HTML page served inline when navigation fails and no cache exists:
- "Anda sedang offline" heading
- "CuacaPesisir membutuhkan koneksi internet untuk memuat data terbaru. Silakan periksa koneksi Anda dan coba lagi."
- Auto-retry button that calls `location.reload()`

## Build ID Injection

The Dockerfile generates `public/build-id.js` before the build step:

```
RUN echo "self.BUILD_ID='$(date +%s)'" > /app/public/build-id.js
```

The service worker imports this via `importScripts("/build-id.js")` and uses `self.BUILD_ID` as the cache name suffix. This ensures cache is automatically busted on each deployment.

## Install Prompt Component

### Behavior
1. On mount, listen for `beforeinstallprompt` event and store the event
2. Check if app is already running in standalone mode (`display-mode: standalone` media query)
3. If not standalone and prompt is available, show the banner
4. User clicks "Install Aplikasi" → trigger deferred prompt
5. After install (either via prompt or manually), hide the banner permanently
6. User can dismiss via X button → hides for current session (sessionStorage)

### Visual Design
- Card with rounded border, light background
- Left: Download/Wifi icon (lucide-react `Download` or `Wifi`)
- Center: Message text
- Right: Install button (primary color) + dismiss X
- Appears between `NotificationCard` and `ReportCTA` on homepage

### Text
- Message: "Website ini bisa digunakan offline. Install aplikasi untuk akses lebih cepat dan notifikasi peringatan cuaca langsung di perangkat Anda."
- Button: "Install Aplikasi"
- Dismiss: X icon

### State Management
- `beforeinstallprompt` event stored in React ref
- Dismiss state in sessionStorage (key: `install-prompt-dismissed`)
- Standalone detection via `window.matchMedia('(display-mode: standalone)')`

## What We Do NOT Do
- No background sync for POST requests
- No periodic background sync
- No `@serwist/next` or `next-pwa` integration
- No IndexedDB caching of API data (SW cache is sufficient)
- No offline data editing or queuing

## Testing
- Manual: install PWA, go offline in DevTools, verify cached pages load
- Manual: verify install prompt appears on first visit, dismisses correctly
- Manual: verify after install, prompt never appears again
- Manual: verify API data loads from cache when offline
