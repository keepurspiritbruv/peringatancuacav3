import { getDb } from "../db";
import { schema } from "../db";
import { eq, desc } from "drizzle-orm";
import { fetchBmkgWeather, fetchBmkgWarning, saveSnapshot } from "./bmkg";

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
	agreed: boolean;
	finalLevel: "LOW" | "MEDIUM" | "HIGH";
	details: Record<string, unknown>;
};

function determineBmkgRisk(weather: { waveHeight: number | null; windSpeed: number | null } | null, hasWarning: boolean): string {
	if (!weather) return "UNKNOWN";

	const waveHeight = weather.waveHeight ?? 0;
	const windSpeed = weather.windSpeed ?? 0;

	if (waveHeight >= 2.5 || windSpeed >= 46 || hasWarning) return "HIGH";
	if (waveHeight >= 1.5 || windSpeed >= 30) return "MEDIUM";
	return "LOW";
}

async function getBeachId(beachSlug: string): Promise<number | null> {
	const db = getDb();
	const results = await db
		.select()
		.from(schema.beaches)
		.where(eq(schema.beaches.slug, beachSlug))
		.limit(1);
	return results[0]?.id ?? null;
}

export async function reassure(
	predictionId: number,
	shapResult: ShapResult,
	beachSlug: string,
): Promise<ReassuranceResult> {
	const db = getDb();

	const beachId = await getBeachId(beachSlug);
	if (!beachId) {
		console.warn("[reassurance] Beach not found:", beachSlug);
	}

	const weather = await fetchBmkgWeather(beachSlug).catch(() => null);
	const warning = await fetchBmkgWarning(beachSlug).catch(() => null);

	if (beachId && weather) {
		await saveSnapshot(beachId, { weather, warning }).catch(() => {});
	}

	const shapRisk = shapResult.riskLevel.toUpperCase();
	const bmkgRisk = determineBmkgRisk(weather, !!warning);

	let agreed: boolean;
	let finalLevel: "LOW" | "MEDIUM" | "HIGH";

	if (shapRisk === "HIGH" || shapRisk === "UNSAFE") {
		if (bmkgRisk === "HIGH" || bmkgRisk === "MEDIUM") {
			agreed = true;
			finalLevel = "HIGH";
		} else {
			agreed = false;
			finalLevel = "MEDIUM";
		}
	} else if (shapRisk === "MEDIUM") {
		if (bmkgRisk === "HIGH") {
			agreed = false;
			finalLevel = "HIGH";
		} else if (bmkgRisk === "MEDIUM") {
			agreed = true;
			finalLevel = "MEDIUM";
		} else {
			agreed = false;
			finalLevel = "MEDIUM";
		}
	} else {
		if (bmkgRisk === "HIGH" || bmkgRisk === "MEDIUM") {
			agreed = false;
			finalLevel = "MEDIUM";
		} else {
			agreed = true;
			finalLevel = "LOW";
		}
	}

	const result: ReassuranceResult = {
		shapRisk,
		bmkgRisk,
		agreed,
		finalLevel,
		details: { weather, warning },
	};

	await db.insert(schema.reassuranceResults).values({
		predictionId,
		shapRisk: result.shapRisk,
		bmkgRisk: result.bmkgRisk,
		agreed: result.agreed,
		finalLevel: result.finalLevel,
		details: result.details,
	});

	return result;
}
