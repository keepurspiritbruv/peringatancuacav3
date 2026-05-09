import { pgTable, uuid, varchar, text, jsonb, timestamp, serial, integer, real, boolean } from "drizzle-orm/pg-core";

export const beaches = pgTable("beaches", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  slug: varchar("slug", { length: 100 }).notNull().unique(),
  latitude: real("latitude"),
  longitude: real("longitude"),
  communityRiskLevel: text("community_risk_level"),
});

export const reports = pgTable("reports", {
  id: uuid("id").defaultRandom().primaryKey(),
  beachId: integer("beach_id").references(() => beaches.id),
  reporterId: text("reporter_id"),
  source: varchar("source", { length: 20 }).notNull(),
  naturalSigns: jsonb("natural_signs").notNull().$type<string[]>(),
  rawBody: jsonb("raw_body").$type<Record<string, unknown>>(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export const shapPredictions = pgTable("shap_predictions", {
  id: serial("id").primaryKey(),
  reportId: uuid("report_id").references(() => reports.id),
  riskLevel: text("risk_level").notNull(),
  communityCharacteristics: text("community_characteristics"),
  validatedSigns: jsonb("validated_signs").$type<string[]>(),
  actions: jsonb("actions").$type<string[]>(),
  rawResponse: jsonb("raw_response").$type<Record<string, unknown>>(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export const bmkgSnapshots = pgTable("bmkg_snapshots", {
  id: serial("id").primaryKey(),
  beachId: integer("beach_id").references(() => beaches.id),
  weather: jsonb("weather").$type<Record<string, unknown>>(),
  waveForecast: jsonb("wave_forecast").$type<Record<string, unknown>>(),
  warning: jsonb("warning").$type<Record<string, unknown>>(),
  fetchedAt: timestamp("fetched_at", { withTimezone: true }).defaultNow().notNull(),
});

export const reassuranceResults = pgTable("reassurance_results", {
  id: serial("id").primaryKey(),
  reportId: uuid("report_id").references(() => reports.id).unique(),
  shapRisk: text("shap_risk"),
  bmkgRisk: text("bmkg_risk"),
  agreed: boolean("agreed"),
  finalLevel: text("final_level").notNull(),
  details: jsonb("details").$type<Record<string, unknown>>(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});
