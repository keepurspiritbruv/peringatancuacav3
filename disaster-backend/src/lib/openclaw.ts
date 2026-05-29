import { OPENCLAW_BROADCAST_GROUPS } from "../config";
import { redis } from "./redis";

const OUTBOUND_STREAM = "openclaw:outbound";

export async function sendOpenClawAlert(text: string): Promise<void> {
	await redis.xAdd(OUTBOUND_STREAM, "*", {
		text,
		target: OPENCLAW_BROADCAST_GROUPS.join(","),
		timestamp: String(Date.now()),
		type: "broadcast",
	});
	console.log(`[openclaw] queued broadcast: ${(text || "").substring(0, 60)}`);
}

export async function sendOpenClawReply(toChatId: string, text: string): Promise<void> {
	await redis.xAdd(OUTBOUND_STREAM, "*", {
		text,
		target: toChatId,
		timestamp: String(Date.now()),
		type: "reply",
	});
	console.log(`[openclaw] queued reply to ${toChatId}: ${(text || "").substring(0, 60)}`);
}
