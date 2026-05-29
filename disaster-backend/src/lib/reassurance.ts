import { getDb } from "../db";
import { schema } from "../db";
import { eq } from "drizzle-orm";
import { fetchBmkgWeather, fetchBmkgWarning, saveSnapshot, fetchXgboostPrediction, persistXgboostPrediction, getBeachBySlug } from "./bmkg";
import type { XGBoostResult } from "./bmkg";
import type { BmkgWeatherData } from "./bmkg";

type ShapResult = {
	riskLevel: string;
	communityCharacteristics?: string;
	validatedSigns?: string[];
	actions?: string[];
	rawResponse?: Record<string, unknown>;
};

type ReassuranceResult = {
	shapRisk: string;
	bmkgRisk: string;
	xgboostRisk: number | null;
	xgboostLabel: string | null;
	agreed: boolean;
	finalLevel: "NORMAL" | "WASPADA" | "SIAGA" | "EKSTREM";
	finalLevelNumeric: number;
	details: Record<string, unknown>;
};

function determineBmkgRisk(weather: { windSpeed: number | null } | null, hasWarning: boolean): string {
	if (!weather) return "UNKNOWN";

	const windSpeed = weather.windSpeed ?? 0;

	if (windSpeed >= 46 || hasWarning) return "HIGH";
	if (windSpeed >= 30) return "MEDIUM";
	return "LOW";
}

type FinalLevel = "NORMAL" | "WASPADA" | "SIAGA" | "EKSTREM";

const LEVEL_MAP: Record<number, FinalLevel> = {
	0: "NORMAL",
	1: "WASPADA",
	2: "SIAGA",
	3: "EKSTREM",
};

function fusionDecision(
	xgboostResult: XGBoostResult | null,
	shapRisk: string,
	bmkgRisk: string,
): { finalLevel: FinalLevel; finalLevelNumeric: number; agreed: boolean } {
	const xgboostLevel = xgboostResult?.riskLevel ?? 0;

	let score = xgboostLevel;

	if (shapRisk === "HIGH" || shapRisk === "UNSAFE") {
		score = Math.max(score, 2);
	}

	if (bmkgRisk === "HIGH") {
		score = Math.max(score, 2);
	} else if (bmkgRisk === "MEDIUM") {
		score = Math.max(score, 1);
	}

	let highCount = 0;
	if (xgboostLevel >= 2) highCount++;
	if (shapRisk === "HIGH" || shapRisk === "UNSAFE") highCount++;
	if (bmkgRisk === "HIGH") highCount++;

	if (highCount >= 2) {
		score = Math.min(score + 1, 3);
	}

	score = Math.min(Math.max(score, 0), 3);

	const agreed = (shapRisk === "HIGH" || shapRisk === "UNSAFE")
		? bmkgRisk === "HIGH" || bmkgRisk === "MEDIUM" || (xgboostResult?.riskLevel ?? 0) >= 2
		: bmkgRisk === "LOW" && (xgboostResult?.riskLevel ?? 0) < 2;

	return {
		finalLevel: LEVEL_MAP[score],
		finalLevelNumeric: score,
		agreed,
	};
}

export async function reassure(
	predictionId: number,
	reportId: string,
	shapResult: ShapResult,
	beachSlug: string,
): Promise<ReassuranceResult> {
	const db = getDb();

	const beach = await getBeachBySlug(beachSlug);
	const beachId = beach?.id ?? null;
	if (!beachId) {
		console.warn("[reassurance] Beach not found:", beachSlug);
	}

	const weather: BmkgWeatherData | null = await fetchBmkgWeather(beachSlug).catch(() => null);
	const warning: string | null = await fetchBmkgWarning(beachSlug).catch(() => null);

	if (beachId && weather) {
		await saveSnapshot(beachId, { weather, warning }).catch(() => {});
	}

	let xgboostResult: XGBoostResult | null = null;
	if (weather) {
		xgboostResult = await fetchXgboostPrediction(beachSlug, weather);
	}

	if (beachId && xgboostResult) {
		await persistXgboostPrediction(beachId, xgboostResult).catch((err) => {
			console.warn("[reassurance] Failed to persist XGBoost prediction:", err);
		});
	}

	const shapRisk = shapResult.riskLevel.toUpperCase();
	const bmkgRisk = determineBmkgRisk(weather, !!warning);

	const { finalLevel, finalLevelNumeric, agreed } = fusionDecision(xgboostResult, shapRisk, bmkgRisk);

	const result: ReassuranceResult = {
		shapRisk,
		bmkgRisk,
		xgboostRisk: xgboostResult?.riskLevel ?? null,
		xgboostLabel: xgboostResult?.riskLabel ?? null,
		agreed,
		finalLevel,
		finalLevelNumeric,
		details: { weather, warning, xgboost: xgboostResult },
	};

	await db.insert(schema.reassuranceResults).values({
		predictionId,
		reportId,
		shapRisk: result.shapRisk,
		bmkgRisk: result.bmkgRisk,
		agreed: result.agreed,
		finalLevel: result.finalLevel,
		details: JSON.stringify(result.details),
	});

	return result;
}
