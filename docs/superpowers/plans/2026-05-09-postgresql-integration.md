# Plan: PostgreSQL Integration (Minimal Persistence)

**Date:** 2026-05-09
**Status:** Approved — Approach A
**Stack:** Drizzle ORM + PostgreSQL + Bun + Hono

---

## Overview

Add PostgreSQL alongside Redis for persistent data storage. Redis keeps handling real-time pub/sub, dedup, caching. PostgreSQL stores reports, SHAP predictions, BMKG snapshots, reassurance results, and beach registry.

---

## File Map

### New Files

| File | Purpose |
|---|---|
| `disaster-backend/drizzle.config.ts` | Drizzle Kit config (DB URL, output folder) |
| `disaster-backend/src/db/index.ts` | Drizzle client init (singleton, follows `redis.ts` pattern) |
| `disaster-backend/src/db/schema.ts` | All Drizzle table definitions |
| `disaster-backend/src/db/migrations/` | Auto-generated SQL migrations via `drizzle-kit generate` |
| `disaster-backend/src/lib/bmkg.ts` | BMKG data fetcher (pre-fetch scheduled + on-demand) |
| `disaster-backend/src/lib/reassurance.ts` | Reassurance logic (compare SHAP vs BMKG, store result) |

### Modified Files

| File | Change |
|---|---|
| `disaster-backend/package.json` | Add `drizzle-orm`, `drizzle-kit`, `postgres` dependencies + scripts |
| `disaster-backend/src/config.ts` | Add `DATABASE_URL` env var |
| `disaster-backend/src/index.ts` | Call `initDb()` at startup alongside `initRedis()` |
| `disaster-backend/src/routes/report.ts` | After SHAP predict: fetch BMKG → compare → store all to Postgres |
| `disaster-backend/docker-compose.yml` | Add `disaster-postgres` service + `postgres_data` volume |

---

## Task 1: Install Dependencies & Configure Drizzle

**Files:** `package.json`, `drizzle.config.ts`, `src/config.ts`

### 1.1 Install packages

```bash
cd disaster-backend
bun add drizzle-orm postgres
bun add -d drizzle-kit
```

### 1.2 Add env var to `src/config.ts`

Add after the existing `REDIS_URL` line:

```ts
export const DATABASE_URL = process.env.DATABASE_URL ?? "postgres://postgres:postgres@localhost:5432/disaster_db";
```

### 1.3 Create `drizzle.config.ts`

```ts
import { defineConfig } from "drizzle-kit";

export default defineConfig({
  schema: "./src/db/schema.ts",
  out: "./src/db/migrations",
  dialect: "postgresql",
  dbCredentials: {
    url: process.env.DATABASE_URL ?? "postgres://postgres:postgres@localhost:5432/disaster_db",
  },
});
```

### 1.4 Add npm scripts to `package.json`

```json
"db:generate": "drizzle-kit generate",
"db:migrate": "drizzle-kit migrate",
"db:studio": "drizzle-kit studio"
```

---

## Task 2: Create Database Schema

**File:** `src/db/schema.ts`

### Tables:

```ts
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
```

---

## Task 3: Create Drizzle Client

**File:** `src/db/index.ts`

Follow the same pattern as `src/lib/redis.ts` — singleton with idempotent `initDb()`.

```ts
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { DATABASE_URL } from "../config";
import * as schema from "./schema";

let _db: ReturnType<typeof drizzle> | null = null;

export async function initDb() {
  if (_db) return _db;

  const client = postgres(DATABASE_URL, { max: 5 });
  _db = drizzle(client, { schema });
  console.log("[db] PostgreSQL connected");

  return _db;
}

export function getDb() {
  if (!_db) throw new Error("Database not initialized. Call initDb() first.");
  return _db;
}
```

---

## Task 4: Wire DB Init into App Startup

**File:** `src/index.ts`

Add `initDb()` call alongside `initRedis()` at line 47:

```ts
await initRedis();
await initDb();  // <-- add this
initWebPush();
```

Import: `import { initDb } from "./db";`

---

## Task 5: Add PostgreSQL Service to Docker Compose

**File:** `docker-compose.yml`

Add `disaster-postgres` service and `postgres_data` volume. Add `DATABASE_URL` env var to `app` service. Add `depends_on` with healthcheck.

```yaml
  disaster-postgres:
    image: postgres:16-alpine
    container_name: thesis-postgres
    restart: unless-stopped
    environment:
      POSTGRES_USER: postgres
      POSTGRES_PASSWORD: postgres
      POSTGRES_DB: disaster_db
    volumes:
      - postgres_data:/var/lib/postgresql/data
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U postgres"]
      interval: 5s
      timeout: 3s
      retries: 10
    ports:
      - "127.0.0.1:5432:5432"
```

Add to `app.environment`:
```
DATABASE_URL: postgres://postgres:postgres@disaster-postgres:5432/disaster_db
```

Add to `app.depends_on`:
```
disaster-postgres:
  condition: service_healthy
```

Add to `volumes`:
```
postgres_data:
```

---

## Task 6: Create BMKG Fetcher Module

**File:** `src/lib/bmkg.ts`

Responsibilities:
- `fetchBmkgWeather(beachSlug)` — fetch from data-cap.git (or local clone)
- `fetchBmkgWarning(beachSlug)` — fetch from data-cuaca.git (or local clone)
- `fetchBmkgWave(beachSlug)` — webfetch from BMKG gelombang page
- `fetchAllForBeach(beachSlug)` — calls all three, returns combined object
- `saveSnapshot(beachId, data)` — writes to `bmkg_snapshots` table
- `getLatestSnapshot(beachId)` — gets most recent snapshot for a beach

Note: The BMKG data sources are Git repos and a web page. For pre-fetch, we'll start with on-demand fetching when a report triggers reassurance. Scheduled pre-fetch can be added later with a cron-like interval.

---

## Task 7: Create Reassurance Module

**File:** `src/lib/reassurance.ts`

Responsibilities:
- `reassure(reportId, shapResult, beachId)` — main function:
  1. Fetch latest BMKG snapshot for the beach (or fetch fresh)
  2. Compare SHAP risk level with BMKG data
  3. Determine if they agree
  4. Calculate final alert level
  5. Store result in `reassurance_results` table
  6. Return the result

Reassurance logic (simplified):
- SHAP says "Unsafe" + BMKG has bad weather/wave warning → **agreed, final = HIGH**
- SHAP says "Unsafe" + BMKG is clear → **disagreed, final = MEDIUM** (trust local knowledge)
- SHAP says "Safe" + BMKG has bad weather → **disagreed, final = MEDIUM** (trust BMKG)
- SHAP says "Safe" + BMKG is clear → **agreed, final = LOW**

---

## Task 8: Integrate into Report Route

**File:** `src/routes/report.ts`

After SHAP predict succeeds (after line 196 `const result = ...`), add:

1. Save report to `reports` table
2. Save SHAP prediction to `shap_predictions` table
3. Call BMKG fetcher for the beach
4. Call reassurance module
5. Attach reassurance result to `alertEvent`

The Redis flow stays unchanged — this is additive. All data still flows through Redis for real-time delivery, but now also persists to PostgreSQL.

---

## Task 9: Generate & Run Migration

```bash
cd disaster-backend
bun run db:generate
bun run db:migrate
```

This creates the SQL migration files in `src/db/migrations/` and applies them to the database.

---

## Task 10: Seed Beaches Table

Create a seed script or inline the 5 beaches from `ALLOWED_BEACH_LOCATIONS` on first DB init:

| slug | name |
|---|---|
| `pantai_lampuuk` | Pantai Lampuuk |
| `pantai_lhoknga` | Pantai Lhoknga |
| `pantai_ulee_lheue` | Pantai Ulee Lheue |
| `pantai_depok` | Pantai Depok |
| `pantai_samas` | Pantai Samas |

This can be a simple `drizzle-kit seed` script or a function called during `initDb()`.

---

## Execution Order

1. Task 1 (deps + config)
2. Task 2 (schema)
3. Task 3 (client)
4. Task 4 (wire into app)
5. Task 5 (docker-compose)
6. Task 9 (generate migration)
7. Task 10 (seed beaches)
8. Task 6 (BMKG fetcher)
9. Task 7 (reassurance)
10. Task 8 (integrate into report route)

Tasks 6-7-8 can be built incrementally. The DB layer (1-5, 9-10) should work standalone first.

---

## What Does NOT Change

- Redis pub/sub for real-time alert delivery
- Redis streams for report sync, alert history, experiment triggers
- Redis dedup logic
- Redis cooldown/warning active state
- Push notifications
- SSE/WS delivery
- OpenClaw WhatsApp integration
- JWT auth

These all stay in Redis. PostgreSQL is purely additive for persistence.
