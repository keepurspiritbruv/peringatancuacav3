import { redis } from "./redis";
import { REPORT_RATE_LIMIT_MAX, REPORT_RATE_LIMIT_WINDOW_SECONDS } from "../config";

const RATE_LIMIT_PREFIX = "ratelimit:report";

/**
 * Anonymous, account-free flood guard. Counts requests per IP in a fixed
 * window using a Redis counter with TTL. Does not limit how many reports
 * count toward a beach's crowdsource threshold — only raw request volume.
 */
export async function checkReportRateLimit(
	ip: string,
): Promise<{ allowed: boolean; count: number; limit: number }> {
	const key = `${RATE_LIMIT_PREFIX}:${ip}`;
	const count = await redis.incr(key);
	if (count === 1) {
		await redis.expire(key, REPORT_RATE_LIMIT_WINDOW_SECONDS);
	}
	return { allowed: count <= REPORT_RATE_LIMIT_MAX, count, limit: REPORT_RATE_LIMIT_MAX };
}

/** Extract the client IP from an x-forwarded-for header (first hop). */
export function getClientIp(forwardedFor: string | undefined | null): string {
	if (!forwardedFor) return "unknown";
	const first = forwardedFor.split(",")[0]?.trim();
	return first && first.length > 0 ? first : "unknown";
}
