import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const players = sqliteTable("players", {
  id: text("id").primaryKey(),
  createdAt: integer("created_at").notNull(),
  founder: integer("founder").notNull().default(1),
  cashMinor: integer("cash_minor").notNull(),
  earnedMinor: integer("earned_minor").notNull().default(0),
  lastSettleAt: integer("last_settle_at").notNull(),
  exchangeActionsToday: integer("exchange_actions_today").notNull().default(0),
  huntDay: text("hunt_day").notNull(),
  huntId: text("hunt_id").notNull(),
  huntClaimed: integer("hunt_claimed").notNull().default(0),
  weeklyScore: integer("weekly_score").notNull().default(0),
  riskBps: integer("risk_bps").notNull().default(700),
  reputationBps: integer("reputation_bps").notNull().default(5000),
  conditionBps: integer("condition_bps").notNull().default(10000),
  population: integer("population").notNull().default(0),
  capacity: integer("capacity").notNull().default(0),
  satisfactionBps: integer("satisfaction_bps").notNull().default(5000),
  transactions: integer("transactions").notNull().default(0),
  volumeMinor: integer("volume_minor").notNull().default(0),
  activeDays: text("active_days").notNull().default("[]"),
  plotBalance: integer("plot_balance").notNull().default(0),
  onboardingSessionId: text("onboarding_session_id"),
  onboardingStartedAt: integer("onboarding_started_at"),
  onboardingStep: text("onboarding_step").notNull().default("welcome"),
  onboardingStatus: text("onboarding_status").notNull().default("active"),
  onboardingXp: integer("onboarding_xp").notNull().default(0),
  onboardingCompletedAt: integer("onboarding_completed_at"),
  onboardingSkippedAt: integer("onboarding_skipped_at"),
  firstCustomerAssistUsed: integer("first_customer_assist_used").notNull().default(0),
  freeTutorialRelocationUsed: integer("free_tutorial_relocation_used").notNull().default(0),
  personalEventProtectionUntil: integer("personal_event_protection_until").notNull().default(0),
  archetype: text("archetype"),
  archetypeChangedAt: integer("archetype_changed_at"),
});

export const cards = sqliteTable("cards", {
  id: text("id").primaryKey(),
  playerId: text("player_id").notNull(),
  type: text("type").notNull(),
  x: integer("x").notNull(),
  y: integer("y").notNull(),
  stage: integer("stage").notNull(),
  orientation: integer("orientation").notNull().default(0),
  placedAt: integer("placed_at").notNull().default(0),
  operationalUntil: integer("operational_until").notNull().default(0),
});

export const fragments = sqliteTable("fragments", {
  playerId: text("player_id").notNull(),
  ticker: text("ticker").notNull(),
  unitsBps: integer("units_bps").notNull(), // Legacy storage retained for migration.
  unitsMicros: integer("units_micros"), // 1,000,000 = one full stock unit.
});
