import { describe, test, expect, beforeEach, mock } from "bun:test";
import { Hono } from "hono";

const mockGetBmkgData = mock<(beach: string) => Promise<unknown>>();

mock.module("../lib/bmkg-fetch", () => ({
	getBmkgData: mockGetBmkgData,
}));

mock.module("../types", () => ({
	ALLOWED_BEACH_LOCATIONS: ["pantai_lampuuk", "pantai_lhoknga", "pantai_ulee_lheue", "pantai_depok", "pantai_samas"],
}));

import bmkgRoute from "./bmkg";

const app = new Hono().route("/api", bmkgRoute);

describe("GET /api/bmkg", () => {
	beforeEach(() => {
		mockGetBmkgData.mockClear();
	});

	test("GET /bmkg/:beach returns data for valid beach", async () => {
		mockGetBmkgData.mockResolvedValue({ weather: "Cerah", windSpeed: 10 });

		const res = await app.request("/api/bmkg/pantai_lampuuk");
		expect(res.status).toBe(200);

		const body = await res.json();
		expect(body.ok).toBe(true);
		expect(body.data).toEqual({ weather: "Cerah", windSpeed: 10 });
	});

	test("GET /bmkg/:beach returns 400 for invalid beach", async () => {
		const res = await app.request("/api/bmkg/pantai_invalid");
		expect(res.status).toBe(400);

		const body = await res.json();
		expect(body.ok).toBe(false);
		expect(body.error).toContain("Unknown beach");
	});

	test("GET /bmkg returns data for all beaches", async () => {
		mockGetBmkgData.mockResolvedValue({ weather: "Cerah", fetchedAt: 123 });

		const res = await app.request("/api/bmkg");
		expect(res.status).toBe(200);

		const body = await res.json();
		expect(body.ok).toBe(true);
		expect(body.data.length).toBe(5);
	});
});
