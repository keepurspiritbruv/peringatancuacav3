import { getDb, schema } from "../db";
import { getBmkgData } from "./bmkg-fetch";

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
		weather: data.weather as unknown as Record<string, unknown>,
		waveForecast: { warning: data.warning },
		warning: data.warning ? { text: data.warning } : null,
	});
}

export async function getLatestSnapshot(beachId: number) {
	const db = getDb();
	const results = await db
		.select()
		.from(schema.bmkgSnapshots)
		.where(({ beachId: col }) => col.eq(beachId))
		.limit(1)
		.orderBy(({ fetchedAt }) => fetchedAt.desc());

	return results[0] ?? null;
}

export async function getBeachBySlug(slug: string) {
	const db = getDb();
	const results = await db
		.select()
		.from(schema.beaches)
		.where(({ slug: col }) => col.eq(slug))
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
		naturalSigns: data.naturalSigns,
		rawBody: data.rawBody,
	}).returning();
	return inserted[0];
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
		validatedSigns: data.validatedSigns ?? null,
		actions: data.actions ?? null,
		rawResponse: data.rawResponse ?? null,
	}).returning();
	return inserted[0];
}
