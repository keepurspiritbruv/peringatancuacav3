import { describe, test, expect, afterAll } from "bun:test";
import { Database } from "bun:sqlite";
import { drizzle } from "drizzle-orm/bun-sqlite";
import { migrate } from "drizzle-orm/bun-sqlite/migrator";
import * as schema from "./schema";
import { eq, sql } from "drizzle-orm";
import path from "path";
import fs from "fs";

const TEST_DB_PATH = path.join(process.cwd(), "data", "test-db.test.sqlite");

let sqlite: Database;
let db: ReturnType<typeof drizzle<typeof schema>>;

function setupTestDb() {
	const dir = path.dirname(TEST_DB_PATH);
	if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

	if (fs.existsSync(TEST_DB_PATH)) {
		try { fs.unlinkSync(TEST_DB_PATH); } catch {}
		try { fs.unlinkSync(TEST_DB_PATH + "-wal"); } catch {}
		try { fs.unlinkSync(TEST_DB_PATH + "-shm"); } catch {}
	}

	sqlite = new Database(TEST_DB_PATH);
	sqlite.run("PRAGMA journal_mode = DELETE");
	sqlite.run("PRAGMA foreign_keys = ON");

	db = drizzle(sqlite, { schema });
	migrate(db, { migrationsFolder: path.join(__dirname, "migrations") });
}

describe("Database Schema & Connection", () => {
	setupTestDb();

	test("beaches table exists and can insert/select", () => {
		db.insert(schema.beaches).values({
			name: "Test Beach",
			slug: "test_beach",
			latitude: 5.5,
			longitude: 95.2,
		}).run();

		const rows = db.select().from(schema.beaches).where(eq(schema.beaches.slug, "test_beach")).all();
		expect(rows.length).toBe(1);
		expect(rows[0].name).toBe("Test Beach");
		expect(rows[0].slug).toBe("test_beach");
		expect(rows[0].id).toBe(1);
	});

	test("reports table insert with beach foreign key", () => {
		db.insert(schema.beaches).values({
			name: "Report Beach",
			slug: "report_beach",
		}).run();
		const beach = db.select().from(schema.beaches).where(eq(schema.beaches.slug, "report_beach")).get();

		sqlite.run(
			"INSERT INTO reports (id, beach_id, source, natural_signs, created_at) VALUES (?, ?, ?, ?, datetime('now'))",
			["rpt-001", beach!.id, "PWA", '["Wn-1","Wn-2"]'],
		);

		const rows = db.select().from(schema.reports).where(eq(schema.reports.id, "rpt-001")).all();
		expect(rows.length).toBe(1);
		expect(rows[0].beachId).toBe(beach!.id);
		expect(rows[0].source).toBe("PWA");
	});

	test("shapPredictions table can store ML results", () => {
		db.insert(schema.beaches).values({ name: "Shp Beach", slug: "shp_beach" }).run();
		const beach = db.select().from(schema.beaches).where(eq(schema.beaches.slug, "shp_beach")).get();

		sqlite.run(
			"INSERT INTO reports (id, beach_id, source, natural_signs, created_at) VALUES (?, ?, ?, ?, datetime('now'))",
			["rpt-shp", beach!.id, "PWA", '["Wn-1"]'],
		);

		sqlite.run(
			"INSERT INTO shap_predictions (report_id, risk_level, community_characteristics, validated_signs, actions, created_at) VALUES (?, ?, ?, ?, ?, datetime('now'))",
			["rpt-shp", "HIGH", "Actionable", '["Wn-1"]', '["Evacuate"]'],
		);

		const preds = db.select().from(schema.shapPredictions).all();
		expect(preds.length).toBe(1);
		expect(preds[0].riskLevel).toBe("HIGH");
		expect(preds[0].communityCharacteristics).toBe("Actionable");
	});

	test("bmkgSnapshots table can store weather data", () => {
		db.insert(schema.beaches).values({ name: "Bmkg Beach", slug: "bmkg_beach" }).run();
		const beach = db.select().from(schema.beaches).where(eq(schema.beaches.slug, "bmkg_beach")).get();

		sqlite.run(
			"INSERT INTO bmkg_snapshots (beach_id, weather, fetched_at) VALUES (?, ?, datetime('now'))",
			[beach!.id, '{"weather":"Cerah"}'],
		);

		const snaps = db.select().from(schema.bmkgSnapshots).all();
		expect(snaps.length).toBe(1);
		expect(snaps[0].beachId).toBe(beach!.id);
	});

	test("reassuranceResults table stores agreement data", () => {
		db.insert(schema.beaches).values({ name: "Re Beach", slug: "re_beach" }).run();
		const beach = db.select().from(schema.beaches).where(eq(schema.beaches.slug, "re_beach")).get();

		sqlite.run(
			"INSERT INTO reports (id, beach_id, source, natural_signs, created_at) VALUES (?, ?, ?, ?, datetime('now'))",
			["rpt-re", beach!.id, "PWA", '["Wn-1"]'],
		);

		sqlite.run(
			"INSERT INTO shap_predictions (report_id, risk_level, created_at) VALUES (?, ?, datetime('now'))",
			["rpt-re", "HIGH"],
		);

		sqlite.run(
			"INSERT INTO reassurance_results (prediction_id, report_id, shap_risk, bmkg_risk, agreed, final_level, created_at) VALUES (?, ?, ?, ?, ?, ?, datetime('now'))",
			[1, "rpt-re", "HIGH", "MEDIUM", 0, "HIGH"],
		);

		const results = db.select().from(schema.reassuranceResults).all();
		expect(results.length).toBe(1);
		expect(results[0].shapRisk).toBe("HIGH");
		expect(results[0].agreed).toBe(false);
		expect(results[0].finalLevel).toBe("HIGH");
	});

	test("beach slug unique constraint works", () => {
		db.insert(schema.beaches).values({ name: "Dup Beach", slug: "dup_beach" }).run();
		expect(() => {
			db.insert(schema.beaches).values({ name: "Dup Beach 2", slug: "dup_beach" }).run();
		}).toThrow();
	});

	test("foreign key enforcement on reports", () => {
		expect(() => {
			sqlite.run(
				"INSERT INTO reports (id, beach_id, source, natural_signs, created_at) VALUES (?, ?, ?, ?, datetime('now'))",
				["rpt-fk", 9999, "PWA", '["Wn-1"]'],
			);
		}).toThrow();
	});

	afterAll(() => {
		try { sqlite.close(true); } catch {}
		try { fs.unlinkSync(TEST_DB_PATH); } catch {}
		try { fs.unlinkSync(TEST_DB_PATH + "-wal"); } catch {}
		try { fs.unlinkSync(TEST_DB_PATH + "-shm"); } catch {}
	});
});
