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

describe("GET /alerts/:id/explanation", () => {
	beforeEach(() => {
		mockXRrange.mockClear();
	});

	test("returns explanation for alert with ML explanation data", async () => {
		const payload = {
			eventType: "DISASTER_ALERT",
			alertId: "test-alert-explain-1",
			serverTimestamp: 1000000,
			reportId: "report-001",
			beachLocation: "pantai_samas",
			riskLevel: "unsafe-high",
			decision: { community_characteristics: "Low Actionable", shouldDistribute: true, is_multisign: true },
			input: { beach_location: "pantai_samas", lik_codes: ["wn-4"] },
			ml: {
				sign_description: "Ombak besar",
				community_characteristics: "Low Actionable",
				action_recommendation: "Siaga penuh",
				triggered_lik_codes: ["Wn-4"],
				explanation: {
					summary_id: "Bahaya karena ombak besar (40%), frekuensi pelaporan (30%)",
					summary_en: "Danger due to high waves (40%), reporting frequency (30%)",
					contributions: [
						{ factor: "Wn-4", label_id: "Ombak Besar", label_en: "High Waves", category: "natural_sign", weight: 0.4, direction: "increases_risk", detail_id: "Gelombang tinggi", detail_en: "High waves detected" },
						{ factor: "frequency", label_id: "Frekuensi Pelaporan", label_en: "Reporting Frequency", category: "community", weight: 0.3, direction: "increases_risk", detail_id: "Jarang melapor", detail_en: "Rarely reports" },
					],
					community_profile: {
						beach: "pantai_samas",
						overall: "Unsafe",
						factors: [
							{ key: "interaction", label_id: "Interaksi Bencana", label_en: "Disaster Interaction", value: 2.13, status: "Safe", detail_id: "Cukup", detail_en: "Adequate" },
							{ key: "frequency", label_id: "Frekuensi", label_en: "Frequency", value: 2.59, status: "Unsafe", detail_id: "Jarang", detail_en: "Rarely" },
						],
					},
				},
			},
		};

		mockXRrange.mockResolvedValue([
			{ id: "1000000-0", message: { json: JSON.stringify(payload) } },
		]);

		const res = await app.request("/api/alerts/test-alert-explain-1/explanation");
		const body = await res.json();

		expect(res.status).toBe(200);
		expect(body.ok).toBe(true);
		expect(body.data.alertId).toBe("test-alert-explain-1");
		expect(body.data.riskLevel).toBe("unsafe-high");
		expect(body.data.beachLocation).toBe("pantai_samas");
		expect(body.data.contributions).toHaveLength(2);
		expect(body.data.communityProfile.overall).toBe("Unsafe");
	});

	test("returns 404 when alert not found", async () => {
		mockXRrange.mockResolvedValue([]);

		const res = await app.request("/api/alerts/nonexistent-id/explanation");
		expect(res.status).toBe(404);
	});

	test("returns explanation without reassurance when not available", async () => {
		const payload = {
			eventType: "DISASTER_ALERT",
			alertId: "test-alert-no-reassurance",
			serverTimestamp: 1000000,
			reportId: "report-002",
			decision: { community_characteristics: "Actionable", shouldDistribute: true },
			input: { beach_location: "pantai_lampuuk", lik_codes: ["wn-2"] },
			ml: {
				sign_description: "Awan bergumpal",
				community_characteristics: "Actionable",
				action_recommendation: "Berhati-hati",
				explanation: {
					summary_id: "Bahaya karena awan bergumpal (30%)",
					summary_en: "Danger due to clustered clouds (30%)",
					contributions: [
						{ factor: "Wn-2", label_id: "Awan Bergumpal", label_en: "Clustered Clouds", category: "natural_sign", weight: 0.3, direction: "increases_risk", detail_id: "Awan bergumpal", detail_en: "Clustered clouds" },
					],
					community_profile: { beach: "pantai_lampuuk", overall: "Safe", factors: [] },
				},
			},
		};

		mockXRrange.mockResolvedValue([
			{ id: "1000000-0", message: { json: JSON.stringify(payload) } },
		]);

		const res = await app.request("/api/alerts/test-alert-no-reassurance/explanation");
		const body = await res.json();

		expect(res.status).toBe(200);
		expect(body.data.reassurance).toBeNull();
	});
});
