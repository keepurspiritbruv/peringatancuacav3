import { describe, test, expect, beforeEach, mock } from "bun:test";
import { Hono } from "hono";

const mockRedis = {
	xAdd: mock<(stream: string, id: string, fields: Record<string, string>) => Promise<string>>(),
};

mock.module("../lib/redis", () => ({
	redis: mockRedis,
}));

mock.module("../config", () => ({
	ACKS_STREAM: "alerts:acks",
}));

import ackRoute from "./ack";

const app = new Hono().route("/api", ackRoute);

describe("POST /api/ack", () => {
	beforeEach(() => {
		mockRedis.xAdd.mockClear().mockResolvedValue("1-0");
	});

	test("accepts valid ack", async () => {
		const res = await app.request("/api/ack", {
			method: "POST",
			headers: { "content-type": "application/json" },
			body: JSON.stringify({
				alertId: "alert-1",
				transport: "SSE",
				receivedAtClient: Date.now(),
				serverTimestamp: Date.now(),
			}),
		});
		expect(res.status).toBe(200);
		const body = await res.json();
		expect(body.ok).toBe(true);
		expect(mockRedis.xAdd).toHaveBeenCalledTimes(1);
	});

	test("rejects invalid JSON", async () => {
		const res = await app.request("/api/ack", {
			method: "POST",
			headers: { "content-type": "application/json" },
			body: "not json",
		});
		expect(res.status).toBe(400);
	});

	test("rejects missing alertId", async () => {
		const res = await app.request("/api/ack", {
			method: "POST",
			headers: { "content-type": "application/json" },
			body: JSON.stringify({
				transport: "SSE",
				receivedAtClient: Date.now(),
				serverTimestamp: Date.now(),
			}),
		});
		expect(res.status).toBe(400);
		const body = await res.json();
		expect(body.error).toContain("alertId");
	});

	test("rejects invalid transport", async () => {
		const res = await app.request("/api/ack", {
			method: "POST",
			headers: { "content-type": "application/json" },
			body: JSON.stringify({
				alertId: "alert-1",
				transport: "INVALID",
				receivedAtClient: Date.now(),
				serverTimestamp: Date.now(),
			}),
		});
		expect(res.status).toBe(400);
		const body = await res.json();
		expect(body.error).toContain("transport");
	});

	test("rejects non-number timestamps", async () => {
		const res = await app.request("/api/ack", {
			method: "POST",
			headers: { "content-type": "application/json" },
			body: JSON.stringify({
				alertId: "alert-1",
				transport: "WS",
				receivedAtClient: "not-a-number",
				serverTimestamp: Date.now(),
			}),
		});
		expect(res.status).toBe(400);
	});

	test("accepts ackStage DELIVERED", async () => {
		const res = await app.request("/api/ack", {
			method: "POST",
			headers: { "content-type": "application/json" },
			body: JSON.stringify({
				alertId: "alert-1",
				transport: "PUSH",
				receivedAtClient: Date.now(),
				serverTimestamp: Date.now(),
				ackStage: "DELIVERED",
			}),
		});
		expect(res.status).toBe(200);
	});

	test("rejects invalid ackStage", async () => {
		const res = await app.request("/api/ack", {
			method: "POST",
			headers: { "content-type": "application/json" },
			body: JSON.stringify({
				alertId: "alert-1",
				transport: "SSE",
				receivedAtClient: Date.now(),
				serverTimestamp: Date.now(),
				ackStage: "INVALID",
			}),
		});
		expect(res.status).toBe(400);
	});
});
