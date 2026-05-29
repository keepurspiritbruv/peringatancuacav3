# Two-Way Sync: OpenClaw WhatsApp <-> samudraapp.id

## Overview

Enable two-way sync:
1. **Website → WhatsApp**: When 5+ reports trigger an alert, auto-send to WA group via OpenClaw gateway
2. **WhatsApp → Website**: When someone sends a "laporan" message in WA group, parse it and show on website dashboard

## Current State

| Component | Status |
|---|---|
| `sendOpenClawAlert()` in `disaster-backend/src/lib/openclaw.ts` | Exists, sends POST to `hooks/agent` |
| Env vars `OPENCLAW_GATEWAY_URL`, `OPENCLAW_HOOK_TOKEN`, `OPENCLAW_BROADCAST_GROUPS` in config.ts | Defined, but empty on VPS |
| `openclaw-webhook.ts` — receives bridge messages, stores to Redis stream `whatsapp:incoming` | Exists, no parsing logic |
| `openclaw-bridge/bridge.mjs` — polls gateway, forwards to backend webhook | Exists, running |
| SSE endpoint `GET /api/sse` with `alert` events | Exists, subscribed by frontend |
| Redis pub/sub on `alerts:high` → SSE broadcast | Exists in `index.ts` |
| Docker network: backend + gateway both on `shared-net` | Confirmed, reachable |

## File Map

| File | Responsibility |
|---|---|
| `docker-compose.yml` (root) | Add env vars to backend service |
| `.env` (VPS) or `docker-compose.yml` env | Set OPENCLAW_* values |
| `disaster-backend/src/routes/openclaw-webhook.ts` | Parse WA laporan messages → call processReport |
| `disaster-backend/src/index.ts` | Subscribe to `whatsapp:incoming` Redis stream → SSE broadcast |
| `frontend/src/lib/types.ts` | Add `WhatsAppReport` type (optional) |
| `frontend/src/components/alert-feed.tsx` | Already renders `AlertFeedItem[]`, no change needed |

## Step-by-Step

---

### Step 1: Set env vars on VPS (Website → WhatsApp)

**Goal**: Enable `sendOpenClawAlert()` so alerts auto-send to WA group when threshold is reached.

**What to do on VPS:**

1. Find your WA group chat ID:
   ```bash
   docker exec openclaw-openclaw-gateway-1 node -e "
     fetch('http://localhost:18789/', {
       method: 'POST',
       headers: {'Content-Type': 'application/json'},
       body: JSON.stringify({
         jsonrpc: '2.0', id: 1,
         method: 'gateway.call',
         params: {
           path: 'sessions',
           token: '82c96bbe94503a84a8795eae5bb114f75f91f74c7b43ca2aef4dd7d557f6aad3'
         }
       })
     }).then(r => r.json()).then(j => console.log(JSON.stringify(j, null, 2)))
   "
   ```
   Look for the group session — the chat ID will look like `628xxx@g.us`.

2. Create/edit `.env` in `/root/peringatan-cuaca/` (or wherever your docker-compose lives):
   ```
   OPENCLAW_GATEWAY_URL=http://openclaw-openclaw-gateway-1:18789
   OPENCLAW_HOOK_TOKEN=82c96bbe94503a84a8795eae5bb114f75f91f74c7b43ca2aef4dd7d557f6aad3
   OPENCLAW_BROADCAST_GROUPS=628xxx@g.us
   ```
   Replace `628xxx@g.us` with the actual group chat ID from step 1.

3. Restart backend only:
   ```bash
   docker compose stop backend && docker compose up -d backend
   ```
   Do NOT `docker compose restart` (OCI namespace bug).

4. Verify:
   ```bash
   docker logs peringatan-backend --tail 20 2>&1 | grep openclaw
   ```
   Should show no "OpenClaw not configured" warnings.

**Verify end-to-end**: Submit 5 reports via website for any beach. After the 5th, check WA group — alert message should appear.

---

### Step 2: Parse WA laporan messages in webhook (WhatsApp → Website)

**Goal**: When someone sends a structured laporan message in WA group, parse it and create a report in the system.

**File to modify**: `disaster-backend/src/routes/openclaw-webhook.ts`

**What to change**:

After storing to `whatsapp:incoming` stream (line ~50), add parsing logic:

```typescript
// Add this import at the top:
import { processReport } from "../lib/crowdsource";
import { persistReport, persistShapPrediction } from "../lib/bmkg";
import { ML_BASE_URL } from "../config";
import { ALLOWED_BEACH_LOCATIONS } from "../types";
import type { PredictionInput } from "../types";

// Add this constant:
const ALLOWED_BEACHES = new Set(ALLOWED_BEACH_LOCATIONS);

// Parsing function — add after the EXPERIMENT_ID_REGEX:
function parseLaporanMessage(text: string): { beachLocation: string; likCodes: string[] } | null {
  const lower = text.toLowerCase().trim();

  // Expected format: "laporan pantai_lampuuk Wn-1 Wn-4"
  // Or: "laporan lampuuk Wn-1 Wn-4" (shortcut)
  // Or: "lapor lampuuk Wn-1 Wn-4"

  const match = lower.match(/^(?:laporan|lapor)\s+(\S+)(?:\s+(.*))?$/);
  if (!match) return null;

  let beach = match[1];
  const codesRaw = match[2] ?? "";

  // Shortcut mapping: "lampuuk" -> "pantai_lampuuk"
  const shortcuts: Record<string, string> = {
    lampuuk: "pantai_lampuuk",
    lhoknga: "pantai_lhoknga",
    ulee_lheue: "pantai_ulee_lheue",
    depok: "pantai_depok",
    samas: "pantai_samas",
  };
  if (shortcuts[beach]) beach = shortcuts[beach];

  if (!ALLOWED_BEACHES.has(beach)) return null;

  // Parse LIK codes: Wn-1, Wn-2, etc.
  const likCodes = codesRaw
    .toUpperCase()
    .split(/[\s,]+/)
    .filter((c) => /^WN-\d+$/.test(c));

  if (likCodes.length === 0) return null;

  return { beachLocation: beach, likCodes };
}
```

Then in the `direction === "incoming"` block (after the `xAdd` call around line 57), add:

```typescript
// Try to parse as laporan message
if (text) {
  const parsed = parseLaporanMessage(text);
  if (parsed) {
    console.log("[openclaw-webhook] Parsed laporan:", parsed);
    try {
      // Call ML for prediction
      const mlRes = await fetch(`${ML_BASE_URL}/predict`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          beach_location: parsed.beachLocation,
          lik_codes: parsed.likCodes,
        }),
      });
      const mlData = await mlRes.json() as { prediction?: MlResult };

      const input: PredictionInput = {
        beach_location: parsed.beachLocation,
        lik_codes: parsed.likCodes,
        channel: "whatsapp",
        clientReportId: crypto.randomUUID(),
        createdAtClient: timestamp,
      };

      const result = await processReport(input, mlData.prediction ?? null);
      if (result.shouldDistribute) {
        // Alert will be published to Redis pub/sub automatically by processReport
        console.log("[openclaw-webhook] Report triggered alert distribution");
      }
    } catch (err) {
      console.error("[openclaw-webhook] Error processing laporan:", err);
    }
  }
}
```

**Also add the missing imports at the top of the file**:
```typescript
import { ML_BASE_URL } from "../config";
import { ALLOWED_BEACH_LOCATIONS } from "../types";
import type { MlResult, PredictionInput } from "../types";
```

---

### Step 3: Subscribe whatsapp:incoming in SSE (WhatsApp → Website dashboard)

**Goal**: When a WA message arrives, push it to connected frontend clients via SSE so the dashboard updates in real-time.

**File to modify**: `disaster-backend/src/index.ts`

**What to change**:

After the existing `sub.subscribe(ALERTS_CHANNEL, ...)` block (around line 85), add a second Redis subscription for WhatsApp incoming messages. But since `whatsapp:incoming` is a **stream** (not pub/sub), we need a different approach.

Add this after the `sub.subscribe` block:

```typescript
// Subscribe to whatsapp:incoming stream for real-time WA→Web updates
import { redis as redisClient } from "./lib/redis";

(async () => {
  let lastId = "$";
  try {
    const lastEntry = await redisClient.xRevRange("whatsapp:incoming", "+", "-", { count: 1 });
    if (lastEntry && lastEntry.length > 0) {
      lastId = lastEntry[0][0];
    }
  } catch {
    // Stream might be empty, start from latest
    lastId = "$";
  }

  console.log("[wa-stream] Starting whatsapp:incoming consumer from", lastId);

  while (true) {
    try {
      const results = await redisClient.xRead(
        { key: "whatsapp:incoming", id: lastId },
        { BLOCK: 5000, COUNT: 10 }
      );

      if (results && results.length > 0) {
        for (const [, messages] of results) {
          for (const [msgId, fields] of messages) {
            lastId = msgId;

            // Only broadcast laporan-type messages (with from and text)
            if (fields.from && fields.text) {
              const payload = JSON.stringify({
                type: "whatsapp_message",
                from: fields.from,
                text: fields.text,
                timestamp: fields.timestamp,
              });

              // Broadcast via SSE
              for (const client of sseClients) {
                try {
                  await client.writeSSE({ event: "whatsapp", data: payload });
                } catch {
                  sseClients.delete(client);
                }
              }

              // Broadcast via WebSocket
              for (const client of wsClients) {
                if (client.readyState !== 1) {
                  wsClients.delete(client);
                  continue;
                }
                try {
                  client.send(payload);
                } catch {
                  wsClients.delete(client);
                }
              }
            }
          }
        }
      }
    } catch (err) {
      console.error("[wa-stream] Error reading whatsapp:incoming:", err);
      await new Promise((r) => setTimeout(r, 3000));
    }
  }
})();
```

**Frontend change** — add WA message listener in `frontend/src/lib/sse.ts`:

```typescript
export function connectSSE(
  onAlert: (data: AlertFeedItem) => void,
  onWhatsApp?: (data: { type: string; from: string; text: string; timestamp: string }) => void
): () => void {
  const url = `${SSE_BASE}/sse`;
  const es = new EventSource(url);

  es.addEventListener("alert", (event) => {
    try {
      const raw = JSON.parse(event.data);
      onAlert(transformAlert(raw));
    } catch {
    }
  });

  es.addEventListener("whatsapp", (event) => {
    try {
      const raw = JSON.parse(event.data);
      onWhatsApp?.(raw);
    } catch {
    }
  });

  return () => {
    es.close();
  };
}
```

Then in `frontend/src/app/page.tsx`, update the `connectSSE` call:
```typescript
const disconnect = connectSSE(
  (newAlert) => setAlerts((prev) => [newAlert, ...prev].slice(0, 50)),
  (waMsg) => console.log("[WA]", waMsg.from, waMsg.text) // or display in UI
);
```

---

### Step 4: Build, deploy, verify

**On your local machine** (D:\Skripsi\gue\peringatancuacav3):

1. Build backend:
   ```bash
   cd disaster-backend
   docker build -t scaferuzzz/disaster-backend:latest .
   docker push scaferuzzz/disaster-backend:latest
   ```

2. Build frontend (if you changed it):
   ```bash
   cd frontend
   docker build -t scaferuzzz/peringatan-frontend:latest .
   docker push scaferuzzz/peringatan-frontend:latest
   ```

**On VPS:**

3. Pull and restart:
   ```bash
   docker compose pull backend
   docker compose stop backend && docker compose up -d backend
   ```

4. Verify:
   ```bash
   docker logs peringatan-backend --tail 30 -f
   ```
   Look for `[wa-stream] Starting whatsapp:incoming consumer`

5. Test Web→WA:
   - Open samudraapp.id, submit 5 reports for any beach
   - Check WA group — alert should appear

6. Test WA→Web:
   - Send "laporan lampuuk Wn-1 Wn-4" in WA group
   - Check `docker logs peringatan-backend --tail 10` — should show `[openclaw-webhook] Parsed laporan`
   - Open samudraapp.id dashboard — should see the new report in the alert feed

---

## Scope Constraints

- Only touch containers: `openclaw-*`, `peringatan-*`
- Do NOT touch: `thesis-*`, `simak-*`, or any other containers
- Gateway auth is `token` mode — use existing token
- SSH: `ssh -i dhimas root@43.156.242.107`
- Always `docker compose stop && docker compose up -d`, never `docker compose restart`
