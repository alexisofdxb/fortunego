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
  weekly_score INTEGER NOT NULL DEFAULT 0,
  risk_bps INTEGER NOT NULL DEFAULT 700,
  reputation_bps INTEGER NOT NULL DEFAULT 5000,
  condition_bps INTEGER NOT NULL DEFAULT 10000,
  population INTEGER NOT NULL DEFAULT 0,
  capacity INTEGER NOT NULL DEFAULT 0,
  satisfaction_bps INTEGER NOT NULL DEFAULT 5000,
  transactions INTEGER NOT NULL DEFAULT 0,
  volume_minor INTEGER NOT NULL DEFAULT 0,
  active_days TEXT NOT NULL DEFAULT '[]',
  plot_balance INTEGER NOT NULL DEFAULT 0,
  last_meaningful_action_at INTEGER NOT NULL DEFAULT 0,
  offline_started_at INTEGER NOT NULL DEFAULT 0,
  offline_processed_until INTEGER NOT NULL DEFAULT 0,
  presence_state TEXT NOT NULL DEFAULT 'engaged',
  offline_session_id TEXT,
  active_minutes_daily_json TEXT NOT NULL DEFAULT '{}',
  meaningful_actions_daily_json TEXT NOT NULL DEFAULT '{}',
  onboarding_session_id TEXT,
  onboarding_started_at INTEGER,
  onboarding_step TEXT NOT NULL DEFAULT 'welcome',
  onboarding_status TEXT NOT NULL DEFAULT 'active',
  onboarding_xp INTEGER NOT NULL DEFAULT 0,
  onboarding_completed_at INTEGER,
  onboarding_skipped_at INTEGER,
  first_customer_assist_used INTEGER NOT NULL DEFAULT 0,
  free_tutorial_relocation_used INTEGER NOT NULL DEFAULT 0,
  personal_event_protection_until INTEGER NOT NULL DEFAULT 0
  , archetype TEXT
  , archetype_changed_at INTEGER
);
CREATE TABLE IF NOT EXISTS plotgo_onboarding_milestones (
  player_id TEXT NOT NULL,
  milestone_id TEXT NOT NULL,
  xp INTEGER NOT NULL DEFAULT 0,
  source_event TEXT NOT NULL,
  achieved_at INTEGER NOT NULL,
  PRIMARY KEY (player_id, milestone_id)
);
CREATE TABLE IF NOT EXISTS cards (
  id TEXT PRIMARY KEY,
  player_id TEXT NOT NULL,
  type TEXT NOT NULL,
  x INTEGER NOT NULL,
  y INTEGER NOT NULL,
  stage INTEGER NOT NULL,
  orientation INTEGER NOT NULL DEFAULT 0,
  placed_at INTEGER NOT NULL DEFAULT 0,
  operational_until INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS fragments (
  player_id TEXT NOT NULL,
  ticker TEXT NOT NULL,
  units_bps INTEGER NOT NULL,
  units_micros INTEGER,
  PRIMARY KEY (player_id, ticker)
);
CREATE TABLE IF NOT EXISTS plotgo_position (
  player_id TEXT NOT NULL,
  ticker TEXT NOT NULL,
  weight_bps INTEGER NOT NULL DEFAULT 0,
  allocated_minor INTEGER NOT NULL DEFAULT 0,
  mark_bps INTEGER NOT NULL DEFAULT 0,
  last_mark_day TEXT NOT NULL DEFAULT '',
  effective_day TEXT NOT NULL DEFAULT '',
  updated_at INTEGER NOT NULL,
  PRIMARY KEY (player_id, ticker)
);
CREATE TABLE IF NOT EXISTS market_reward_pool (
  week TEXT NOT NULL,
  ticker TEXT NOT NULL,
  allocated_minor INTEGER NOT NULL,
  reserved_minor INTEGER NOT NULL DEFAULT 0,
  claimed_minor INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (week, ticker)
);
CREATE TABLE IF NOT EXISTS market_hunt_slots (
  id TEXT PRIMARY KEY,
  player_id TEXT NOT NULL,
  issued_day TEXT NOT NULL,
  week TEXT NOT NULL,
  template_id TEXT NOT NULL,
  difficulty TEXT NOT NULL,
  reward_rarity TEXT NOT NULL,
  stock_ticker TEXT,
  reward_value_minor INTEGER NOT NULL DEFAULT 0,
  module_reward_kind TEXT,
  module_reward_rarity TEXT,
  module_reward_quantity INTEGER NOT NULL DEFAULT 0,
  module_reward_parts INTEGER NOT NULL DEFAULT 0,
  points INTEGER NOT NULL,
  target REAL NOT NULL DEFAULT 0,
  issued_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'active',
  claimed_at INTEGER,
  reserved_minor INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS market_oracle_prices (
  ticker TEXT PRIMARY KEY,
  price_minor INTEGER NOT NULL,
  refreshed_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS weekly_performance (
  player_id TEXT NOT NULL,
  week TEXT NOT NULL,
  stage TEXT NOT NULL,
  active_days INTEGER NOT NULL DEFAULT 0,
  activity_minor INTEGER NOT NULL DEFAULT 0,
  revenue_minor INTEGER NOT NULL DEFAULT 0,
  active_customers_total REAL NOT NULL DEFAULT 0,
  customer_samples INTEGER NOT NULL DEFAULT 0,
  new_retained_customers REAL NOT NULL DEFAULT 0,
  utilization_bps_total REAL NOT NULL DEFAULT 0,
  reputation_bps_total REAL NOT NULL DEFAULT 0,
  risk_bps_total REAL NOT NULL DEFAULT 0,
  event_points REAL NOT NULL DEFAULT 0,
  sessions INTEGER NOT NULL DEFAULT 0,
  hunts_completed INTEGER NOT NULL DEFAULT 0,
  finalized INTEGER NOT NULL DEFAULT 0,
  score REAL NOT NULL DEFAULT 0,
  eligible INTEGER NOT NULL DEFAULT 0,
  payout_plot INTEGER NOT NULL DEFAULT 0,
  claimed_at INTEGER,
  finalized_at INTEGER,
  PRIMARY KEY (player_id, week)
);
CREATE TABLE IF NOT EXISTS plotgo_ledger (
  id TEXT PRIMARY KEY,
  player_id TEXT NOT NULL,
  day TEXT NOT NULL,
  reason TEXT NOT NULL,
  amount_minor INTEGER NOT NULL,
  balance_minor INTEGER NOT NULL,
  metadata_json TEXT NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS plotgo_district_day (
  player_id TEXT NOT NULL,
  day TEXT NOT NULL,
  seed INTEGER NOT NULL,
  event_id TEXT NOT NULL,
  marks_json TEXT NOT NULL DEFAULT '{}',
  PRIMARY KEY (player_id, day)
);
CREATE TABLE IF NOT EXISTS plotgo_session (
  player_id TEXT NOT NULL,
  day TEXT NOT NULL,
  verb TEXT NOT NULL,
  receipt_json TEXT NOT NULL,
  settled_at INTEGER NOT NULL,
  PRIMARY KEY (player_id, day)
);
CREATE TABLE IF NOT EXISTS plotgo_placement_audit (
  player_id TEXT PRIMARY KEY,
  layout_version INTEGER NOT NULL DEFAULT 0,
  geometry_hash TEXT NOT NULL,
  synergy_version INTEGER NOT NULL DEFAULT 1,
  support_version INTEGER NOT NULL DEFAULT 1,
  stack_version INTEGER NOT NULL DEFAULT 1,
  congestion_version INTEGER NOT NULL DEFAULT 1,
  district_version INTEGER NOT NULL DEFAULT 1,
  tilemap_version INTEGER NOT NULL DEFAULT 1,
  diagnostic_version INTEGER NOT NULL DEFAULT 1,
  move_tx_id TEXT,
  updated_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS plotgo_market_cycle (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  state TEXT NOT NULL,
  started_at INTEGER NOT NULL,
  ends_at INTEGER NOT NULL,
  seed INTEGER NOT NULL,
  cycle_version INTEGER NOT NULL DEFAULT 1,
  updated_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS plotgo_player_events (
  id TEXT PRIMARY KEY,
  player_id TEXT NOT NULL,
  catalog_id TEXT NOT NULL,
  scope TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active',
  issued_at INTEGER NOT NULL,
  starts_at INTEGER NOT NULL,
  ends_at INTEGER NOT NULL,
  choice_id TEXT,
  resolution_json TEXT,
  resolved_at INTEGER,
  reward_claimed INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS plotgo_event_missions (
  id TEXT PRIMARY KEY,
  player_id TEXT NOT NULL,
  event_id TEXT NOT NULL,
  template_id TEXT NOT NULL,
  target REAL NOT NULL,
  issued_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'active',
  claimed_at INTEGER,
  reward_claimed INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS plotgo_event_audit (
  id TEXT PRIMARY KEY,
  player_id TEXT,
  event_id TEXT,
  audit_type TEXT NOT NULL,
  resolution_hash TEXT NOT NULL,
  payload_json TEXT NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS plotgo_module_reward_events (
  reward_id TEXT PRIMARY KEY,
  player_id TEXT NOT NULL,
  source TEXT NOT NULL,
  source_event_id TEXT NOT NULL,
  reward_kind TEXT NOT NULL,
  rarity TEXT NOT NULL,
  module_id TEXT,
  quantity INTEGER NOT NULL DEFAULT 1,
  parts_amount INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'pending',
  metadata_json TEXT NOT NULL DEFAULT '{}',
  created_at INTEGER NOT NULL,
  claimed_at INTEGER
);
CREATE TABLE IF NOT EXISTS module_config (
  module_id TEXT NOT NULL,
  config_version TEXT NOT NULL,
  rarity TEXT NOT NULL,
  category TEXT NOT NULL,
  compatible_families TEXT NOT NULL,
  config_json TEXT NOT NULL,
  is_active INTEGER NOT NULL DEFAULT 1,
  effective_from INTEGER NOT NULL,
  effective_until INTEGER,
  PRIMARY KEY (module_id, config_version)
);
CREATE TABLE IF NOT EXISTS player_module_inventory (
  player_id TEXT NOT NULL,
  module_id TEXT NOT NULL,
  quantity_owned INTEGER NOT NULL DEFAULT 0,
  quantity_equipped INTEGER NOT NULL DEFAULT 0,
  first_acquired_at INTEGER NOT NULL,
  last_acquired_at INTEGER NOT NULL,
  row_version INTEGER NOT NULL DEFAULT 1,
  PRIMARY KEY (player_id, module_id)
);
CREATE TABLE IF NOT EXISTS building_module_loadout (
  player_id TEXT NOT NULL,
  building_id TEXT NOT NULL,
  slot_index INTEGER NOT NULL,
  module_id TEXT NOT NULL,
  effective_at INTEGER NOT NULL,
  loadout_version INTEGER NOT NULL DEFAULT 1,
  PRIMARY KEY (player_id, building_id, slot_index)
);
CREATE TABLE IF NOT EXISTS module_loadout_audit (
  event_id TEXT PRIMARY KEY,
  player_id TEXT NOT NULL,
  building_id TEXT NOT NULL,
  slot_index INTEGER NOT NULL,
  module_id TEXT,
  action TEXT NOT NULL,
  effective_at INTEGER NOT NULL,
  loadout_version INTEGER NOT NULL,
  idempotency_key TEXT NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS building_mastery_progress (
  player_id TEXT NOT NULL,
  building_type TEXT NOT NULL,
  tier INTEGER NOT NULL,
  progress_json TEXT NOT NULL DEFAULT '{}',
  status TEXT NOT NULL DEFAULT 'active',
  completed_at INTEGER,
  claimed_at INTEGER,
  row_version INTEGER NOT NULL DEFAULT 1,
  PRIMARY KEY (player_id, building_type, tier)
);
CREATE TABLE IF NOT EXISTS module_parts_balance (
  player_id TEXT NOT NULL,
  rarity TEXT NOT NULL,
  balance INTEGER NOT NULL DEFAULT 0,
  row_version INTEGER NOT NULL DEFAULT 1,
  PRIMARY KEY (player_id, rarity)
);
CREATE TABLE IF NOT EXISTS module_parts_ledger (
  entry_id TEXT PRIMARY KEY,
  player_id TEXT NOT NULL,
  rarity TEXT NOT NULL,
  delta INTEGER NOT NULL,
  source TEXT NOT NULL,
  source_event_id TEXT NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS module_craft_jobs (
  craft_id TEXT PRIMARY KEY,
  player_id TEXT NOT NULL,
  module_id TEXT NOT NULL,
  rarity TEXT NOT NULL,
  parts_cost INTEGER NOT NULL,
  started_at INTEGER NOT NULL,
  completes_at INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  idempotency_key TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  completed_at INTEGER
);
CREATE TABLE IF NOT EXISTS plotgo_offline_sessions (
  offline_session_id TEXT PRIMARY KEY,
  player_id TEXT NOT NULL,
  started_at INTEGER NOT NULL,
  processed_from INTEGER NOT NULL,
  processed_until INTEGER NOT NULL,
  cap_until INTEGER NOT NULL,
  presence_state TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'processed',
  config_version TEXT NOT NULL,
  summary_json TEXT NOT NULL DEFAULT '{}',
  created_at INTEGER NOT NULL,
  completed_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS plotgo_offline_buckets (
  bucket_id TEXT PRIMARY KEY,
  offline_session_id TEXT NOT NULL,
  player_id TEXT NOT NULL,
  start_at INTEGER NOT NULL,
  end_at INTEGER NOT NULL,
  band TEXT NOT NULL,
  presence_state TEXT NOT NULL,
  cash_efficiency REAL NOT NULL,
  customer_intensity REAL NOT NULL,
  cash_delta_minor INTEGER NOT NULL DEFAULT 0,
  customer_delta REAL NOT NULL DEFAULT 0,
  performance_revenue_credit_minor INTEGER NOT NULL DEFAULT 0,
  performance_growth_credit REAL NOT NULL DEFAULT 0,
  risk_before_bps INTEGER NOT NULL DEFAULT 0,
  risk_after_bps INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL,
  UNIQUE(player_id, start_at, end_at)
);
CREATE TABLE IF NOT EXISTS plotgo_offline_summaries (
  summary_id TEXT PRIMARY KEY,
  offline_session_id TEXT NOT NULL UNIQUE,
  player_id TEXT NOT NULL,
  away_started_at INTEGER NOT NULL,
  returned_at INTEGER NOT NULL,
  processed_until INTEGER NOT NULL,
  frozen_ms INTEGER NOT NULL DEFAULT 0,
  cash_delta_minor INTEGER NOT NULL DEFAULT 0,
  customer_delta REAL NOT NULL DEFAULT 0,
  revenue_credit_minor INTEGER NOT NULL DEFAULT 0,
  growth_credit REAL NOT NULL DEFAULT 0,
  bands_json TEXT NOT NULL DEFAULT '[]',
  timers_json TEXT NOT NULL DEFAULT '[]',
  events_json TEXT NOT NULL DEFAULT '[]',
  risk_json TEXT NOT NULL DEFAULT '{}',
  viewed_at INTEGER,
  created_at INTEGER NOT NULL
);
`);

// Additive migrations keep existing Phase 1–3 saves valid while the Phase 4 book
// gains replay metadata. SQLite has no IF NOT EXISTS form for ADD COLUMN.
for (const statement of [
  "ALTER TABLE plotgo_position ADD COLUMN last_mark_day TEXT NOT NULL DEFAULT ''",
  "ALTER TABLE plotgo_position ADD COLUMN effective_day TEXT NOT NULL DEFAULT ''",
  "ALTER TABLE plotgo_district_day ADD COLUMN marks_json TEXT NOT NULL DEFAULT '{}'",
]) {
  try { sqlite.exec(statement); } catch (error) {
    if (!(error instanceof Error) || !/duplicate column name/i.test(error.message)) throw error;
  }
}

sqlite.exec(`
  CREATE UNIQUE INDEX IF NOT EXISTS idx_module_reward_source
    ON plotgo_module_reward_events (player_id, source, source_event_id)
`);

for (const statement of [
  "ALTER TABLE players ADD COLUMN risk_bps INTEGER NOT NULL DEFAULT 700",
  "ALTER TABLE players ADD COLUMN reputation_bps INTEGER NOT NULL DEFAULT 5000",
  "ALTER TABLE players ADD COLUMN condition_bps INTEGER NOT NULL DEFAULT 10000",
  "ALTER TABLE players ADD COLUMN population INTEGER NOT NULL DEFAULT 0",
  "ALTER TABLE players ADD COLUMN capacity INTEGER NOT NULL DEFAULT 0",
  "ALTER TABLE players ADD COLUMN satisfaction_bps INTEGER NOT NULL DEFAULT 5000",
  "ALTER TABLE players ADD COLUMN transactions INTEGER NOT NULL DEFAULT 0",
  "ALTER TABLE players ADD COLUMN volume_minor INTEGER NOT NULL DEFAULT 0",
  "ALTER TABLE players ADD COLUMN active_days TEXT NOT NULL DEFAULT '[]'",
  "ALTER TABLE players ADD COLUMN plot_balance INTEGER NOT NULL DEFAULT 0",
  "ALTER TABLE players ADD COLUMN last_meaningful_action_at INTEGER NOT NULL DEFAULT 0",
  "ALTER TABLE players ADD COLUMN offline_started_at INTEGER NOT NULL DEFAULT 0",
  "ALTER TABLE players ADD COLUMN offline_processed_until INTEGER NOT NULL DEFAULT 0",
  "ALTER TABLE players ADD COLUMN presence_state TEXT NOT NULL DEFAULT 'engaged'",
  "ALTER TABLE players ADD COLUMN offline_session_id TEXT",
  "ALTER TABLE players ADD COLUMN active_minutes_daily_json TEXT NOT NULL DEFAULT '{}'",
  "ALTER TABLE players ADD COLUMN meaningful_actions_daily_json TEXT NOT NULL DEFAULT '{}'",
  "ALTER TABLE players ADD COLUMN onboarding_session_id TEXT",
  "ALTER TABLE players ADD COLUMN onboarding_started_at INTEGER",
  "ALTER TABLE players ADD COLUMN onboarding_step TEXT NOT NULL DEFAULT 'welcome'",
  "ALTER TABLE players ADD COLUMN onboarding_status TEXT NOT NULL DEFAULT 'active'",
  "ALTER TABLE players ADD COLUMN onboarding_xp INTEGER NOT NULL DEFAULT 0",
  "ALTER TABLE players ADD COLUMN onboarding_completed_at INTEGER",
  "ALTER TABLE players ADD COLUMN onboarding_skipped_at INTEGER",
  "ALTER TABLE players ADD COLUMN first_customer_assist_used INTEGER NOT NULL DEFAULT 0",
  "ALTER TABLE players ADD COLUMN free_tutorial_relocation_used INTEGER NOT NULL DEFAULT 0",
  "ALTER TABLE players ADD COLUMN personal_event_protection_until INTEGER NOT NULL DEFAULT 0",
  "ALTER TABLE players ADD COLUMN archetype TEXT",
  "ALTER TABLE players ADD COLUMN archetype_changed_at INTEGER",
  "ALTER TABLE cards ADD COLUMN orientation INTEGER NOT NULL DEFAULT 0",
  "ALTER TABLE cards ADD COLUMN placed_at INTEGER NOT NULL DEFAULT 0",
  "ALTER TABLE cards ADD COLUMN operational_until INTEGER NOT NULL DEFAULT 0",
  "ALTER TABLE fragments ADD COLUMN units_micros INTEGER",
  "ALTER TABLE market_hunt_slots ADD COLUMN target REAL NOT NULL DEFAULT 0",
  "ALTER TABLE market_hunt_slots ADD COLUMN module_reward_kind TEXT",
  "ALTER TABLE market_hunt_slots ADD COLUMN module_reward_rarity TEXT",
  "ALTER TABLE market_hunt_slots ADD COLUMN module_reward_quantity INTEGER NOT NULL DEFAULT 0",
  "ALTER TABLE market_hunt_slots ADD COLUMN module_reward_parts INTEGER NOT NULL DEFAULT 0",
  "ALTER TABLE market_hunt_slots ADD COLUMN module_reward_module_id TEXT",
  "ALTER TABLE plotgo_module_reward_events ADD COLUMN config_version TEXT NOT NULL DEFAULT 'catalog-v1.0'",
  "ALTER TABLE weekly_performance ADD COLUMN event_points REAL NOT NULL DEFAULT 0",
]) {
  try {
    sqlite.exec(statement);
  } catch {
    // The column already exists on a database created by the current schema.
  }
}

sqlite.exec("UPDATE fragments SET units_micros = units_bps * 10000 WHERE units_micros IS NULL");
sqlite.exec("UPDATE players SET last_meaningful_action_at = CASE WHEN last_meaningful_action_at = 0 THEN created_at ELSE last_meaningful_action_at END, offline_processed_until = CASE WHEN offline_processed_until = 0 THEN COALESCE(last_settle_at, created_at) ELSE offline_processed_until END, offline_started_at = CASE WHEN offline_started_at = 0 THEN created_at ELSE offline_started_at END WHERE last_meaningful_action_at = 0 OR offline_processed_until = 0 OR offline_started_at = 0");
sqlite.exec("CREATE UNIQUE INDEX IF NOT EXISTS idx_module_parts_source ON module_parts_ledger (player_id, source, source_event_id)");
sqlite.exec("CREATE UNIQUE INDEX IF NOT EXISTS idx_module_loadout_idempotency ON module_loadout_audit (player_id, building_id, idempotency_key)");

export const db = drizzle(sqlite, { schema });
export { sqlite };
