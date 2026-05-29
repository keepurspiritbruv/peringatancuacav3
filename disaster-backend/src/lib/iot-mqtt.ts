import {
	ENABLE_IOT_MQTT_DELIVERY,
	MQTT_ALARM_DURATION_MS,
	MQTT_BROKER_URL,
	MQTT_PASSWORD,
	MQTT_PUBLISH_TIMEOUT_MS,
	MQTT_QOS,
	MQTT_RETAIN,
	MQTT_TOPIC_PREFIX,
	MQTT_USERNAME,
} from "../config";

export type IotMqttConfig = {
	enabled: boolean;
	brokerUrl: string;
	topicPrefix: string;
	qos: 0 | 1 | 2;
	retain: boolean;
	alarmDurationMs: number;
	publishTimeoutMs?: number;
	username?: string;
	password?: string;
};

type MqttClientLike = {
	on(event: string, handler: (...args: unknown[]) => void): MqttClientLike;
	publish(
		topic: string,
		payload: string,
		options: { qos: 0 | 1 | 2; retain: boolean },
		callback: (err?: Error) => void,
	): void;
};

type IotPublication = {
	topic: string;
	payload: string;
	qos: 0 | 1 | 2;
	retain: boolean;
};

export const IOT_MQTT_CONFIG: IotMqttConfig = {
	enabled: ENABLE_IOT_MQTT_DELIVERY,
	brokerUrl: MQTT_BROKER_URL,
	topicPrefix: MQTT_TOPIC_PREFIX,
	qos: MQTT_QOS,
	retain: MQTT_RETAIN,
	alarmDurationMs: Number.isFinite(MQTT_ALARM_DURATION_MS) && MQTT_ALARM_DURATION_MS > 0
		? MQTT_ALARM_DURATION_MS
		: 15000,
	publishTimeoutMs: Number.isFinite(MQTT_PUBLISH_TIMEOUT_MS) && MQTT_PUBLISH_TIMEOUT_MS > 0
		? MQTT_PUBLISH_TIMEOUT_MS
		: 2000,
	username: MQTT_USERNAME || undefined,
	password: MQTT_PASSWORD || undefined,
};

let mqttClient: MqttClientLike | null = null;
let mqttClientBrokerUrl = "";

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null;
}

function readNestedString(source: unknown, keys: string[]): string | null {
	if (!isRecord(source)) return null;

	let current: unknown = source;
	for (const key of keys) {
		if (!isRecord(current)) return null;
		current = current[key];
	}

	return typeof current === "string" ? current : null;
}

function readStringArray(source: unknown, keys: string[]): string[] {
	if (!isRecord(source)) return [];

	let current: unknown = source;
	for (const key of keys) {
		if (!isRecord(current)) return [];
		current = current[key];
	}

	return Array.isArray(current)
		? current.filter((item): item is string => typeof item === "string")
		: [];
}

function normalizeTopicPart(value: string): string {
	return value
		.trim()
		.toLowerCase()
		.replace(/[^a-z0-9_-]+/g, "_")
		.replace(/^_+|_+$/g, "");
}

export function normalizeIotRiskLevel(alertEvent: unknown): string | null {
	const rawLevel =
		readNestedString(alertEvent, ["reassurance", "finalLevel"])
		?? readNestedString(alertEvent, ["decision", "final_risk_level"])
		?? readNestedString(alertEvent, ["decision", "finalLevel"])
		?? readNestedString(alertEvent, ["riskLevel"]);

	if (!rawLevel) return null;

	const level = rawLevel.trim().toUpperCase();
	if (level === "SIAGA" || level === "EKSTREM" || level === "WASPADA" || level === "NORMAL") {
		return level;
	}

	return null;
}

export function shouldTriggerIotAlert(alertEvent: unknown): boolean {
	const level = normalizeIotRiskLevel(alertEvent);
	return level === "SIAGA" || level === "EKSTREM";
}

export function buildIotAlertPublication(
	alertEvent: unknown,
	config: IotMqttConfig = IOT_MQTT_CONFIG,
): IotPublication | null {
	if (!shouldTriggerIotAlert(alertEvent)) return null;
	if (!isRecord(alertEvent)) return null;

	const beachLocation = typeof alertEvent.beachLocation === "string"
		? normalizeTopicPart(alertEvent.beachLocation)
		: "";
	if (!beachLocation) return null;

	const prefix = normalizeTopicPart(config.topicPrefix) || "alert";
	const riskLevel = normalizeIotRiskLevel(alertEvent);
	const payload = {
		eventType: "IOT_ALERT_COMMAND",
		command: "ALARM_ON",
		alertId: typeof alertEvent.alertId === "string" ? alertEvent.alertId : null,
		reportId: typeof alertEvent.reportId === "string" ? alertEvent.reportId : null,
		serverTimestamp: typeof alertEvent.serverTimestamp === "number" ? alertEvent.serverTimestamp : Date.now(),
		beachLocation,
		riskLevel,
		durationMs: config.alarmDurationMs,
		reporterCount: typeof alertEvent.reporterCount === "number" ? alertEvent.reporterCount : null,
		triggeredLikCodes: readStringArray(alertEvent, ["ml", "triggered_lik_codes"]),
		actionRecommendation: readNestedString(alertEvent, ["ml", "action_recommendation"]),
	};

	return {
		topic: `${prefix}/${beachLocation}`,
		payload: JSON.stringify(payload),
		qos: config.qos,
		retain: config.retain,
	};
}

async function getMqttClient(config: IotMqttConfig): Promise<MqttClientLike> {
	if (mqttClient && mqttClientBrokerUrl === config.brokerUrl) return mqttClient;

	const mqtt = await import("mqtt") as {
		connect: (url: string, options: Record<string, unknown>) => MqttClientLike;
	};

	const clientId = `peringatan-backend-${crypto.randomUUID()}`;
	mqttClient = mqtt.connect(config.brokerUrl, {
		clientId,
		reconnectPeriod: 5000,
		connectTimeout: 5000,
		...(config.username ? { username: config.username } : {}),
		...(config.password ? { password: config.password } : {}),
	});
	mqttClientBrokerUrl = config.brokerUrl;

	mqttClient.on("connect", () => {
		console.log("[iot-mqtt] connected", config.brokerUrl);
	});
	mqttClient.on("error", (err) => {
		console.error("[iot-mqtt] client error", err);
	});

	return mqttClient;
}

export async function publishIotAlertForEvent(
	alertEvent: unknown,
	config: IotMqttConfig = IOT_MQTT_CONFIG,
): Promise<{ published: boolean; reason?: string; topic?: string; error?: string }> {
	if (!config.enabled) return { published: false, reason: "disabled" };
	if (!config.brokerUrl.trim()) return { published: false, reason: "missing-broker-url" };

	const publication = buildIotAlertPublication(alertEvent, config);
	if (!publication) return { published: false, reason: "level-not-actionable" };

	try {
		const client = await getMqttClient(config);
		const timeoutMs = config.publishTimeoutMs ?? 2000;
		await Promise.race([
			new Promise<void>((resolve, reject) => {
				client.publish(
					publication.topic,
					publication.payload,
					{ qos: publication.qos, retain: publication.retain },
					(err?: Error) => {
						if (err) {
							reject(err);
							return;
						}
						resolve();
					},
				);
			}),
			new Promise<void>((_, reject) => {
				setTimeout(() => reject(new Error(`MQTT publish timed out after ${timeoutMs}ms`)), timeoutMs);
			}),
		]);
		return { published: true, topic: publication.topic };
	} catch (err) {
		const message = err instanceof Error ? err.message : String(err);
		console.error("[iot-mqtt] publish failed", message);
		return { published: false, reason: "publish-failed", topic: publication.topic, error: message };
	}
}
