import { describe, test, expect, mock, beforeEach } from "bun:test";
import { Hono } from "hono";

const mockProcessReport = mock<(beach: string, codes: string[], windowMs: number, threshold: number) => Promise<{ triggeredCodes: string[]; codeCounts: Record<string, number> }>>();
const mockGetActiveWarning = mock<(beach: string) => Promise<unknown>>();
const mockSetActiveWarning = mock<() => Promise<void>>();
const mockGetReportTimeRange = mock<() => Promise<{ firstReportAt: number; lastReportAt: number }>>();
const mockPersistReport = mock<() => Promise<unknown>>();
const mockPersistShapPrediction = mock<() => Promise<unknown>>();
const mockReassure = mock<() => Promise<unknown>>();
const mockXAdd = mock<() => Promise<string>>();
const mockPublish = mock<() => Promise<number>>();
const mockGet = mock<() => Promise<string | null>>();
const mockSet = mock<() => Promise<string | null>>();
const mockDel = mock<() => Promise<number>>();
const mockPublishIotAlertForEvent = mock<() => Promise<{ published: boolean; reason?: string; topic?: string }>>();

mock.module("../lib/redis", () => ({
	redis: {
		xAdd: mockXAdd,
		publish: mockPublish,
		get: mockGet,
		set: mockSet,
		del: mockDel,
	},
}));

mock.module("../lib/crowdsource", () => ({
	processReport: mockProcessReport,
	getActiveWarning: mockGetActiveWarning,
	setActiveWarning: mockSetActiveWarning,
	getReportTimeRange: mockGetReportTimeRange,
}));

mock.module("../lib/bmkg", () => ({
	persistReport: mockPersistReport,
	persistShapPrediction: mockPersistShapPrediction,
}));

mock.module("../lib/reassurance", () => ({
	reassure: mockReassure,
}));

mock.module("../lib/openclaw", () => ({
	sendOpenClawAlert: mock(async () => {}),
}));

mock.module("../lib/iot-mqtt", () => ({
	publishIotAlertForEvent: mockPublishIotAlertForEvent,
}));

mock.module("../config", () => ({
	ALERTS_CHANNEL: "alerts:high",
	ALERTS_STREAM: "alerts:stream",
	ML_BASE_URL: "http://localhost:8000",
	REPORT_DEDUPE_PREFIX: "reports:dedupe",
	REPORT_SYNC_STREAM: "reports:sync",
	REPORT_WINDOW_MS: 600000,
	REPORT_THRESHOLD: 5,
	BEACH_THRESHOLDS: { pantai_lampuuk: 5, pantai_ulee_lheue: 5, pantai_depok: 5, pantai_samas: 5, pantai_lhoknga: 5 },
	ACTIVE_WARNING_TTL_SECONDS: 43200,
}));

import reportRoute from "./report";

const app = new Hono().route("/api", reportRoute);

describe("POST /api/report", () => {
	beforeEach(() => {
		mockProcessReport.mockClear();
		mockGetActiveWarning.mockClear();
		mockSetActiveWarning.mockClear();
		mockGetReportTimeRange.mockClear();
		mockPersistReport.mockClear();
		mockPersistShapPrediction.mockClear();
		mockReassure.mockClear();
		mockXAdd.mockClear();
		mockPublish.mockClear();
		mockGet.mockClear();
		mockSet.mockClear();
		mockDel.mockClear();
		mockPublishIotAlertForEvent.mockClear();
		mockPublishIotAlertForEvent.mockResolvedValue({ published: false, reason: "disabled" });
	});

	test("rejects missing lik_codes", async () => {
		const res = await app.request("/api/report", {
			method: "POST",
			headers: { "content-type": "application/json" },
			body: JSON.stringify({ beach_location: "pantai_lampuuk" }),
		});
		expect(res.status).toBe(400);
		const body = await res.json();
		expect(body.error).toContain("lik_codes");
	});

	test("rejects empty lik_codes array", async () => {
		const res = await app.request("/api/report", {
			method: "POST",
			headers: { "content-type": "application/json" },
			body: JSON.stringify({ beach_location: "pantai_lampuuk", lik_codes: [] }),
		});
		expect(res.status).toBe(400);
	});

	test("rejects missing beach_location", async () => {
		const res = await app.request("/api/report", {
			method: "POST",
			headers: { "content-type": "application/json" },
			body: JSON.stringify({ lik_codes: ["Wn-1"] }),
		});
		expect(res.status).toBe(400);
		const body = await res.json();
		expect(body.error).toContain("beach_location");
	});

	test("rejects invalid beach_location", async () => {
		const res = await app.request("/api/report", {
			method: "POST",
			headers: { "content-type": "application/json" },
			body: JSON.stringify({ beach_location: "pantai_tidak_ada", lik_codes: ["Wn-1"] }),
		});
		expect(res.status).toBe(400);
	});

	test("rejects invalid clientReportId", async () => {
		const res = await app.request("/api/report", {
			method: "POST",
			headers: { "content-type": "application/json" },
			body: JSON.stringify({ beach_location: "pantai_lampuuk", lik_codes: ["Wn-1"], clientReportId: "not-a-uuid" }),
		});
		expect(res.status).toBe(400);
	});

	test("rejects invalid createdAtClient", async () => {
		const res = await app.request("/api/report", {
			method: "POST",
			headers: { "content-type": "application/json" },
			body: JSON.stringify({ beach_location: "pantai_lampuuk", lik_codes: ["Wn-1"], createdAtClient: -100 }),
		});
		expect(res.status).toBe(400);
	});

	test("returns queued when threshold not hit", async () => {
		mockProcessReport.mockResolvedValue({ triggeredCodes: [], codeCounts: { "Wn-1": 1 } });
		mockXAdd.mockResolvedValue("0-0");

		const res = await app.request("/api/report", {
			method: "POST",
			headers: { "content-type": "application/json" },
			body: JSON.stringify({ beach_location: "pantai_lampuuk", lik_codes: ["Wn-1"] }),
		});

		expect(res.status).toBe(200);
		const body = await res.json();
		expect(body.ok).toBe(true);
		expect(body.status).toBe("queued");
		expect(body.reportCounts).toBeDefined();
	});

	test("returns alert when threshold is hit", async () => {
		mockProcessReport.mockResolvedValue({ triggeredCodes: ["Wn-1"], codeCounts: { "Wn-1": 5 } });
		mockGetActiveWarning.mockResolvedValue(null);
		mockGetReportTimeRange.mockResolvedValue({ firstReportAt: 1000, lastReportAt: 2000 });
		mockPersistReport.mockResolvedValue({ id: "report-1" });
		mockPersistShapPrediction.mockResolvedValue({ id: 1 });
		mockReassure.mockResolvedValue({ finalLevel: "HIGH", agreed: true });
		mockXAdd.mockResolvedValue("0-0");
		mockPublish.mockResolvedValue(1);
		mockSet.mockResolvedValue("OK");

		const originalFetch = globalThis.fetch;
		globalThis.fetch = mock(async (url: string) => {
			if (url.includes("/predict")) {
				return new Response(JSON.stringify({
					active_warning: ["Wn-1"],
					sign_description: "Awan gelap",
					community_characteristics: "Actionable",
					action_recommendation: "Segera evakuasi",
				}), { status: 200, headers: { "content-type": "application/json" } });
			}
			return new Response("not found", { status: 404 });
		}) as unknown as typeof fetch;

		const res = await app.request("/api/report", {
			method: "POST",
			headers: { "content-type": "application/json" },
			body: JSON.stringify({ beach_location: "pantai_lampuuk", lik_codes: ["Wn-1"] }),
		});

		globalThis.fetch = originalFetch;

		expect(res.status).toBe(200);
		const body = await res.json();
		expect(body.ok).toBe(true);
		expect(body.shouldDistribute).toBe(true);
		expect(body.alertEvent).toBeDefined();
		expect(body.alertEvent.riskLevel).toBeDefined();
		expect(body.alertEvent.reporterCount).toBe(5);
		expect(body.alertEvent.firstReportAt).toBe(1000);
		expect(body.alertEvent.lastReportAt).toBe(2000);
		expect(mockPublish).toHaveBeenCalled();
	});

	test("publishes triggered SIAGA alerts to MQTT IoT channel", async () => {
		mockProcessReport.mockResolvedValue({ triggeredCodes: ["Wn-1"], codeCounts: { "Wn-1": 5 } });
		mockGetActiveWarning.mockResolvedValue(null);
		mockGetReportTimeRange.mockResolvedValue({ firstReportAt: 1000, lastReportAt: 2000 });
		mockPersistReport.mockResolvedValue({ id: "report-1" });
		mockPersistShapPrediction.mockResolvedValue({ id: 1 });
		mockReassure.mockResolvedValue({ finalLevel: "SIAGA", agreed: true });
		mockXAdd.mockResolvedValue("0-0");
		mockPublish.mockResolvedValue(1);
		mockSet.mockResolvedValue("OK");
		mockPublishIotAlertForEvent.mockResolvedValue({ published: true, topic: "alert/pantai_lampuuk" });

		const originalFetch = globalThis.fetch;
		globalThis.fetch = mock(async (url: string) => {
			if (url.includes("/predict")) {
				return new Response(JSON.stringify({
					active_warning: ["Wn-1"],
					sign_description: "Awan gelap",
					community_characteristics: "Actionable",
					action_recommendation: "Siaga penuh",
					triggered_lik_codes: ["Wn-1"],
				}), { status: 200, headers: { "content-type": "application/json" } });
			}
			return new Response("not found", { status: 404 });
		}) as unknown as typeof fetch;

		const res = await app.request("/api/report", {
			method: "POST",
			headers: { "content-type": "application/json" },
			body: JSON.stringify({ beach_location: "pantai_lampuuk", lik_codes: ["Wn-1"] }),
		});

		globalThis.fetch = originalFetch;

		expect(res.status).toBe(200);
		expect(mockPublishIotAlertForEvent).toHaveBeenCalledTimes(1);
		const alertEvent = mockPublishIotAlertForEvent.mock.calls[0][0] as Record<string, unknown>;
		expect(alertEvent.beachLocation).toBe("pantai_lampuuk");
		expect((alertEvent.reassurance as Record<string, unknown>).finalLevel).toBe("SIAGA");
	});

	test("returns 502 when ML fails", async () => {
		mockProcessReport.mockResolvedValue({ triggeredCodes: ["Wn-1"], codeCounts: { "Wn-1": 5 } });
		mockGetActiveWarning.mockResolvedValue(null);
		mockXAdd.mockResolvedValue("0-0");

		const originalFetch = globalThis.fetch;
		globalThis.fetch = mock(async (url: string) => {
			if (url.includes("/predict")) {
				return new Response("Internal Server Error", { status: 500 });
			}
			return new Response("not found", { status: 404 });
		}) as unknown as typeof fetch;

		const res = await app.request("/api/report", {
			method: "POST",
			headers: { "content-type": "application/json" },
			body: JSON.stringify({ beach_location: "pantai_lampuuk", lik_codes: ["Wn-1"] }),
		});

		globalThis.fetch = originalFetch;

		expect(res.status).toBe(502);
		const body = await res.json();
		expect(body.error).toContain("ML");
	});
});
