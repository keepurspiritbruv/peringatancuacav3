import { OPENCLAW_GATEWAY_URL, OPENCLAW_HOOK_TOKEN, OPENCLAW_BROADCAST_GROUPS } from "../config";

export async function sendOpenClawAlert(text: string): Promise<void> {
	if (!OPENCLAW_GATEWAY_URL || !OPENCLAW_HOOK_TOKEN) {
		console.warn("[openclaw] OpenClaw not configured, skipping broadcast");
		return;
	}

	for (const chatId of OPENCLAW_BROADCAST_GROUPS) {
		try {
			const res = await fetch(`${OPENCLAW_GATEWAY_URL}/hooks/agent`, {
				method: "POST",
				headers: {
					"Content-Type": "application/json",
					"Authorization": `Bearer ${OPENCLAW_HOOK_TOKEN}`,
				},
				body: JSON.stringify({
					message: text,
					channel: "whatsapp",
					to: chatId,
					deliver: true,
				}),
			});
			if (!res.ok) {
				const detail = await res.text().catch(() => "");
				console.error(`[openclaw] hooks/agent failed for ${chatId}: ${res.status} ${detail}`);
			}
		} catch (err) {
			console.error(`[openclaw] hooks/agent error for ${chatId}:`, err);
		}
	}
}
