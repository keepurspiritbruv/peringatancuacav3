import { describe, test, expect, beforeEach, mock } from "bun:test";
import { Hono } from "hono";

const mockRedis = {
	hSet: mock<(hash: string, field: string, value: string) => Promise<number>>(),
	hDel: mock<(hash: string, field: string) => Promise<number>>(),
};

mock.module("../lib/redis", () => ({
	redis: mockRedis,
}));

mock.module("../config", () => ({
	VAPID_SUBJECT: "mailto:test@example.com",
	VAPID_PUBLIC_KEY: "test-public-key",
	VAPID_PRIVATE_KEY: "test-private-key",
	PUSH_SUBSCRIPTIONS_HASH: "alerts:push:subscriptions",
}));

// web-push validates real VAPID keys in setVapidDetails; stub it out.
mock.module("web-push", () => ({
	setVapidDetails: mock(() => {}),
	sendNotification: mock(async () => {}),
}));

import pushRoute from "./push";
import { initWebPush } from "../lib/push";

initWebPush(); // flips pushConfigured = true so routes are enabled

const app = new Hono().route("/api", pushRoute);

const validSub = {
	endpoint: "https://fcm.googleapis.com/fcm/send/abc123",
	keys: { auth: "auth-secret", p256dh: "p256dh-key" },
};

describe("POST /api/push/subscribe", () => {
	beforeEach(() => {
		mockRedis.hSet.mockClear().mockResolvedValue(1);
		mockRedis.hDel.mockClear().mockResolvedValue(1);
	});

	test("accepts the frontend wrapped payload { subscription, beach_location }", async () => {
		const res = await app.request("/api/push/subscribe", {
			method: "POST",
			headers: { "content-type": "application/json" },
			body: JSON.stringify({ subscription: validSub, beach_location: "all" }),
		});
		expect(res.status).toBe(200);
		const body = await res.json();
		expect(body.ok).toBe(true);
		expect(mockRedis.hSet).toHaveBeenCalledTimes(1);
		expect(mockRedis.hSet).toHaveBeenCalledWith(
			"alerts:push:subscriptions",
			validSub.endpoint,
			expect.any(String),
		);
	});

	test("still accepts a raw PushSubscription payload (service-worker back-compat)", async () => {
		const res = await app.request("/api/push/subscribe", {
			method: "POST",
			headers: { "content-type": "application/json" },
			body: JSON.stringify(validSub),
		});
		expect(res.status).toBe(200);
		const body = await res.json();
		expect(body.ok).toBe(true);
		expect(mockRedis.hSet).toHaveBeenCalledTimes(1);
	});

	test("rejects a payload with no usable subscription", async () => {
		const res = await app.request("/api/push/subscribe", {
			method: "POST",
			headers: { "content-type": "application/json" },
			body: JSON.stringify({ beach_location: "all" }),
		});
		expect(res.status).toBe(400);
		expect(mockRedis.hSet).not.toHaveBeenCalled();
	});
});
