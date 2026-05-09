import { Hono } from "hono";
import { redis } from "../lib/redis";
import { ALERTS_STREAM } from "../config";

const route = new Hono();

route.get("/alerts", async (c) => {
	const limitParam = Number(c.req.query("limit") ?? "20");
	const limit = Math.min(Math.max(limitParam, 1), 50);

	const events = await redis.xRange(ALERTS_STREAM, "-", "+", { COUNT: limit });

	if (!events || events.length === 0) {
		return c.json({ ok: true, data: [] });
	}

	const alerts = events.map((event) => {
		const fields = (event as unknown as { id: string; message: Record<string, string> }).message;
		const parsed = JSON.parse(fields.json ?? "{}") as Record<string, unknown>;
		const ml = parsed.ml as Record<string, unknown> | undefined;
		const decision = parsed.decision as Record<string, unknown> | undefined;
		const input = parsed.input as Record<string, unknown> | undefined;

		return {
			alertId: (parsed.alertId as string) ?? "",
			beachLocation: (input?.beach_location as string) ?? "",
			riskLevel: (ml?.community_characteristics as string) ?? (decision?.community_characteristics as string) ?? "Unknown",
			communityCharacteristics: (decision?.community_characteristics as string) ?? "",
			actionRecommendation: (ml?.action_recommendation as string) ?? "",
			signDescription: (ml?.sign_description as string) ?? "",
			triggeredCodes: ((ml?.triggered_lik_codes as string[]) ?? (input?.lik_codes as string[]) ?? []),
			serverTimestamp: (parsed.serverTimestamp as number) ?? 0,
		};
	});

	const sorted = alerts.reverse().slice(0, limit);
	return c.json({ ok: true, data: sorted });
});

export default route;
