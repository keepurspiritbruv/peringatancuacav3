import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { DATABASE_URL } from "../config";
import * as schema from "./schema";

let _db: ReturnType<typeof drizzle<typeof schema>> | null = null;
let _sql: ReturnType<typeof postgres> | null = null;

export async function initDb() {
  if (_db) return _db;

  _sql = postgres(DATABASE_URL, { max: 5 });
  _db = drizzle(_sql, { schema });
  console.log("[db] PostgreSQL connected");

  return _db;
}

export function getDb() {
  if (!_db) throw new Error("Database not initialized. Call initDb() first.");
  return _db;
}

export function getSql() {
  if (!_sql) throw new Error("Database not initialized. Call initDb() first.");
  return _sql;
}

export { schema };
