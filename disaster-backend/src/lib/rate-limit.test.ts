import { describe, test, expect, beforeEach, mock } from "bun:test";

const mockRedis = {
	incr: mock<(key: string) => Promise<number>>(),
	expire: mock<(key: string, seconds: number) => Promise<boolean>>(),
};

mock.module("./redis", () => ({ redis: mockRedis }));

mock.module("../config", () => ({
	REPORT_RATE_LIMIT_MAX: 3,
	REPORT_RATE_LIMIT_WINDOW_SECONDS: 60,
}));

import { checkReportRateLimit, getClientIp } from "./rate-limit";

describe("checkReportRateLimit", () => {
	beforeEach(() => {
		mockRedis.incr.mockClear();
		mockRedis.expire.mockClear().mockResolvedValue(true);
	});

	test("allows the first request and sets the window TTL", async () => {
		mockRedis.incr.mockResolvedValue(1);
		const result = await checkReportRateLimit("1.2.3.4");
		expect(result.allowed).toBe(true);
		expect(result.count).toBe(1);
		expect(mockRedis.expire).toHaveBeenCalledWith("ratelimit:report:1.2.3.4", 60);
	});

	test("allows requests up to the limit without resetting TTL", async () => {
		mockRedis.incr.mockResolvedValue(3);
		const result = await checkReportRateLimit("1.2.3.4");
		expect(result.allowed).toBe(true);
		expect(mockRedis.expire).not.toHaveBeenCalled();
	});

	test("blocks requests beyond the limit", async () => {
		mockRedis.incr.mockResolvedValue(4);
		const result = await checkReportRateLimit("1.2.3.4");
		expect(result.allowed).toBe(false);
		expect(result.count).toBe(4);
		expect(result.limit).toBe(3);
	});
});

describe("getClientIp", () => {
	test("takes the first IP from x-forwarded-for", () => {
		expect(getClientIp("203.0.113.7, 10.0.0.1")).toBe("203.0.113.7");
	});

	test("falls back to 'unknown' when header missing", () => {
		expect(getClientIp(undefined)).toBe("unknown");
		expect(getClientIp("")).toBe("unknown");
	});
});
