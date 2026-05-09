# Implementation Plan: WAHA to OpenClaw Migration

Spec: `docs/superpowers/specs/2026-05-09-waha-to-openclaw-migration-design.md`

## File Map

| File | Action | Responsibility |
|------|--------|----------------|
| `src/lib/openclaw.ts` | Create | Outgoing alert sender via OpenClaw `/hooks/agent` |
| `src/routes/openclaw-webhook.ts` | Create | Incoming webhook route for OpenClaw-forwarded messages |
| `src/config.ts` | Edit | Replace WAHA_* env vars with OPENCLAW_* env vars |
| `src/index.ts` | Edit | Update import from waha-webhook to openclaw-webhook |
| `src/routes/report.ts` | Edit | Update import from sendWAAlert to sendOpenClawAlert |
| `docker-compose.yml` | Edit | Replace WAHA env vars with OPENCLAW env vars |
| `src/lib/waha.ts` | Delete | Replaced by openclaw.ts |
| `src/routes/waha-webhook.ts` | Delete | Replaced by openclaw-webhook.ts |

## Tasks

### Task 1: Update config.ts — replace WAHA vars with OpenClaw vars

**File:** `src/config.ts` (lines 61-68)

Replace the WAHA config block:

```typescript
// REMOVE:
export const WAHA_API_KEY = process.env.WAHA_API_KEY ?? "";
export const WAHA_TEST_GROUP_ID = process.env.WAHA_TEST_GROUP_ID ?? "120363406629965480@g.us";
export const WAHA_API_URL = process.env.WAHA_API_URL ?? "https://waha.fruz.cloud/api";
export const WAHA_SESSION = process.env.WAHA_SESSION ?? "default";
export const WAHA_BROADCAST_GROUPS = parseCsvEnv(
	process.env.WAHA_BROADCAST_GROUPS,
	["120363406629965480@g.us", "120363425830719164@g.us"],
);

// ADD:
export const OPENCLAW_GATEWAY_URL = process.env.OPENCLAW_GATEWAY_URL ?? "";
export const OPENCLAW_HOOK_TOKEN = process.env.OPENCLAW_HOOK_TOKEN ?? "";
export const OPENCLAW_BROADCAST_GROUPS = parseCsvEnv(process.env.OPENCLAW_BROADCAST_GROUPS, []);
```

**Verify:** `bun run src/index.ts` starts without errors (no missing import errors yet since waha.ts still exists).

### Task 2: Create src/lib/openclaw.ts — outgoing alert sender

**File:** `src/lib/openclaw.ts` (new file)

```typescript
import { OPENCLAW_GATEWAY_URL, OPENCLAW_HOOK_TOKEN, OPENCLAW_BROADCAST_GROUPS } from "../config";

export async function sendOpenClawAlert(text: string): Promise<void> {
	if (!OPENCLAW_GATEWAY_URL || !OPENCLAW_HOOK_TOKEN) {
		console.warn("[openclaw] OpenClaw not configured, skipping broadcast");
		return;
	}

	for (const chatId of OPENCLAW_BROADCAST_GROUPS) {
		try {
			const res = await fetch(`${OPENCLAW_GATEWAY_URL}/hooks/agent`, {
				method: "POST",
				headers: {
					"Content-Type": "application/json",
					"Authorization": `Bearer ${OPENCLAW_HOOK_TOKEN}`,
				},
				body: JSON.stringify({
					message: text,
					channel: "whatsapp",
					to: chatId,
					deliver: true,
				}),
			});
			if (!res.ok) {
				const detail = await res.text().catch(() => "");
				console.error(`[openclaw] hooks/agent failed for ${chatId}: ${res.status} ${detail}`);
			}
		} catch (err) {
			console.error(`[openclaw] hooks/agent error for ${chatId}:`, err);
		}
	}
}
```

**Verify:** No runtime errors on import.

### Task 3: Create src/routes/openclaw-webhook.ts — incoming webhook

**File:** `src/routes/openclaw-webhook.ts` (new file)

This replaces `waha-webhook.ts`. The route accepts forwarded messages from OpenClaw's mapped hooks and logs them to the same Redis streams.

```typescript
import { Hono } from "hono";
import { redis } from "../lib/redis";

const route = new Hono();

type OpenClawWebhookPayload = {
	direction?: "incoming" | "outgoing" | "ack";
	from?: string;
	to?: string;
	text?: string;
	messageId?: string;
	ack?: number;
};

const EXPERIMENT_ID_REGEX = /\[([A-Z0-9-]+)\]/;

route.post("/openclaw/webhook", async (c) => {
	try {
		const body = await c.req.json<OpenClawWebhookPayload>().catch(() => null);
		if (!body) {
			console.log("[openclaw-webhook] Invalid JSON body");
			return c.json({ success: false, error: "Invalid JSON" }, 400);
		}

		const { direction, from, to, text, messageId, ack } = body;
		console.log("[openclaw-webhook] Received:", { direction, from, to, messageId, ack, text });

		if (!direction) {
			console.log("[openclaw-webhook] Missing direction");
			return c.json({ success: false, error: "Missing direction" }, 400);
		}

		const timestamp = Date.now();
		let experimentId: string | null = null;

		if (text) {
			const match = text.match(EXPERIMENT_ID_REGEX);
			if (match && match[1]) {
				experimentId = match[1];
				console.log("[openclaw-webhook] Extracted experimentId:", experimentId);
			}
		}

		if (direction === "incoming") {
			if (!from || !text) {
				console.log("[openclaw-webhook] Missing required fields for incoming");
				return c.json({ success: false, error: "Missing from or text" }, 400);
			}

			await redis.xAdd("whatsapp:incoming", "*", {
				timestamp: String(timestamp),
				from,
				text,
				...(experimentId && { experimentId }),
			});

			console.log("[openclaw-webhook] Logged to whatsapp:incoming stream");
		} else if (direction === "outgoing") {
			if (!to || !text) {
				console.log("[openclaw-webhook] Missing required fields for outgoing");
				return c.json({ success: false, error: "Missing to or text" }, 400);
			}

			await redis.xAdd("whatsapp:outgoing", "*", {
				timestamp: String(timestamp),
				to,
				text,
				...(experimentId && { experimentId }),
			});

			console.log("[openclaw-webhook] Logged to whatsapp:outgoing stream");
		} else if (direction === "ack") {
			if (!messageId || !from) {
				console.log("[openclaw-webhook] Missing required fields for ack");
				return c.json({ success: false, error: "Missing messageId or from" }, 400);
			}

			const ackLevel = ack ?? 0;

			await redis.xAdd("whatsapp:acks", "*", {
				timestamp: String(timestamp),
				messageId,
				chatId: from,
				ack: String(ackLevel),
				...(experimentId && { experimentId }),
			});

			console.log("[openclaw-webhook] Logged to whatsapp:acks stream, ack level:", ackLevel);
		} else {
			console.log("[openclaw-webhook] Unknown direction:", direction);
			return c.json({ success: false, error: "Unknown direction" }, 400);
		}

		return c.json({ success: true });
	} catch (error) {
		console.error("[openclaw-webhook] Error:", error);
		return c.json({ success: false, error: "Internal server error" }, 500);
	}
});

export default route;
```

**Verify:** No runtime errors on import.

### Task 4: Update src/routes/report.ts — swap WAHA import

**File:** `src/routes/report.ts`

Line 3 — replace:
```typescript
import { sendWAAlert } from "../lib/waha";
```
with:
```typescript
import { sendOpenClawAlert } from "../lib/openclaw";
```

Line 259 — replace:
```typescript
await sendWAAlert(
```
with:
```typescript
await sendOpenClawAlert(
```

**Verify:** No compile errors.

### Task 5: Update src/index.ts — swap webhook route

**File:** `src/index.ts`

Line 24 — replace:
```typescript
import wahaWebhookRoute from "./routes/waha-webhook";
```
with:
```typescript
import openclawWebhookRoute from "./routes/openclaw-webhook";
```

Line 92 — replace:
```typescript
app.route("/api", wahaWebhookRoute);
```
with:
```typescript
app.route("/api", openclawWebhookRoute);
```

**Verify:** `bun run src/index.ts` starts without errors.

### Task 6: Update docker-compose.yml — swap env vars

**File:** `docker-compose.yml`

Lines 32-33 — replace:
```yaml
      WAHA_API_KEY: ${WAHA_API_KEY:-}
      WAHA_TEST_GROUP: ${WAHA_TEST_GROUP:-}
```
with:
```yaml
      OPENCLAW_GATEWAY_URL: ${OPENCLAW_GATEWAY_URL:-}
      OPENCLAW_HOOK_TOKEN: ${OPENCLAW_HOOK_TOKEN:-}
      OPENCLAW_BROADCAST_GROUPS: ${OPENCLAW_BROADCAST_GROUPS:-}
```

**Verify:** `docker compose config` validates without errors.

### Task 7: Delete old WAHA files

Delete:
- `src/lib/waha.ts`
- `src/routes/waha-webhook.ts`
- `WAHA - Chatting Template.json`
- `WAHA - Chatting Template (6).json`

**Verify:** `bun run src/index.ts` starts successfully, no import errors.

### Task 8: Final verification

Run:
```bash
cd disaster-backend && bun run src/index.ts
```

Verify:
- Server starts on port 3000
- No WAHA references in console output
- Route `/api/openclaw/webhook` is registered (check via health/docs)
