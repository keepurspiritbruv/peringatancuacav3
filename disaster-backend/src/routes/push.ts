import { Hono } from "hono";
import { VAPID_PUBLIC_KEY } from "../config";
import {
	isPushConfigured,
	isValidPushSubscription,
	removePushSubscription,
	savePushSubscription,
} from "../lib/push";

const route = new Hono();

route.get("/push/vapid-public-key", (c) => {
	if (!isPushConfigured() || !VAPID_PUBLIC_KEY) {
		return c.json({ ok: false, error: "Push not configured" }, 503);
	}
	return c.json({ ok: true, publicKey: VAPID_PUBLIC_KEY });
});

route.post("/push/subscribe", async (c) => {
	const input = await c.req.json<unknown>().catch(() => null);
	if (!isPushConfigured()) {
		return c.json({ ok: false, error: "Push not configured" }, 503);
	}

	// Frontend (api.ts) and the SW pushsubscriptionchange handler send the
	// subscription wrapped as { subscription, beach_location }. Older/raw
	// callers post the PushSubscription directly. Accept both shapes.
	const candidate =
		input && typeof input === "object" && "subscription" in input
			? (input as { subscription: unknown }).subscription
			: input;

	if (!isValidPushSubscription(candidate)) {
		return c.json({ ok: false, error: "Invalid PushSubscription" }, 400);
	}

	await savePushSubscription(candidate);
	return c.json({ ok: true, endpoint: candidate.endpoint });
});

route.post("/push/unsubscribe", async (c) => {
	const input = await c.req.json<{ endpoint?: string }>().catch(() => null);
	if (!isPushConfigured()) {
		return c.json({ ok: false, error: "Push not configured" }, 503);
	}
	if (!input?.endpoint || typeof input.endpoint !== "string") {
		return c.json({ ok: false, error: "endpoint required" }, 400);
	}

	await removePushSubscription(input.endpoint);
	return c.json({ ok: true, endpoint: input.endpoint });
});

export default route;
