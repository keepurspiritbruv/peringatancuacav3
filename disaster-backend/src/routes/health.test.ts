import { describe, test, expect, beforeEach, mock } from "bun:test";
import { Hono } from "hono";

const mockPing = mock<() => Promise<string>>();
const mockHLen = mock<() => Promise<number>>();

mock.module("../lib/redis", () => ({
	redis: { ping: mockPing, hLen: mockHLen },
}));

mock.module("../config", () => ({
	ACKS_STREAM: "alerts:acks",
	ALERTS_CHANNEL: "alerts:high",
	ALERTS_STREAM: "alerts:stream",
	AUTH_USER_EMAIL_KEY_PREFIX: "auth:users:email:",
	AUTH_USER_IDENTITY_KEY_PREFIX: "auth:users:identity:",
	AUTH_USER_KEY_PREFIX: "auth:users:",
	ENABLE_PUSH_DELIVERY: true,
	ENABLE_SSE_DELIVERY: true,
	ENABLE_WS_DELIVERY: true,
	JWT_AUTH_ENABLED: false,
	JWT_PUBLIC_PATHS: [],
	ML_BASE_URL: "http://localhost:8000",
	PUSH_SUBSCRIPTIONS_HASH: "alerts:push:subscriptions",
	REPORT_SYNC_STREAM: "reports:sync",
}));

mock.module("../lib/push", () => ({
	isPushConfigured: () => true,
}));

import healthRoute from "./health";

const app = new Hono().route("/api", healthRoute);

describe("GET /api/health", () => {
	beforeEach(() => {
		mockPing.mockClear();
		mockHLen.mockClear();
	});

	test("returns health status with Redis ping", async () => {
		mockPing.mockResolvedValue("PONG");
		mockHLen.mockResolvedValue(3);

		const res = await app.request("/api/health");
		const body = await res.json();

		expect(res.status).toBe(200);
		expect(body.ok).toBe(true);
		expect(body.redis).toBe("PONG");
		expect(body.push.subscriptions).toBe(3);
		expect(body.delivery.sse).toBe(true);
		expect(body.delivery.ws).toBe(true);
	});

	test("includes stream names", async () => {
		mockPing.mockResolvedValue("PONG");
		mockHLen.mockResolvedValue(0);

		const res = await app.request("/api/health");
		const body = await res.json();

		expect(body.streams.alerts).toBe("alerts:stream");
		expect(body.streams.acks).toBe("alerts:acks");
	});
});
