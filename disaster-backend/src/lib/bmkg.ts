import { getDb, schema } from "../db";
import { getBmkgData } from "./bmkg-fetch";
import { eq, desc } from "drizzle-orm";

export type BmkgWeatherData = {
	weather: string;
	windSpeed: number | null;
	windDirection: string | null;
	temperature: number | null;
	humidity: number | null;
	weatherCode: number | null;
	weatherIcon: string | null;
	description: string | null;
	isSafe: boolean | null;
	warningText: string | null;
	fetchedAt: number;
};

export async function fetchBmkgWeather(beachSlug: string): Promise<BmkgWeatherData> {
	const data = await getBmkgData(beachSlug);
	if (!data) {
		return {
			weather: "Tidak tersedia",
			windSpeed: null,
			windDirection: null,
			temperature: null,
			humidity: null,
			weatherCode: null,
			weatherIcon: null,
			description: null,
			isSafe: null,
			warningText: null,
			fetchedAt: Date.now(),
		};
	}

	return {
		weather: data.weather,
		windSpeed: data.windSpeed,
		windDirection: data.windDirection,
		temperature: data.temperature,
		humidity: data.humidity,
		weatherCode: data.weatherCode,
		weatherIcon: data.weatherIcon,
		description: data.description,
		isSafe: data.isSafe,
		warningText: data.isSafe ? null : `${data.weather} - Angin ${data.windSpeed} km/jam`,
		fetchedAt: data.fetchedAt,
	};
}

export async function fetchBmkgWarning(beachSlug: string): Promise<string | null> {
	const data = await getBmkgData(beachSlug);
	if (!data || data.isSafe) return null;
	return `${data.weather} - Angin ${data.windSpeed} km/jam`;
}

export async function fetchAllForBeach(beachSlug: string) {
	const [weather, warning] = await Promise.all([
		fetchBmkgWeather(beachSlug),
		fetchBmkgWarning(beachSlug),
	]);

	return {
		weather,
		warning,
	};
}

export async function saveSnapshot(beachId: number, data: {
	weather: BmkgWeatherData;
	warning: string | null;
}) {
	const db = getDb();
	await db.insert(schema.bmkgSnapshots).values({
		beachId,
		weather: JSON.stringify(data.weather),
		waveForecast: JSON.stringify({ warning: data.warning }),
		warning: data.warning ? JSON.stringify({ text: data.warning }) : null,
	});
}

export async function getLatestSnapshot(beachId: number) {
	const db = getDb();
	const results = await db
		.select()
		.from(schema.bmkgSnapshots)
		.where(eq(schema.bmkgSnapshots.beachId, beachId))
		.limit(1)
		.orderBy(desc(schema.bmkgSnapshots.fetchedAt));

	return results[0] ?? null;
}

export async function getBeachBySlug(slug: string) {
	const db = getDb();
	const results = await db
		.select()
		.from(schema.beaches)
		.where(eq(schema.beaches.slug, slug))
		.limit(1);
	return results[0] ?? null;
}

export async function persistReport(data: {
	beachLocation: string;
	reporterId: string | null;
	source: string;
	naturalSigns: string[];
	rawBody: Record<string, unknown>;
}) {
	const db = getDb();
	let beach = await getBeachBySlug(data.beachLocation);
	if (!beach) {
		const inserted = await db.insert(schema.beaches).values({
			name: data.beachLocation.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()),
			slug: data.beachLocation,
		}).returning();
		beach = inserted[0];
	}

	const inserted = await db.insert(schema.reports).values({
		beachId: beach.id,
		reporterId: data.reporterId,
		source: data.source,
		naturalSigns: JSON.stringify(data.naturalSigns),
		rawBody: JSON.stringify(data.rawBody),
	}).returning();
	return inserted[0];
}

export type XGBoostResult = {
	riskLevel: number;
	riskLabel: string;
	confidence: number;
	source: string;
	thresholdLabel: number;
	modelAgrees: boolean;
	featureImportance: Record<string, number> | null;
};

export async function fetchXgboostPrediction(beachSlug: string, weatherData: BmkgWeatherData): Promise<XGBoostResult | null> {
	const { XGBOOST_BASE_URL } = await import("../config");
	try {
		const res = await fetch(`${XGBOOST_BASE_URL}/xgboost/predict`, {
			method: "POST",
			headers: { "content-type": "application/json" },
			body: JSON.stringify({
				beach_location: beachSlug,
				curah_hujan: 0,
				kelembapan: weatherData.humidity ?? 0,
				suhu: weatherData.temperature ?? 0,
				kecepatan_angin_kmh: weatherData.windSpeed ?? 0,
				arah_angin: weatherData.windDirection ?? "N",
				tutupan_awan: 0,
			}),
			signal: AbortSignal.timeout(10000),
		});
		if (!res.ok) return null;
		const raw = await res.json() as Record<string, unknown>;
		return {
			riskLevel: (raw.risk_level as number) ?? 0,
			riskLabel: (raw.risk_label as string) ?? "Unknown",
			confidence: (raw.confidence as number) ?? 0,
			source: (raw.source as string) ?? "xgboost",
			thresholdLabel: (raw.threshold_label as number) ?? 0,
			modelAgrees: (raw.model_agrees as boolean) ?? false,
			featureImportance: (raw.feature_importance as Record<string, number>) ?? null,
		};
	} catch {
		return null;
	}
}

export async function persistXgboostPrediction(beachId: number, result: XGBoostResult) {
	const db = getDb();
	await db.insert(schema.xgboostPredictions).values({
		beachId,
		riskLevel: result.riskLevel,
		riskLabel: result.riskLabel,
		confidence: result.confidence,
		source: result.source,
		thresholdLabel: result.thresholdLabel,
		modelAgrees: result.modelAgrees,
		featureImportance: result.featureImportance ? JSON.stringify(result.featureImportance) : null,
		rawFeatures: JSON.stringify(result),
	});
}

export async function persistShapPrediction(data: {
	reportId: string;
	riskLevel: string;
	communityCharacteristics?: string;
	validatedSigns?: string[];
	actions?: string[];
	rawResponse?: Record<string, unknown>;
}) {
	const db = getDb();
	const inserted = await db.insert(schema.shapPredictions).values({
		reportId: data.reportId,
		riskLevel: data.riskLevel,
		communityCharacteristics: data.communityCharacteristics ?? null,
		validatedSigns: data.validatedSigns ? JSON.stringify(data.validatedSigns) : null,
		actions: data.actions ? JSON.stringify(data.actions) : null,
		rawResponse: data.rawResponse ? JSON.stringify(data.rawResponse) : null,
	}).returning();
	return inserted[0];
}
