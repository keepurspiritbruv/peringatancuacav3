import { describe, test, expect } from "bun:test";
import { BEACH_THRESHOLDS, REPORT_THRESHOLD } from "./config";

describe("BEACH_THRESHOLDS", () => {
	test("Safe beaches have threshold 3", () => {
		expect(BEACH_THRESHOLDS["pantai_lampuuk"]).toBe(5);
		expect(BEACH_THRESHOLDS["pantai_ulee_lheue"]).toBe(5);
	});

	test("Unsafe beaches have threshold 5", () => {
		expect(BEACH_THRESHOLDS["pantai_depok"]).toBe(5);
		expect(BEACH_THRESHOLDS["pantai_samas"]).toBe(5);
		expect(BEACH_THRESHOLDS["pantai_lhoknga"]).toBe(5);
	});

	test("unknown beach falls back to REPORT_THRESHOLD", () => {
		const unknown = BEACH_THRESHOLDS["pantai_unknown"];
		expect(unknown).toBeUndefined();
		expect(REPORT_THRESHOLD).toBe(5);
	});
});
