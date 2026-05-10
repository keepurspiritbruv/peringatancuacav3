import { describe, test, expect, beforeEach, mock } from "bun:test";
import { Hono } from "hono";

const mockXRrange = mock<(stream: string, min: string, max: string, opts?: { COUNT: number }) => Promise<unknown[]>>();

mock.module("../lib/redis", () => ({
	redis: { xRange: mockXRrange },
}));

mock.module("../config", () => ({
	ALERTS_STREAM: "alerts:stream",
}));

import alertsRoute from "./alerts";

const app = new Hono().route("/api", alertsRoute);

describe("GET /alerts", () => {
	beforeEach(() => {
		mockXRrange.mockClear();
	});

	test("returns empty array when stream is empty", async () => {
		mockXRrange.mockResolvedValue([]);

		const res = await app.request("/api/alerts");
		const body = await res.json();

		expect(res.status).toBe(200);
		expect(body).toEqual({ ok: true, data: [] });
	});

	test("maps stream entries to alert objects correctly", async () => {
		const payload = {
			eventType: "DISASTER_ALERT",
			alertId: "test-alert-1",
			serverTimestamp: 1000000,
			decision: { community_characteristics: "Low Actionable", shouldDistribute: true },
			input: { beach_location: "pantai_lampuuk", lik_codes: ["wn-1"] },
			ml: {
				sign_description: "Awan turun",
				community_characteristics: "Low Actionable",
				action_recommendation: "Stay alert",
			},
		};

		mockXRrange.mockResolvedValue([
			{ id: "1000000-0", message: { json: JSON.stringify(payload) } },
		]);

		const res = await app.request("/api/alerts");
		const body = await res.json();

		expect(res.status).toBe(200);
		expect(body.ok).toBe(true);
		expect(body.data).toHaveLength(1);

		const alert = body.data[0];
		expect(alert.alertId).toBe("test-alert-1");
		expect(alert.beachLocation).toBe("pantai_lampuuk");
		expect(alert.riskLevel).toBe("safe");
		expect(alert.reporterCount).toBe(0);
		expect(alert.signDescription).toBe("Awan turun");
		expect(alert.actionRecommendation).toBe("Stay alert");
		expect(alert.triggeredCodes).toEqual(["wn-1"]);
	});

	test("returns most recent alerts first (reversed)", async () => {
		mockXRrange.mockResolvedValue([
			{ id: "1000-0", message: { json: JSON.stringify({ alertId: "old", serverTimestamp: 1000 }) } },
			{ id: "2000-0", message: { json: JSON.stringify({ alertId: "new", serverTimestamp: 2000 }) } },
		]);

		const res = await app.request("/api/alerts");
		const body = await res.json();

		expect(body.data[0].alertId).toBe("new");
		expect(body.data[1].alertId).toBe("old");
	});
});
