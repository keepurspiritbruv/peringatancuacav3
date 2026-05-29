import { describe, expect, test } from "bun:test";
import {
	buildIotAlertPublication,
	normalizeIotRiskLevel,
	shouldTriggerIotAlert,
	type IotMqttConfig,
} from "./iot-mqtt";

const config: IotMqttConfig = {
	enabled: true,
	brokerUrl: "mqtt://mosquitto:1883",
	topicPrefix: "alert",
	qos: 1,
	retain: false,
	alarmDurationMs: 15000,
};

describe("IoT MQTT alert gating", () => {
	test("normalizes final risk level from reassurance first", () => {
		const level = normalizeIotRiskLevel({
			riskLevel: "unsafe",
			decision: { final_risk_level: "WASPADA" },
			reassurance: { finalLevel: "SIAGA" },
		});

		expect(level).toBe("SIAGA");
	});

	test("falls back to decision final_risk_level", () => {
		const level = normalizeIotRiskLevel({
			riskLevel: "unsafe-high",
			decision: { final_risk_level: "ekstrem" },
		});

		expect(level).toBe("EKSTREM");
	});

	test("triggers only SIAGA and EKSTREM", () => {
		expect(shouldTriggerIotAlert({ reassurance: { finalLevel: "SIAGA" } })).toBe(true);
		expect(shouldTriggerIotAlert({ reassurance: { finalLevel: "EKSTREM" } })).toBe(true);
		expect(shouldTriggerIotAlert({ reassurance: { finalLevel: "WASPADA" } })).toBe(false);
		expect(shouldTriggerIotAlert({ reassurance: { finalLevel: "NORMAL" } })).toBe(false);
	});

	test("builds per-beach MQTT publication for SIAGA", () => {
		const publication = buildIotAlertPublication({
			alertId: "alert-1",
			reportId: "report-1",
			serverTimestamp: 1234567890,
			beachLocation: "pantai_lampuuk",
			reporterCount: 5,
			reassurance: { finalLevel: "SIAGA" },
			ml: {
				action_recommendation: "Siaga penuh / amankan alat tangkap",
				triggered_lik_codes: ["Wn-1"],
			},
		}, config);

		expect(publication?.topic).toBe("alert/pantai_lampuuk");
		expect(publication?.qos).toBe(1);
		expect(publication?.retain).toBe(false);

		const payload = JSON.parse(publication?.payload ?? "{}");
		expect(payload.command).toBe("ALARM_ON");
		expect(payload.riskLevel).toBe("SIAGA");
		expect(payload.beachLocation).toBe("pantai_lampuuk");
		expect(payload.durationMs).toBe(15000);
		expect(payload.triggeredLikCodes).toEqual(["Wn-1"]);
	});

	test("does not build MQTT publication for WASPADA", () => {
		const publication = buildIotAlertPublication({
			alertId: "alert-2",
			serverTimestamp: 1234567890,
			beachLocation: "pantai_lampuuk",
			reassurance: { finalLevel: "WASPADA" },
		}, config);

		expect(publication).toBeNull();
	});
});
