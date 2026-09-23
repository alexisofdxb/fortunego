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
});

export const cards = sqliteTable("cards", {
  id: text("id").primaryKey(),
  playerId: text("player_id").notNull(),
  type: text("type").notNull(),
  x: integer("x").notNull(),
  y: integer("y").notNull(),
  stage: integer("stage").notNull(),
});

export const fragments = sqliteTable("fragments", {
  playerId: text("player_id").notNull(),
  ticker: text("ticker").notNull(),
  unitsBps: integer("units_bps").notNull(), // 100 = 0.01
});
