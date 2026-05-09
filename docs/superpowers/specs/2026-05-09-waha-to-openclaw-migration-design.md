# WAHA to OpenClaw Migration

Replace WAHA-based WhatsApp integration with OpenClaw for alert broadcasting and incoming message handling.

## Background

The disaster-backend uses WAHA to:
1. Send alert broadcasts to WhatsApp groups (`src/lib/waha.ts`)
2. Receive webhook events for incoming/sent/acked messages logged to Redis streams (`src/routes/waha-webhook.ts`)

OpenClaw is a personal AI assistant platform with WhatsApp channel support, exposing an HTTP hooks API for programmatic message sending.

## Scope

- Replace `src/lib/waha.ts` with `src/lib/openclaw.ts` for outgoing alerts
- Replace `src/routes/waha-webhook.ts` with `src/routes/openclaw-webhook.ts` for incoming message webhooks
- Update `src/config.ts` to use OpenClaw env vars instead of WAHA env vars
- Update `src/index.ts` to mount the new webhook route
- Update `src/routes/report.ts` to import from the new module
- Update `docker-compose.yml` to replace WAHA env vars
- Remove WAHA template JSON files

## Outgoing Alerts

### Current (WAHA)

```
POST {WAHA_API_URL}/sendText
Headers: X-Api-Key, Content-Type
Body: { session, chatId, text }
```

### New (OpenClaw)

```
POST {OPENCLAW_GATEWAY_URL}/hooks/agent
Headers: Authorization: Bearer {OPENCLAW_HOOK_TOKEN}, Content-Type
Body: { message, channel: "whatsapp", to: "<groupChatId>", deliver: true }
```

The broadcast loop iterates over `OPENCLAW_BROADCAST_GROUPS` (comma-separated group IDs), sending one request per group. If OpenClaw is not configured (empty URL or token), the function logs a warning and returns early, matching the existing WAHA graceful-degradation behavior.

## Incoming Webhook

### Current (WAHA)

WAHA sends `POST /waha/webhook` with events:
- `message.received` — logged to `whatsapp:incoming` Redis stream
- `message.sent` — logged to `whatsapp:outgoing` Redis stream
- `message.ack` / `message.ack.group` — logged to `whatsapp:acks` Redis stream

Each event extracts an optional `[EXPERIMENT_ID]` tag from message text.

### New (OpenClaw)

OpenClaw does not provide a direct incoming-message webhook like WAHA. Instead:

1. Configure an OpenClaw **mapped hook** that forwards incoming WhatsApp messages to our hub. This is done on the OpenClaw side (config, not code).
2. The hub exposes `POST /openclaw/webhook` to receive forwarded messages. The route expects a JSON body with `from`, `text`, `messageId`, `direction` (incoming/outgoing), and optional `ack` level. It logs to the same Redis streams (`whatsapp:incoming`, `whatsapp:outgoing`, `whatsapp:acks`).

The Redis stream keys and field names remain unchanged to preserve compatibility with existing Stage 6 experimentation scripts and analysis tools.

## Configuration

### Remove

- `WAHA_API_KEY`
- `WAHA_API_URL`
- `WAHA_SESSION`
- `WAHA_BROADCAST_GROUPS`
- `WAHA_TEST_GROUP_ID`

### Add

- `OPENCLAW_GATEWAY_URL` — OpenClaw gateway base URL (e.g., `http://openclaw:18789`)
- `OPENCLAW_HOOK_TOKEN` — shared secret for hook authentication
- `OPENCLAW_BROADCAST_GROUPS` — comma-separated WhatsApp group chat IDs

### Defaults

- `OPENCLAW_GATEWAY_URL`: `""` (empty = disabled, same as WAHA behavior)
- `OPENCLAW_HOOK_TOKEN`: `""` (empty = disabled)
- `OPENCLAW_BROADCAST_GROUPS`: `[]` (no groups)

## Files Changed

| File | Action |
|------|--------|
| `src/lib/waha.ts` | Delete |
| `src/lib/openclaw.ts` | Create (replaces waha.ts) |
| `src/routes/waha-webhook.ts` | Delete |
| `src/routes/openclaw-webhook.ts` | Create (replaces waha-webhook.ts) |
| `src/config.ts` | Replace WAHA_* vars with OPENCLAW_* vars |
| `src/index.ts` | Update import: waha-webhook -> openclaw-webhook |
| `src/routes/report.ts` | Update import: sendWAAlert -> sendOpenClawAlert |
| `docker-compose.yml` | Replace WAHA env vars with OPENCLAW env vars |
| `WAHA - Chatting Template.json` | Delete |
| `WAHA - Chatting Template (6).json` | Delete |

## Error Handling

- If `OPENCLAW_GATEWAY_URL` or `OPENCLAW_HOOK_TOKEN` is empty, `sendOpenClawAlert` logs a warning and returns (no crash).
- Non-2xx responses from OpenClaw are logged with status code and response body.
- Network errors are caught per-group so one failure does not block other groups.
- Incoming webhook validates required fields and returns 400 for malformed payloads.

## Testing

- Manual test: send a report that triggers an alert, verify the message arrives in WhatsApp groups via OpenClaw.
- Manual test: send a WhatsApp message to a group, verify it appears in `whatsapp:incoming` Redis stream.
- Verify existing experiment scripts (`scripts/stage6/`) still work with the same Redis stream keys.
