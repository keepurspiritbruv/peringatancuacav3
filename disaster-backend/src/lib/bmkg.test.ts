import { describe, test, expect, beforeEach, mock } from "bun:test";
import { Hono } from "hono";
import type { BmkgWeatherData } from "./bmkg";

const mockBmkgFetchData = mock<(beachSlug: string) => Promise<BmkgWeatherData | null>>();

mock.module("./bmkg-fetch", () => ({
	getBmkgData: mockBmkgFetchData,
}));

import { fetchBmkgWeather, fetchBmkgWarning } from "./bmkg";

describe("fetchBmkgWeather", () => {
	beforeEach(() => {
		mockBmkgFetchData.mockClear();
	});

	test("returns default data when BMKG fetch fails", async () => {
		mockBmkgFetchData.mockResolvedValue(null);
		const result = await fetchBmkgWeather("pantai_lampuuk");
		expect(result.weather).toBe("Tidak tersedia");
		expect(result.windSpeed).toBeNull();
		expect(result.isSafe).toBeNull();
	});

	test("maps BMKG data correctly", async () => {
		mockBmkgFetchData.mockResolvedValue({
			weather: "Cerah",
			windSpeed: 10,
			windDirection: "Timur",
			temperature: 30,
			humidity: 70,
			weatherCode: 1,
			weatherIcon: "01d",
			description: "Cerah",
			isSafe: true,
			warningText: null,
			fetchedAt: 1000000,
		});

		const result = await fetchBmkgWeather("pantai_lampuuk");
		expect(result.weather).toBe("Cerah");
		expect(result.windSpeed).toBe(10);
		expect(result.isSafe).toBe(true);
	});

	test("sets warningText when not safe", async () => {
		mockBmkgFetchData.mockResolvedValue({
			weather: "Hujan Lebat",
			windSpeed: 50,
			windDirection: "Barat",
			temperature: 25,
			humidity: 90,
			weatherCode: 3,
			weatherIcon: "09d",
			description: "Hujan Lebat",
			isSafe: false,
			warningText: null,
			fetchedAt: 1000000,
		});

		const result = await fetchBmkgWeather("pantai_lampuuk");
		expect(result.isSafe).toBe(false);
		expect(result.warningText).toContain("Hujan Lebat");
	});
});

describe("fetchBmkgWarning", () => {
	beforeEach(() => {
		mockBmkgFetchData.mockClear();
	});

	test("returns null when BMKG data is null", async () => {
		mockBmkgFetchData.mockResolvedValue(null);
		const result = await fetchBmkgWarning("pantai_lampuuk");
		expect(result).toBeNull();
	});

	test("returns null when isSafe is true", async () => {
		mockBmkgFetchData.mockResolvedValue({
			weather: "Cerah",
			windSpeed: 5,
			windDirection: "Timur",
			temperature: 30,
			humidity: 60,
			weatherCode: 1,
			weatherIcon: "01d",
			description: "Cerah",
			isSafe: true,
			warningText: null,
			fetchedAt: 1000000,
		});
		const result = await fetchBmkgWarning("pantai_lampuuk");
		expect(result).toBeNull();
	});

	test("returns warning string when not safe", async () => {
		mockBmkgFetchData.mockResolvedValue({
			weather: "Badai",
			windSpeed: 80,
			windDirection: "Barat",
			temperature: 20,
			humidity: 95,
			weatherCode: 5,
			weatherIcon: "11d",
			description: "Badai Petir",
			isSafe: false,
			warningText: null,
			fetchedAt: 1000000,
		});
		const result = await fetchBmkgWarning("pantai_lampuuk");
		expect(result).toContain("Badai");
		expect(result).toContain("80");
	});
});
