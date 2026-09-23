import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import * as schema from "./schema.ts";

const dir = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "data");
fs.mkdirSync(dir, { recursive: true });
const sqlite = new Database(path.join(dir, "plotgo.db"));
sqlite.pragma("journal_mode = WAL");
sqlite.exec(`
CREATE TABLE IF NOT EXISTS players (
  id TEXT PRIMARY KEY,
  created_at INTEGER NOT NULL,
  founder INTEGER NOT NULL DEFAULT 1,
  cash_minor INTEGER NOT NULL,
  earned_minor INTEGER NOT NULL DEFAULT 0,
  last_settle_at INTEGER NOT NULL,
  exchange_actions_today INTEGER NOT NULL DEFAULT 0,
  hunt_day TEXT NOT NULL,
  hunt_id TEXT NOT NULL,
  hunt_claimed INTEGER NOT NULL DEFAULT 0,
  weekly_score INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS cards (
  id TEXT PRIMARY KEY,
  player_id TEXT NOT NULL,
  type TEXT NOT NULL,
  x INTEGER NOT NULL,
  y INTEGER NOT NULL,
  stage INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS fragments (
  player_id TEXT NOT NULL,
  ticker TEXT NOT NULL,
  units_bps INTEGER NOT NULL,
  PRIMARY KEY (player_id, ticker)
);
`);

export const db = drizzle(sqlite, { schema });
export { sqlite };
