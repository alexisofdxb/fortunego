import { serve } from "@hono/node-server";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { createHash } from "node:crypto";
import { eq } from "drizzle-orm";
import { z } from "zod";
import {
  BUILDING_LIST,
  CARDS,
  cardCustomers,
  collectionProgress,
  DIFFICULTY_RULES,
  collectionBonuses,
  empireLevel,
  eventForDay,
  MARKET_HUNTS,
  MARKET_STOCKS,
  REWARD_VALUES_MINOR,
  STAGE_RULES,
  isoWeek,
  marketStageForEmpireLevel,
  marketStageIndex,
  marketEventForDay,
  DEFAULT_PERFORMANCE_TARGET_MODE,
  calculatePerformanceScore,
  allocateWeeklyPayouts,
  resolvePlacement,
  buildingFamily,
  BUILDING_EVENT_SENSITIVITY,
  EVENT_CATALOG,
  EVENT_CATALOG_COUNT,
  EVENT_DECISIONS,
  EVENT_MISSIONS,
  EVENT_REWARD_RULES,
  MARKET_CYCLE_RULES,
  MARKET_CYCLE_TRANSITIONS,
  catalogModifier,
  cycleModifier,
  eventEligible,
  stackModifiers,
  stageIndex,
  rewardUnitsMicrosAtPrice,
  seedForDay,
  SESSION_VERBS,
  STARTER_CASH_MINOR,
  settleDistrict,
  buildingModuleProfile,
  moduleEquippable,
  moduleStageAllowedAtEmpireLevel,
  EMPIRE_ARCHETYPES,
  resolveArchetype,
  canonicalModuleCatalog,
  eventModuleInteraction,
  moduleBuildingFamily,
  moduleDefinition,
  moduleLockForEvent,
  moduleRewardLabel,
  moduleSlotsForRuntimeStage,
  rollEventModuleReward,
  rollHuntModuleReward,
  resolveModuleEffects,
  PHASE4_INSTRUMENTS,
  applyPortfolioMarks,
  phase4Marks,
  OFFLINE_CONFIG,
  splitOfflineWindow,
  type PlacedCard,
  type ModuleEffectVector,
  type ModuleReward,
  type OfflineSlice,
  type EmpireArchetype,
  type SessionVerb,
  displayCash,
  empireValueMinor,
  fits,
  buildingUnlockLevel,
  isUnlocked,
  ONBOARDING_MILESTONES,
  onboardingGuideFor,
  onboardingLevel as onboardingLevelForXp,
  onboardingMilestone,
  onboardingStep as onboardingStepForMilestones,
  resolveType,
  tickMinor,
  upgradeCostMinor,
  utcDay,
} from "@plotgo/game";
import { db, sqlite } from "./db.ts";
import { cards, fragments, players } from "./schema.ts";
import type { CatalogEvent, EventDecision, EventMission, EventModifier, EventScope, MarketCycleState, MarketHuntTemplate, MarketStage, RewardRarity, HuntDifficulty, PerformanceMetrics, Orientation } from "@plotgo/game";

const app = new Hono();
app.use(
  "*",
  cors({
    origin: ["http://localhost:5173", "http://127.0.0.1:5173"],
    allowHeaders: ["Content-Type", "x-player-id"],
  }),
);

function newId(): string {
  return crypto.randomUUID();
}

const MODULE_CONFIG_VERSION = "catalog-v1.0";
const PHASE4_TICKERS = ["NVDA", "AAPL", "TSLA", "CASH"] as const;

function ensureModuleConfig() {
  const insert = sqlite.prepare(`
    INSERT OR IGNORE INTO module_config
      (module_id, config_version, rarity, category, compatible_families, config_json, is_active, effective_from)
    VALUES (?, ?, ?, ?, ?, ?, 1, ?)
  `);
  const now = Date.now();
  sqlite.transaction(() => {
    for (const entry of canonicalModuleCatalog()) {
      const definition = moduleDefinition(entry.id);
      insert.run(entry.id, MODULE_CONFIG_VERSION, entry.rarity.toLowerCase(), entry.category, entry.families, JSON.stringify(definition ?? entry), now);
    }
  })();
}

ensureModuleConfig();

function moduleEntry(moduleId: string) {
  return canonicalModuleCatalog().find((entry) => entry.id === moduleId) ?? null;
}

function moduleInventoryRows(playerId: string) {
  const rows = sqlite.prepare(`
    SELECT module_id AS moduleId, quantity_owned AS quantityOwned, quantity_equipped AS quantityEquipped,
           first_acquired_at AS firstAcquiredAt, last_acquired_at AS lastAcquiredAt, row_version AS rowVersion
    FROM player_module_inventory WHERE player_id = ? ORDER BY module_id
  `).all(playerId) as Record<string, unknown>[];
  const byId = new Map(rows.map((row) => [String(row.moduleId), row]));
  return canonicalModuleCatalog().map((entry) => {
    const row = byId.get(entry.id);
    const definition = moduleDefinition(entry.id);
    return {
      moduleId: entry.id,
      name: entry.name,
      rarity: entry.rarity.toLowerCase(),
      category: entry.category,
      families: entry.families.split(",").map((family) => family.trim()).filter(Boolean),
      role: entry.role,
      primaryPower: entry.primaryPower,
      secondaryPower: entry.secondaryPower,
      condition: entry.condition,
      craftParts: entry.craftParts,
      craftCost: entry.craftCost,
      craftTimeMin: entry.craftTimeMin,
      dismantleParts: entry.dismantleParts,
      effects: definition?.effects ?? [],
      quantityOwned: Number(row?.quantityOwned ?? 0),
      quantityEquipped: Number(row?.quantityEquipped ?? 0),
      quantityAvailable: Math.max(0, Number(row?.quantityOwned ?? 0) - Number(row?.quantityEquipped ?? 0)),
      firstAcquiredAt: row?.firstAcquiredAt == null ? null : Number(row.firstAcquiredAt),
      lastAcquiredAt: row?.lastAcquiredAt == null ? null : Number(row.lastAcquiredAt),
      rowVersion: Number(row?.rowVersion ?? 0),
      configVersion: MODULE_CONFIG_VERSION,
    };
  });
}

function modulePartsRows(playerId: string) {
  const rows = sqlite.prepare("SELECT rarity, balance, row_version AS rowVersion FROM module_parts_balance WHERE player_id = ? ORDER BY rarity").all(playerId) as Record<string, unknown>[];
  const byRarity = new Map(rows.map((row) => [String(row.rarity), row]));
  return (["common", "uncommon", "rare", "epic", "legendary"] as const).map((rarity) => ({
    rarity,
    balance: Number(byRarity.get(rarity)?.balance ?? 0),
    rowVersion: Number(byRarity.get(rarity)?.rowVersion ?? 0),
  }));
}

function grantModuleInventory(playerId: string, moduleId: string, quantity: number, now = Date.now()) {
  if (quantity <= 0 || !moduleEntry(moduleId)) return false;
  const result = sqlite.prepare(`
    INSERT INTO player_module_inventory
      (player_id, module_id, quantity_owned, quantity_equipped, first_acquired_at, last_acquired_at, row_version)
    VALUES (?, ?, ?, 0, ?, ?, 1)
    ON CONFLICT(player_id, module_id) DO UPDATE SET
      quantity_owned = player_module_inventory.quantity_owned + excluded.quantity_owned,
      last_acquired_at = excluded.last_acquired_at,
      row_version = player_module_inventory.row_version + 1
  `).run(playerId, moduleId, quantity, now, now);
  return result.changes === 1;
}

function grantModuleParts(playerId: string, rarity: string, amount: number, source: string, sourceEventId: string, now = Date.now()) {
  if (amount <= 0) return false;
  const ledger = sqlite.prepare(`
    INSERT OR IGNORE INTO module_parts_ledger (entry_id, player_id, rarity, delta, source, source_event_id, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(newId(), playerId, rarity, amount, source, sourceEventId, now);
  if (ledger.changes !== 1) return false;
  sqlite.prepare(`
    INSERT INTO module_parts_balance (player_id, rarity, balance, row_version) VALUES (?, ?, ?, 1)
    ON CONFLICT(player_id, rarity) DO UPDATE SET balance = module_parts_balance.balance + excluded.balance, row_version = module_parts_balance.row_version + 1
  `).run(playerId, rarity, amount);
  return true;
}

function moduleEffectsForBoard(playerId: string, board: PlacedCard[], activeEvents: readonly string[] = [], marketState = "Neutral"): Record<string, ModuleEffectVector> {
  const player = sqlite.prepare("SELECT reputation_bps AS reputationBps, satisfaction_bps AS satisfactionBps, risk_bps AS riskBps, condition_bps AS conditionBps FROM players WHERE id = ?").get(playerId) as { reputationBps: number; satisfactionBps: number; riskBps: number; conditionBps: number } | undefined;
  const loadouts = sqlite.prepare("SELECT building_id AS buildingId, slot_index AS slotIndex, module_id AS moduleId FROM building_module_loadout WHERE player_id = ? AND effective_at <= ? ORDER BY building_id, slot_index").all(playerId, Date.now()) as { buildingId: string; slotIndex: number; moduleId: string }[];
  const byBuilding = new Map<string, string[]>();
  for (const row of loadouts) {
    const modules = byBuilding.get(row.buildingId) ?? [];
    modules.push(row.moduleId);
    byBuilding.set(row.buildingId, modules);
  }
  const context = {
    reputation: Number(player?.reputationBps ?? 5000) / 100,
    serviceQuality: Number(player?.satisfactionBps ?? 5000) / 100,
    risk: {
      operational: Number(player?.riskBps ?? 700) / 100,
      market: Number(player?.riskBps ?? 700) / 100,
      liquidity: Number(player?.riskBps ?? 700) / 100,
      credit: Number(player?.riskBps ?? 700) / 100,
      reputation: Math.max(0, 100 - Number(player?.reputationBps ?? 5000) / 100),
      concentration: Number(player?.riskBps ?? 700) / 100,
      composite: Number(player?.riskBps ?? 700) / 100,
    },
    activeEvents,
    marketState,
    empireStage: marketStageForEmpireLevel(currentEmpireLevel(playerId, board)),
  } as const;
  const result: Record<string, ModuleEffectVector> = {};
  for (const card of board) {
    const active = (byBuilding.get(card.id) ?? []).filter((moduleId) => !activeEvents.some((eventId) => moduleLockForEvent(eventId, buildingFamily(card.type))));
    result[card.id] = resolveModuleEffects(card.type, active, context);
  }
  return result;
}

function effectiveAtBoundary(now = Date.now()) {
  return Math.ceil(now / (5 * 60_000)) * 5 * 60_000;
}

async function loadCards(playerId: string): Promise<PlacedCard[]> {
  const rows = await db.select().from(cards).where(eq(cards.playerId, playerId));
  const migrationPlacedAt = Date.now();
  return rows.map((r) => {
    const placedAt = r.placedAt || migrationPlacedAt;
    if (!r.placedAt) sqlite.prepare("UPDATE cards SET placed_at = ? WHERE id = ? AND placed_at = 0").run(placedAt, r.id);
    return {
      id: r.id,
      type: resolveType(r.type),
      x: r.x,
      y: r.y,
      stage: r.stage as 1 | 2 | 3,
      orientation: (r.orientation ?? 0) as 0 | 90 | 180 | 270,
      placedAt,
      operationalUntil: r.operationalUntil || 0,
    };
  });
}

async function loadFrags(playerId: string) {
  const rows = sqlite.prepare("SELECT ticker, COALESCE(units_micros, units_bps * 10000) AS unitsMicros FROM fragments WHERE player_id = ?").all(playerId) as { ticker: string; unitsMicros: number }[];
  const map: Record<string, number> = {};
  let units = 0;
  for (const r of rows) {
    const u = r.unitsMicros / 1_000_000;
    map[r.ticker] = (map[r.ticker] ?? 0) + u;
    units += u;
  }
  const portfolio = MARKET_STOCKS
    .map((stock) => ({ ...stock, units: map[stock.ticker] ?? 0, oraclePriceMinor: oraclePriceMinor(stock.ticker), valueMinor: Math.round((map[stock.ticker] ?? 0) * oraclePriceMinor(stock.ticker)) }))
    .filter((stock) => stock.units > 0);
  return { map, units, portfolio, collections: collectionProgress(map) };
}

function addStockUnits(playerId: string, ticker: string, unitsMicros: number) {
  sqlite
    .prepare(
      `INSERT INTO fragments (player_id, ticker, units_bps, units_micros) VALUES (?, ?, 0, ?)
       ON CONFLICT(player_id, ticker) DO UPDATE SET units_micros = COALESCE(fragments.units_micros, fragments.units_bps * 10000) + excluded.units_micros`,
    )
    .run(playerId, ticker, unitsMicros);
}

function pendingModuleRewards(playerId: string) {
  const rows = sqlite.prepare("SELECT * FROM plotgo_module_reward_events WHERE player_id = ? AND status = 'pending' ORDER BY created_at ASC").all(playerId) as Record<string, unknown>[];
  return rows.map((row) => ({
    rewardId: String(row.reward_id),
    source: String(row.source),
    sourceEventId: String(row.source_event_id),
    kind: String(row.reward_kind),
    rarity: String(row.rarity),
    moduleId: row.module_id == null ? null : String(row.module_id),
    moduleName: row.module_id == null ? null : moduleEntry(String(row.module_id))?.name ?? null,
    quantity: Number(row.quantity),
    partsAmount: Number(row.parts_amount),
    metadata: JSON.parse(String(row.metadata_json ?? "{}")),
    createdAt: Number(row.created_at),
  }));
}

function oraclePriceMinor(ticker: string, now = Date.now()): number {
  const stock = MARKET_STOCKS.find((candidate) => candidate.ticker === ticker) ?? MARKET_STOCKS[0]!;
  const row = sqlite.prepare("SELECT price_minor AS priceMinor, refreshed_at AS refreshedAt FROM market_oracle_prices WHERE ticker = ?").get(ticker) as
    | { priceMinor: number; refreshedAt: number }
    | undefined;
  if (row && now - row.refreshedAt < 5 * 60_000) return row.priceMinor;
  if (!row) {
    sqlite.prepare("INSERT INTO market_oracle_prices (ticker, price_minor, refreshed_at) VALUES (?, ?, ?)").run(ticker, stock.oraclePriceMinor, now);
    return stock.oraclePriceMinor;
  }
  const bucket = Math.floor(now / (5 * 60_000));
  let hash = bucket;
  for (const char of ticker) hash = Math.imul(hash ^ char.charCodeAt(0), 16_777_619);
  const movementBps = ((hash >>> 0) % 1001) - 500;
  const priceMinor = Math.max(100, Math.round(stock.oraclePriceMinor * (10_000 + movementBps) / 10_000));
  sqlite.prepare("UPDATE market_oracle_prices SET price_minor = ?, refreshed_at = ? WHERE ticker = ?").run(priceMinor, now, ticker);
  return priceMinor;
}

function touchActiveDay(playerId: string, day: string): string[] {
  const row = sqlite.prepare("SELECT active_days AS activeDays FROM players WHERE id = ?").get(playerId) as { activeDays: string } | undefined;
  let days: string[] = [];
  try { days = JSON.parse(row?.activeDays ?? "[]"); } catch { days = []; }
  if (!days.includes(day)) days = [...days, day].slice(-30);
  sqlite.prepare("UPDATE players SET active_days = ? WHERE id = ?").run(JSON.stringify(days), playerId);
  return days;
}

type PresenceRow = {
  id: string;
  createdAt: number;
  cashMinor: number;
  earnedMinor: number;
  population: number;
  capacity: number;
  satisfactionBps: number;
  riskBps: number;
  reputationBps: number;
  conditionBps: number;
  transactions: number;
  volumeMinor: number;
  lastMeaningfulActionAt: number;
  offlineStartedAt: number;
  offlineProcessedUntil: number;
  presenceState: string;
  offlineSessionId: string | null;
  activeDays: string;
  activeMinutesDailyJson: string;
  meaningfulActionsDailyJson: string;
};

type OnboardingRow = {
  onboardingSessionId: string | null;
  onboardingStartedAt: number | null;
  onboardingStep: string;
  onboardingStatus: "active" | "completed" | "skipped";
  onboardingXp: number;
  onboardingCompletedAt: number | null;
  onboardingSkippedAt: number | null;
  personalEventProtectionUntil: number;
  firstCustomerAssistUsed: number;
  freeTutorialRelocationUsed: number;
};

function onboardingRow(playerId: string): OnboardingRow | undefined {
  return sqlite.prepare(`
    SELECT onboarding_session_id AS onboardingSessionId, onboarding_started_at AS onboardingStartedAt,
      onboarding_step AS onboardingStep, onboarding_status AS onboardingStatus, onboarding_xp AS onboardingXp,
      onboarding_completed_at AS onboardingCompletedAt, onboarding_skipped_at AS onboardingSkippedAt,
      personal_event_protection_until AS personalEventProtectionUntil,
      first_customer_assist_used AS firstCustomerAssistUsed,
      free_tutorial_relocation_used AS freeTutorialRelocationUsed
    FROM players WHERE id = ?
  `).get(playerId) as OnboardingRow | undefined;
}

function onboardingMilestoneRows(playerId: string): { milestoneId: string; xp: number; achievedAt: number }[] {
  return sqlite.prepare("SELECT milestone_id AS milestoneId, xp, achieved_at AS achievedAt FROM plotgo_onboarding_milestones WHERE player_id = ? ORDER BY achieved_at ASC").all(playerId) as { milestoneId: string; xp: number; achievedAt: number }[];
}

function onboardingSnapshot(playerId: string) {
  const row = onboardingRow(playerId);
  if (!row) return null;
  const milestones = onboardingMilestoneRows(playerId);
  const achieved = milestones.map((milestone) => milestone.milestoneId);
  const guide = row.onboardingStatus === "active" ? onboardingGuideFor(row.onboardingStep) ?? null : null;
  const elapsedMinutes = row.onboardingStartedAt == null ? 0 : Math.max(0, (Date.now() - row.onboardingStartedAt) / 60_000);
  return {
    sessionId: row.onboardingSessionId,
    startedAt: row.onboardingStartedAt,
    status: row.onboardingStatus,
    step: row.onboardingStep,
    xp: row.onboardingXp,
    level: onboardingLevelForXp(row.onboardingXp),
    completedAt: row.onboardingCompletedAt,
    skippedAt: row.onboardingSkippedAt,
    protectionUntil: row.personalEventProtectionUntil,
    recovery: {
      firstCustomerAssistUsed: row.firstCustomerAssistUsed === 1,
      freeTutorialRelocationUsed: row.freeTutorialRelocationUsed === 1,
    },
    elapsedMinutes: Number(elapsedMinutes.toFixed(2)),
    guide: guide ? { ...guide, overdue: elapsedMinutes > ((onboardingMilestone(guide.milestoneId)?.targetMinute ?? 0) + 2) } : null,
    milestones: ONBOARDING_MILESTONES.map((milestone) => ({
      ...milestone,
      achievedAt: milestones.find((item) => item.milestoneId === milestone.id)?.achievedAt ?? null,
    })),
    achieved,
  };
}

function ensureOnboardingStarted(playerId: string, now = Date.now()) {
  const row = onboardingRow(playerId);
  if (!row || row.onboardingStartedAt != null || row.onboardingStatus !== "active") return;
  const sessionId = newId();
  sqlite.prepare("UPDATE players SET onboarding_session_id = ?, onboarding_started_at = ?, onboarding_step = 'onboarding_started', personal_event_protection_until = ? WHERE id = ?").run(sessionId, now, now + 60 * 60_000, playerId);
  sqlite.prepare("INSERT OR IGNORE INTO plotgo_onboarding_milestones (player_id, milestone_id, xp, source_event, achieved_at) VALUES (?, 'onboarding_started', 0, 'session.start', ?)").run(playerId, now);
}

function recordOnboardingMilestone(playerId: string, milestoneId: string, sourceEvent: string, now = Date.now()) {
  const milestone = onboardingMilestone(milestoneId);
  const row = onboardingRow(playerId);
  if (!milestone || !row || row.onboardingStatus !== "active") return false;
  const result = sqlite.prepare("INSERT OR IGNORE INTO plotgo_onboarding_milestones (player_id, milestone_id, xp, source_event, achieved_at) VALUES (?, ?, ?, ?, ?)").run(playerId, milestone.id, milestone.xp, sourceEvent, now);
  if (result.changes !== 1) return false;
  const xp = row.onboardingXp + milestone.xp;
  const achieved = onboardingMilestoneRows(playerId).map((item) => item.milestoneId);
  const nextStep = onboardingStepForMilestones(achieved, row.onboardingStatus);
  const requiredIds = ONBOARDING_MILESTONES.filter((item) => item.required).map((item) => item.id);
  const complete = requiredIds.every((id) => achieved.includes(id));
  sqlite.prepare("UPDATE players SET onboarding_xp = ?, onboarding_step = ?, onboarding_status = ?, onboarding_completed_at = CASE WHEN ? THEN COALESCE(onboarding_completed_at, ?) ELSE onboarding_completed_at END WHERE id = ?").run(xp, nextStep, complete ? "completed" : "active", complete ? 1 : 0, complete ? now : null, playerId);
  return true;
}

function hasTutorialCashAccessSynergy(board: PlacedCard[]): boolean {
  return resolvePlacement(board).links.some((link) => link.rule === "cash_kiosk+savings_stand");
}

function claimTutorialRecovery(
  playerId: string,
  kind: "first_customer_assist" | "free_tutorial_relocation",
  creditedMinor: number,
  metadata: Record<string, unknown>,
): boolean {
  const flagColumn = kind === "first_customer_assist" ? "first_customer_assist_used" : "free_tutorial_relocation_used";
  const now = Date.now();
  const claimed = sqlite.transaction(() => {
    const updated = sqlite.prepare(`UPDATE players SET ${flagColumn} = 1 WHERE id = ? AND ${flagColumn} = 0`).run(playerId);
    if (updated.changes !== 1) return false;
    sqlite.prepare(`INSERT OR IGNORE INTO plotgo_tutorial_recovery_ledger
      (id, player_id, kind, credited_minor, source_event, metadata_json, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)`)
      .run(newId(), playerId, kind, Math.max(0, Math.round(creditedMinor)), `onboarding.${kind}`, JSON.stringify(metadata), now);
    return true;
  })();
  if (!claimed) return false;
  const balance = sqlite.prepare("SELECT cash_minor AS cashMinor FROM players WHERE id = ?").get(playerId) as { cashMinor: number };
  recordLedger(playerId, utcDay(now), "onboarding_recovery", 0, Number(balance.cashMinor), { kind, creditedMinor: Math.max(0, Math.round(creditedMinor)), ...metadata });
  return true;
}

function tutorialRelocationAvailable(playerId: string, board: PlacedCard[], now = Date.now()): boolean {
  const row = onboardingRow(playerId);
  if (!row || row.onboardingStatus !== "active" || row.freeTutorialRelocationUsed === 1 || hasTutorialCashAccessSynergy(board)) return false;
  if (!row.onboardingStartedAt || now - row.onboardingStartedAt > 20 * 60_000) return false;
  return board.some((card) => card.type === "cash_kiosk") && board.some((card) => card.type === "savings_stand");
}

function currentEmpireLevel(playerId: string, board: PlacedCard[]): number {
  const row = onboardingRow(playerId);
  return row && row.onboardingXp > 0 ? Math.max(empireLevel(board), onboardingLevelForXp(row.onboardingXp)) : empireLevel(board);
}

function archetypeResolutionForPlayer(playerId: string, board: PlacedCard[]) {
  const row = sqlite.prepare("SELECT archetype FROM players WHERE id = ?").get(playerId) as { archetype: EmpireArchetype | null } | undefined;
  const portfolio = sqlite.prepare("SELECT (SELECT COUNT(*) FROM fragments WHERE player_id = ? AND COALESCE(units_micros, units_bps) > 0) + (SELECT COUNT(*) FROM plotgo_position WHERE player_id = ? AND weight_bps > 0) AS count").get(playerId, playerId) as { count: number };
  return resolveArchetype(board, row?.archetype ?? null, Number(portfolio.count) > 0);
}

function positionRows(playerId: string) {
  const rows = sqlite.prepare("SELECT ticker, weight_bps AS weightBps, allocated_minor AS allocatedMinor, mark_bps AS markBps, last_mark_day AS lastMarkDay, effective_day AS effectiveDay, updated_at AS updatedAt FROM plotgo_position WHERE player_id = ? ORDER BY ticker").all(playerId) as Record<string, unknown>[];
  const byTicker = new Map(rows.map((row) => [String(row.ticker), row]));
  return PHASE4_INSTRUMENTS.map((instrument) => {
    const row = byTicker.get(instrument.ticker);
    return {
      ...instrument,
      inGame: true,
      weightBps: Number(row?.weightBps ?? (instrument.ticker === "CASH" && rows.length === 0 ? 10_000 : 0)),
      allocatedMinor: Number(row?.allocatedMinor ?? 0),
      markBps: Number(row?.markBps ?? 0),
      lastMarkDay: row?.lastMarkDay == null ? null : String(row.lastMarkDay),
      effectiveDay: row?.effectiveDay == null ? null : String(row.effectiveDay),
      updatedAt: row?.updatedAt == null ? null : Number(row.updatedAt),
    };
  });
}

function presenceRow(playerId: string): PresenceRow | undefined {
  const row = sqlite.prepare(`
    SELECT id, created_at AS createdAt, cash_minor AS cashMinor, earned_minor AS earnedMinor,
      population, capacity, satisfaction_bps AS satisfactionBps, risk_bps AS riskBps,
      reputation_bps AS reputationBps, condition_bps AS conditionBps, transactions,
      volume_minor AS volumeMinor, last_meaningful_action_at AS lastMeaningfulActionAt,
      offline_started_at AS offlineStartedAt, offline_processed_until AS offlineProcessedUntil,
      presence_state AS presenceState, offline_session_id AS offlineSessionId,
      active_days AS activeDays, active_minutes_daily_json AS activeMinutesDailyJson,
      meaningful_actions_daily_json AS meaningfulActionsDailyJson
    FROM players WHERE id = ?
  `).get(playerId) as PresenceRow | undefined;
  if (!row) return undefined;
  const now = Date.now();
  const lastAction = Number(row.lastMeaningfulActionAt || row.createdAt || now);
  const cursor = Number(row.offlineProcessedUntil || row.createdAt || now);
  if (!row.lastMeaningfulActionAt || !row.offlineProcessedUntil || !row.offlineStartedAt) {
    sqlite.prepare(`UPDATE players SET last_meaningful_action_at = ?, offline_started_at = ?, offline_processed_until = ?, presence_state = COALESCE(presence_state, 'engaged') WHERE id = ?`).run(lastAction, lastAction, cursor, playerId);
    row.lastMeaningfulActionAt = lastAction;
    row.offlineStartedAt = lastAction;
    row.offlineProcessedUntil = cursor;
  }
  return row;
}

function parseNumberMap(value: string | null | undefined): Record<string, number> {
  try {
    const parsed = JSON.parse(value ?? "{}");
    if (!parsed || typeof parsed !== "object") return {};
    return Object.fromEntries(Object.entries(parsed).map(([key, item]) => [key, Number(item) || 0]));
  } catch {
    return {};
  }
}

function parseDays(value: string | null | undefined): string[] {
  try {
    const parsed = JSON.parse(value ?? "[]");
    return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === "string") : [];
  } catch {
    return [];
  }
}

function recordMeaningfulAction(playerId: string, action: string, now = Date.now()) {
  const row = presenceRow(playerId);
  if (!row) return;
  const day = utcDay(now);
  const minutesByDay = parseNumberMap(row.activeMinutesDailyJson);
  const actionsByDay = parseNumberMap(row.meaningfulActionsDailyJson);
  const gapMin = row.lastMeaningfulActionAt > 0 ? (now - row.lastMeaningfulActionAt) / 60_000 : 0;
  const engagedMinutes = gapMin > 0 && gapMin <= OFFLINE_CONFIG.afkTimeoutMin ? Math.max(1, Math.min(5, Math.floor(gapMin))) : 1;
  minutesByDay[day] = Math.min(24 * 60, (minutesByDay[day] ?? 0) + engagedMinutes);
  actionsByDay[day] = (actionsByDay[day] ?? 0) + 1;
  const days = parseDays(row.activeDays);
  if ((minutesByDay[day] ?? 0) >= 10 && (actionsByDay[day] ?? 0) > 0 && !days.includes(day)) days.push(day);
  const retainedDays = days.slice(-30);
  sqlite.prepare(`
    UPDATE players SET last_meaningful_action_at = ?, offline_started_at = ?, offline_processed_until = ?, presence_state = 'engaged', offline_session_id = NULL,
      active_days = ?, active_minutes_daily_json = ?, meaningful_actions_daily_json = ?, last_settle_at = ? WHERE id = ?
  `).run(now, now, now, JSON.stringify(retainedDays), JSON.stringify(minutesByDay), JSON.stringify(actionsByDay), now, playerId);
  sqlite.prepare(`INSERT INTO plotgo_event_audit (id, player_id, event_id, audit_type, resolution_hash, payload_json, created_at) VALUES (?, ?, NULL, 'meaningful_action', ?, ?, ?)`).run(newId(), playerId, createHash("sha256").update(`${playerId}:${action}:${now}`).digest("hex"), JSON.stringify({ action, activeMinutes: minutesByDay[day], qualifyingActiveDay: retainedDays.includes(day) }), now);
  if (onboardingMilestoneRows(playerId).some((milestone) => milestone.milestoneId === "onboarding_first_performance")) {
    recordOnboardingMilestone(playerId, "onboarding_freeplay", `meaningful:${action}`, now);
  }
}

function moduleThroughputBps(board: PlacedCard[], effects: Record<string, ModuleEffectVector>, key: "activityEfficiencyBps" | "operatingCostReductionBps") {
  const weights = board.reduce((sum, card) => sum + Math.max(1, CARDS[resolveType(card.type)]?.customersBase ?? 1), 0);
  if (!weights) return 0;
  return Math.round(board.reduce((sum, card) => sum + Number(effects[card.id]?.[key] ?? 0) * Math.max(1, CARDS[resolveType(card.type)]?.customersBase ?? 1), 0) / weights);
}

type OfflineSummary = {
  summaryId: string;
  offlineSessionId: string;
  awayStartedAt: number;
  returnedAt: number;
  processedUntil: number;
  frozenMs: number;
  cashDeltaMinor: number;
  customerDelta: number;
  revenueCreditMinor: number;
  growthCredit: number;
  bands: { band: string; durationMs: number; cashEfficiency: number; customerIntensity: number }[];
  events: string[];
  risk: { beforeBps: number; afterBps: number };
  viewedAt: number | null;
};

function offlineSummaryRow(playerId: string): OfflineSummary | null {
  const row = sqlite.prepare(`
    SELECT summary_id AS summaryId, offline_session_id AS offlineSessionId, away_started_at AS awayStartedAt,
      returned_at AS returnedAt, processed_until AS processedUntil, frozen_ms AS frozenMs,
      cash_delta_minor AS cashDeltaMinor, customer_delta AS customerDelta,
      revenue_credit_minor AS revenueCreditMinor, growth_credit AS growthCredit,
      bands_json AS bandsJson, events_json AS eventsJson, risk_json AS riskJson, viewed_at AS viewedAt
    FROM plotgo_offline_summaries WHERE player_id = ? AND viewed_at IS NULL ORDER BY returned_at DESC LIMIT 1
  `).get(playerId) as Record<string, unknown> | undefined;
  if (!row || Number(row.returnedAt) - Number(row.awayStartedAt) < OFFLINE_CONFIG.summaryThresholdMin * 60_000) return null;
  return {
    summaryId: String(row.summaryId),
    offlineSessionId: String(row.offlineSessionId),
    awayStartedAt: Number(row.awayStartedAt),
    returnedAt: Number(row.returnedAt),
    processedUntil: Number(row.processedUntil),
    frozenMs: Number(row.frozenMs ?? 0),
    cashDeltaMinor: Number(row.cashDeltaMinor ?? 0),
    customerDelta: Number(row.customerDelta ?? 0),
    revenueCreditMinor: Number(row.revenueCreditMinor ?? 0),
    growthCredit: Number(row.growthCredit ?? 0),
    bands: JSON.parse(String(row.bandsJson ?? "[]")),
    events: JSON.parse(String(row.eventsJson ?? "[]")),
    risk: JSON.parse(String(row.riskJson ?? "{}")),
    viewedAt: row.viewedAt == null ? null : Number(row.viewedAt),
  };
}

async function processOfflineCatchup(playerId: string, now = Date.now()): Promise<OfflineSummary | null> {
  const row = presenceRow(playerId);
  if (!row) return null;
  const lastAction = Number(row.lastMeaningfulActionAt || row.createdAt || now);
  const offlineStart = lastAction;
  const firstOfflineAt = lastAction + OFFLINE_CONFIG.afkTimeoutMin * 60_000;
  const cursor = Math.max(Number(row.offlineProcessedUntil || row.createdAt), firstOfflineAt);
  const capUntil = lastAction + OFFLINE_CONFIG.accrualCapHours * 3_600_000;
  if (now <= firstOfflineAt) {
    sqlite.prepare("UPDATE players SET presence_state = ? WHERE id = ?").run(now - lastAction > OFFLINE_CONFIG.afkTimeoutMin * 60_000 ? "afk_online" : "engaged", playerId);
    return offlineSummaryRow(playerId);
  }
  const bucketMs = 30 * 60_000;
  const processedUntil = now >= capUntil
    ? capUntil
    : Math.min(capUntil, firstOfflineAt + Math.floor(Math.max(0, now - firstOfflineAt) / bucketMs) * bucketMs);
  const slices = splitOfflineWindow(cursor, processedUntil, offlineStart);
  const board = operatingBoard(await loadCards(playerId));
  const stage = marketStageForEmpireLevel(empireLevel(board));
  const eventLayer = eventState(playerId, board, stage, row.createdAt, now);
  const day = utcDay(now);
  const dayData = districtDay(playerId, day);
  const marketEvent = marketEventForDay(day, playerId);
  const activeEvent = effectiveDistrictEvent(dayData.event, marketEvent, 0, eventLayer.modifiers);
  const moduleEffects = moduleEffectsForBoard(playerId, board, [eventLayer.global.id, ...eventLayer.personalEvents.map((event) => event.id)], eventLayer.cycle.state);
  const sessionId = row.offlineSessionId ?? newId();
  let state = {
    cashMinor: Number(row.cashMinor),
    earnedMinor: Number(row.earnedMinor),
    population: Number(row.population),
    capacity: Number(row.capacity),
    satisfactionBps: Number(row.satisfactionBps),
    riskBps: Number(row.riskBps),
    reputationBps: Number(row.reputationBps),
    conditionBps: Number(row.conditionBps),
    transactions: Number(row.transactions),
    volumeMinor: Number(row.volumeMinor),
  };
  let cashDeltaTotal = 0;
  let customerDeltaTotal = 0;
  let revenueCreditTotal = 0;
  let growthCreditTotal = 0;
  let riskBefore = state.riskBps;
  const bands = new Map<string, { band: string; durationMs: number; cashEfficiency: number; customerIntensity: number }>();
  const events = [...new Set([eventLayer.global.id, ...eventLayer.personalEvents.map((event) => event.id)])];
  const processBucket = sqlite.transaction(() => {
    sqlite.prepare(`INSERT OR IGNORE INTO plotgo_offline_sessions (offline_session_id, player_id, started_at, processed_from, processed_until, cap_until, presence_state, config_version, created_at, completed_at) VALUES (?, ?, ?, ?, ?, ?, 'offline', ?, ?, ?)`)
      .run(sessionId, playerId, lastAction, cursor, processedUntil, capUntil, OFFLINE_CONFIG.configVersion, now, now);
    const insertBucket = sqlite.prepare(`INSERT OR IGNORE INTO plotgo_offline_buckets (bucket_id, offline_session_id, player_id, start_at, end_at, band, presence_state, cash_efficiency, customer_intensity, cash_delta_minor, customer_delta, performance_revenue_credit_minor, performance_growth_credit, risk_before_bps, risk_after_bps, created_at) VALUES (?, ?, ?, ?, ?, ?, 'offline', ?, ?, ?, ?, ?, ?, ?, ?, ?)`);
    const ticksPerHour = 3_600_000 / 10_000;
    const grossPerHour = tickMinor(board) * ticksPerHour;
    const activityBps = moduleThroughputBps(board, moduleEffects, "activityEfficiencyBps");
    const operatingCostBps = Math.max(-12_000, Math.min(12_000, moduleThroughputBps(board, moduleEffects, "operatingCostReductionBps")));
    const eventMultiplier = Math.max(0, activeEvent.activityBps / 10_000) * Math.max(0, 1 + (activeEvent.revenueBps ?? 0) / 10_000);
    for (let index = 0; index < slices.length; index++) {
      const slice = slices[index]!;
      const bucketId = createHash("sha256").update(`${sessionId}:${slice.startAt}:${slice.endAt}`).digest("hex").slice(0, 32);
      if (sqlite.prepare("SELECT 1 FROM plotgo_offline_buckets WHERE bucket_id = ?").get(bucketId)) continue;
      const settled = settleDistrict(board, activeEvent, "walk", state, seedForDay(day, `${playerId}:${bucketId}`), moduleEffects, archetypeResolutionForPlayer(playerId, board).effects);
      const hours = slice.durationMs / 3_600_000;
      const signed = settled.cashDeltaMinor < 0 ? -1 : 1;
      const normalNetPerHour = Math.round(grossPerHour * eventMultiplier * (10_000 + activityBps) / 10_000 * (10_000 - operatingCostBps) / 10_000);
      const cashDelta = signed * Math.round(normalNetPerHour * hours * slice.cashEfficiency);
      const convergence = Math.min(1, hours / 4);
      const rawCustomerDelta = (settled.population - state.population) * convergence;
      const customerDelta = Math.round(rawCustomerDelta * slice.customerIntensity);
      const nextPopulation = Math.max(0, Math.min(settled.capacity, Math.round(state.population + customerDelta)));
      const riskAfter = Math.max(0, Math.min(9_500, Math.round(state.riskBps + (settled.riskBps - state.riskBps) * slice.riskIntensity)));
      const reputationAfter = Math.max(0, Math.min(10_000, Math.min(state.reputationBps, settled.reputationBps)));
      const conditionAfter = Math.max(0, Math.min(10_000, Math.round(state.conditionBps + (settled.conditionBps - state.conditionBps) * slice.customerIntensity)));
      const txDelta = Math.max(0, Math.round(settled.transactions * hours * slice.customerIntensity));
      const volumeDelta = Math.max(0, Math.round(settled.volumeMinor * hours * slice.cashEfficiency));
      const revenueCredit = Math.max(0, Math.round(cashDelta * slice.performanceRevenueCredit));
      const growthCredit = Math.max(0, customerDelta * slice.performanceGrowthCredit);
      insertBucket.run(bucketId, sessionId, playerId, slice.startAt, slice.endAt, slice.band, slice.cashEfficiency, slice.customerIntensity, cashDelta, customerDelta, revenueCredit, growthCredit, state.riskBps, riskAfter, now);
      state = { ...state, cashMinor: Math.max(0, state.cashMinor + cashDelta), earnedMinor: state.earnedMinor + Math.max(0, cashDelta), population: nextPopulation, capacity: settled.capacity, satisfactionBps: settled.satisfactionBps, riskBps: riskAfter, reputationBps: reputationAfter, conditionBps: conditionAfter, transactions: state.transactions + txDelta, volumeMinor: state.volumeMinor + volumeDelta };
      cashDeltaTotal += cashDelta;
      customerDeltaTotal += customerDelta;
      revenueCreditTotal += revenueCredit;
      growthCreditTotal += growthCredit;
      const existingBand = bands.get(slice.band) ?? { band: slice.band, durationMs: 0, cashEfficiency: slice.cashEfficiency, customerIntensity: slice.customerIntensity };
      existingBand.durationMs += slice.durationMs;
      bands.set(slice.band, existingBand);
    }
    const frozenMs = Math.max(0, now - capUntil);
    sqlite.prepare(`UPDATE players SET cash_minor = ?, earned_minor = ?, population = ?, capacity = ?, satisfaction_bps = ?, risk_bps = ?, reputation_bps = ?, condition_bps = ?, transactions = ?, volume_minor = ?, offline_started_at = ?, offline_processed_until = ?, last_settle_at = ?, presence_state = ?, offline_session_id = ? WHERE id = ?`).run(state.cashMinor, state.earnedMinor, state.population, state.capacity, state.satisfactionBps, state.riskBps, state.reputationBps, state.conditionBps, state.transactions, state.volumeMinor, offlineStart, processedUntil, processedUntil, now >= capUntil ? "frozen" : "offline", sessionId, playerId);
    const aggregate = sqlite.prepare(`
      SELECT COALESCE(SUM(cash_delta_minor), 0) AS cashDeltaMinor,
        COALESCE(SUM(customer_delta), 0) AS customerDelta,
        COALESCE(SUM(performance_revenue_credit_minor), 0) AS revenueCreditMinor,
        COALESCE(SUM(performance_growth_credit), 0) AS growthCredit,
        MIN(start_at) AS awayStartedAt, MAX(end_at) AS processedUntil
      FROM plotgo_offline_buckets WHERE offline_session_id = ?
    `).get(sessionId) as { cashDeltaMinor: number; customerDelta: number; revenueCreditMinor: number; growthCredit: number; awayStartedAt: number; processedUntil: number };
    const aggregateBands = sqlite.prepare(`
      SELECT band, SUM(end_at - start_at) AS durationMs, MAX(cash_efficiency) AS cashEfficiency,
        MAX(customer_intensity) AS customerIntensity
      FROM plotgo_offline_buckets WHERE offline_session_id = ? GROUP BY band ORDER BY MIN(start_at)
    `).all(sessionId) as { band: string; durationMs: number; cashEfficiency: number; customerIntensity: number }[];
    const summaryCashDelta = Number(aggregate.cashDeltaMinor ?? cashDeltaTotal);
    const summaryCustomerDelta = Number(aggregate.customerDelta ?? customerDeltaTotal);
    const summaryRevenueCredit = Number(aggregate.revenueCreditMinor ?? revenueCreditTotal);
    const summaryGrowthCredit = Number(aggregate.growthCredit ?? growthCreditTotal);
    const summaryBands = aggregateBands.length ? aggregateBands : [...bands.values()];
    sqlite.prepare("UPDATE plotgo_offline_sessions SET processed_until = ?, status = ?, summary_json = ?, completed_at = ? WHERE offline_session_id = ?").run(processedUntil, now >= capUntil ? "frozen" : "processed", JSON.stringify({ cashDeltaMinor: summaryCashDelta, customerDelta: summaryCustomerDelta, revenueCreditMinor: summaryRevenueCredit, growthCredit: summaryGrowthCredit, bands: summaryBands, events, riskBeforeBps: riskBefore, riskAfterBps: state.riskBps }), now, sessionId);
    const week = isoWeek(new Date(`${day}T00:00:00Z`));
    sqlite.prepare(`INSERT INTO weekly_performance (player_id, week, stage, active_days, revenue_minor, new_retained_customers) VALUES (?, ?, ?, 0, ?, ?) ON CONFLICT(player_id, week) DO UPDATE SET stage = excluded.stage, revenue_minor = weekly_performance.revenue_minor + excluded.revenue_minor, new_retained_customers = weekly_performance.new_retained_customers + excluded.new_retained_customers`).run(playerId, week, stage, revenueCreditTotal, growthCreditTotal);
    const summaryId = sqlite.prepare("SELECT summary_id AS summaryId FROM plotgo_offline_summaries WHERE offline_session_id = ?").get(sessionId) as { summaryId: string } | undefined;
    const id = summaryId?.summaryId ?? newId();
    sqlite.prepare(`INSERT INTO plotgo_offline_summaries (summary_id, offline_session_id, player_id, away_started_at, returned_at, processed_until, frozen_ms, cash_delta_minor, customer_delta, revenue_credit_minor, growth_credit, bands_json, events_json, risk_json, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT(offline_session_id) DO UPDATE SET returned_at = excluded.returned_at, processed_until = excluded.processed_until, frozen_ms = excluded.frozen_ms, cash_delta_minor = excluded.cash_delta_minor, customer_delta = excluded.customer_delta, revenue_credit_minor = excluded.revenue_credit_minor, growth_credit = excluded.growth_credit, bands_json = excluded.bands_json, events_json = excluded.events_json, risk_json = excluded.risk_json`).run(id, sessionId, playerId, Number(aggregate.awayStartedAt ?? lastAction), now, Number(aggregate.processedUntil ?? processedUntil), frozenMs, summaryCashDelta, summaryCustomerDelta, summaryRevenueCredit, summaryGrowthCredit, JSON.stringify(summaryBands), JSON.stringify(events), JSON.stringify({ beforeBps: riskBefore, afterBps: state.riskBps }), now);
  });
  processBucket();
  return offlineSummaryRow(playerId);
}

function stockClaimGate(p: { createdAt: number; activeDays: string[] }) {
  // The workbook allows these gates to be waived in private beta; production enables them with =1.
  if (process.env.PLOTGO_STOCK_CLAIM_GATES !== "1") return { eligible: true, reason: null };
  const ageHours = (Date.now() - p.createdAt) / 3_600_000;
  if (ageHours < 24) return { eligible: false, reason: `Stock claims unlock after 24 hours (${Math.ceil(24 - ageHours)}h remaining).` };
  if (p.activeDays.length < 2) return { eligible: false, reason: "Stock claims unlock after 2 active days." };
  return { eligible: true, reason: null };
}

type WeeklyPerformanceRow = {
  player_id: string;
  week: string;
  stage: MarketStage;
  active_days: number;
  activity_minor: number;
  revenue_minor: number;
  active_customers_total: number;
  customer_samples: number;
  new_retained_customers: number;
  utilization_bps_total: number;
  reputation_bps_total: number;
  risk_bps_total: number;
  event_points: number;
  sessions: number;
  hunts_completed: number;
  finalized: number;
  score: number;
  eligible: number;
  payout_plot: number;
  claimed_at: number | null;
  finalized_at: number | null;
};

function activeDaysInWeek(days: string[], week: string): number {
  return days.filter((day) => isoWeek(new Date(`${day}T00:00:00Z`)) === week).length;
}

function weeklyPerformanceRow(playerId: string, week: string): WeeklyPerformanceRow | undefined {
  return sqlite.prepare("SELECT * FROM weekly_performance WHERE player_id = ? AND week = ?").get(playerId, week) as WeeklyPerformanceRow | undefined;
}

function performanceMetrics(
  player: { createdAt: number; activeDays: string[] },
  row: WeeklyPerformanceRow | undefined,
  week: string,
  stage: MarketStage,
  finalized: boolean,
): PerformanceMetrics {
  const samples = Number(row?.customer_samples ?? 0);
  return {
    stage,
    activityMinor: Number(row?.activity_minor ?? 0),
    revenueMinor: Number(row?.revenue_minor ?? 0),
    averageActiveCustomers: samples ? Number(row?.active_customers_total ?? 0) / samples : 0,
    newRetainedCustomers: Number(row?.new_retained_customers ?? 0),
    averageUtilization: samples ? Number(row?.utilization_bps_total ?? 0) / samples / 10_000 : 0,
    reputation: samples ? Number(row?.reputation_bps_total ?? 0) / samples / 100 : 0,
    riskIndex: samples ? Number(row?.risk_bps_total ?? 0) / samples / 100 : 100,
    completedHunts: Number(row?.hunts_completed ?? 0),
    eventMissionPoints: Math.min(5, Number(row?.event_points ?? 0)),
    activeDays: Number(row?.active_days ?? activeDaysInWeek(player.activeDays, week)),
    plotAgeHours: (Date.now() - player.createdAt) / 3_600_000,
    finalized,
  };
}

function performanceSnapshot(
  player: { createdAt: number; activeDays: string[] },
  row: WeeklyPerformanceRow | undefined,
  week: string,
  stage: MarketStage,
) {
  const finalized = row?.finalized === 1;
  const metrics = performanceMetrics(player, row, week, stage, finalized);
  const score = calculatePerformanceScore(metrics);
  return {
    week,
    stage,
    targetMode: DEFAULT_PERFORMANCE_TARGET_MODE,
    score: score.weightedScore,
    eligible: score.eligible,
    eligibilityReasons: score.eligibilityReasons,
    components: score.components,
    activeDays: metrics.activeDays,
    completedHunts: metrics.completedHunts,
    activityMinor: metrics.activityMinor,
    revenueMinor: metrics.revenueMinor,
    averageActiveCustomers: Number(metrics.averageActiveCustomers.toFixed(2)),
    averageUtilization: Number(metrics.averageUtilization.toFixed(4)),
    finalized,
    payoutPlot: Number(row?.payout_plot ?? 0),
    eventMissionPoints: metrics.eventMissionPoints ?? 0,
    claimed: row?.claimed_at != null,
  };
}

function upsertWeeklySessionPerformance(
  playerId: string,
  week: string,
  stage: MarketStage,
  activeDays: number,
  previousPopulation: number,
  result: { volumeMinor: number; earnedDeltaMinor: number; population: number; capacity: number; reputationBps: number; riskBps: number; revenue: { amountMinor: number }[] },
) {
  const utilizationBps = result.capacity > 0 ? result.population / result.capacity * 10_000 : 0;
  const revenueMinor = result.revenue.reduce((sum, line) => sum + Math.max(0, line.amountMinor), 0);
  sqlite.prepare(`
    INSERT INTO weekly_performance
      (player_id, week, stage, active_days, activity_minor, revenue_minor, active_customers_total, customer_samples, new_retained_customers, utilization_bps_total, reputation_bps_total, risk_bps_total, event_points, sessions)
    VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?, ?, ?, ?, 0, 1)
    ON CONFLICT(player_id, week) DO UPDATE SET
      stage = excluded.stage,
      active_days = excluded.active_days,
      activity_minor = weekly_performance.activity_minor + excluded.activity_minor,
      revenue_minor = weekly_performance.revenue_minor + excluded.revenue_minor,
      active_customers_total = weekly_performance.active_customers_total + excluded.active_customers_total,
      customer_samples = weekly_performance.customer_samples + 1,
      new_retained_customers = weekly_performance.new_retained_customers + excluded.new_retained_customers,
      utilization_bps_total = weekly_performance.utilization_bps_total + excluded.utilization_bps_total,
      reputation_bps_total = weekly_performance.reputation_bps_total + excluded.reputation_bps_total,
      risk_bps_total = weekly_performance.risk_bps_total + excluded.risk_bps_total,
      sessions = weekly_performance.sessions + 1
  `).run(
    playerId, week, stage, activeDays, Math.max(0, result.volumeMinor), revenueMinor,
    Math.max(0, result.population), Math.max(0, result.population - previousPopulation), utilizationBps,
    result.reputationBps, result.riskBps,
  );
}

function addWeeklyHuntPerformance(playerId: string, week: string, stage: MarketStage, activeDays: number) {
  sqlite.prepare(`
    INSERT INTO weekly_performance (player_id, week, stage, active_days, hunts_completed)
    VALUES (?, ?, ?, ?, 1)
    ON CONFLICT(player_id, week) DO UPDATE SET
      stage = excluded.stage,
      active_days = excluded.active_days,
      hunts_completed = weekly_performance.hunts_completed + 1
  `).run(playerId, week, stage, activeDays);
}

function weekStartMs(week: string): number {
  const [yearText, weekText] = week.split("-W");
  const year = Number(yearText);
  const weekNumber = Number(weekText);
  const jan4 = new Date(Date.UTC(year, 0, 4));
  const monday = new Date(jan4.getTime() - ((jan4.getUTCDay() || 7) - 1) * 86_400_000);
  return monday.getTime() + (weekNumber - 1) * 7 * 86_400_000;
}

function eventRewardBudgetUsed(playerId: string, week: string): number {
  const rows = sqlite.prepare("SELECT payload_json AS payloadJson FROM plotgo_event_audit WHERE player_id = ? AND audit_type = 'reward' AND created_at >= ?").all(playerId, weekStartMs(week)) as { payloadJson: string }[];
  return rows.reduce((sum, row) => { try { return sum + Number(JSON.parse(row.payloadJson).amountMinor ?? 0); } catch { return sum; } }, 0);
}

function addEventPerformance(playerId: string, week: string, stage: MarketStage, points: number) {
  const capped = Math.min(5, Math.max(0, points));
  sqlite.prepare(`
    INSERT INTO weekly_performance (player_id, week, stage, active_days, event_points)
    VALUES (?, ?, ?, 0, ?)
    ON CONFLICT(player_id, week) DO UPDATE SET
      stage = excluded.stage,
      event_points = MIN(5, weekly_performance.event_points + excluded.event_points)
  `).run(playerId, week, stage, capped);
}

function eventMissionProgress(mission: EventMission, metrics: { population: number; capacity: number; transactions: number; volumeMinor: number; riskBps: number; satisfactionBps: number; segments: { institutional: number }; }, player: { cashMinor: number }): { current: number; target: number; done: boolean } {
  const metric = mission.metric.toLowerCase();
  let current = 0;
  let done = false;
  if (metric.includes("retention")) { current = metrics.satisfactionBps / 10_000; done = current >= mission.baseTarget; }
  else if (metric.includes("risk below")) { current = metrics.riskBps / 10_000; done = current <= mission.baseTarget; }
  else if (metric.includes("reserve ratio")) { current = Math.min(1, player.cashMinor / Math.max(1, player.cashMinor + metrics.volumeMinor)); done = current >= mission.baseTarget; }
  else if (metric.includes("capacity")) { current = metrics.capacity ? metrics.population / metrics.capacity : 0; done = current >= mission.baseTarget; }
  else if (metric.includes("institutional")) { current = metrics.segments.institutional; done = current >= mission.baseTarget; }
  else if (metric.includes("transaction")) { current = metrics.transactions; done = current >= mission.baseTarget; }
  else if (metric.includes("volume") || metric.includes("aum") || metric.includes("activity") || metric.includes("customers") || metric.includes("clients")) { current = metric.includes("customer") || metric.includes("client") ? metrics.population : metrics.volumeMinor; done = current >= mission.baseTarget; }
  else if (metric.includes("health")) { current = Math.max(0, (metrics.satisfactionBps / 10_000) * (1 - metrics.riskBps / 10_000)); done = current >= mission.baseTarget; }
  else { current = metrics.population; done = current >= mission.baseTarget; }
  return { current, target: mission.baseTarget, done };
}

function missionView(playerId: string, missionRow: EventMissionRow | null, metrics: { population: number; capacity: number; transactions: number; volumeMinor: number; riskBps: number; satisfactionBps: number; segments: { institutional: number }; }, player: { cashMinor: number }) {
  if (!missionRow) return null;
  const template = EVENT_MISSIONS.find((candidate) => candidate.id === missionRow.templateId) ?? EVENT_MISSIONS[0]!;
  const progress = eventMissionProgress({ ...template, baseTarget: missionRow.target }, metrics, player);
  return { ...missionRow, template, progress, ready: missionRow.status === "active" && progress.done };
}

function finalizePerformanceWeek(week: string) {
  const rows = sqlite.prepare(`
    SELECT w.*, p.created_at AS createdAt, p.active_days AS playerActiveDays
    FROM weekly_performance w JOIN players p ON p.id = w.player_id
    WHERE w.week = ?
  `).all(week) as (WeeklyPerformanceRow & { createdAt: number; playerActiveDays: string })[];
  const entries: { id: string; stage: MarketStage; score: number }[] = [];
  for (const row of rows) {
    const player = { createdAt: Number(row.createdAt), activeDays: JSON.parse(row.playerActiveDays || "[]") as string[] };
    const score = calculatePerformanceScore(performanceMetrics(player, row, week, row.stage, true));
    sqlite.prepare("UPDATE weekly_performance SET finalized = 1, score = ?, eligible = ?, finalized_at = COALESCE(finalized_at, ?) WHERE player_id = ? AND week = ?")
      .run(score.weightedScore, score.eligible ? 1 : 0, Date.now(), row.player_id, week);
    if (score.eligible) entries.push({ id: row.player_id, stage: row.stage, score: score.weightedScore });
  }
  const payouts = allocateWeeklyPayouts(entries);
  for (const row of rows) {
    sqlite.prepare("UPDATE weekly_performance SET payout_plot = ? WHERE player_id = ? AND week = ?").run(payouts.get(row.player_id) ?? 0, row.player_id, week);
  }
  return { week, players: rows.length, eligible: entries.length, totalPayout: [...payouts.values()].reduce((sum, value) => sum + value, 0) };
}

type MarketHuntSlot = {
  id: string;
  playerId: string;
  issuedDay: string;
  week: string;
  templateId: string;
  difficulty: HuntDifficulty;
  rewardRarity: RewardRarity;
  stockTicker: string | null;
  rewardValueMinor: number;
  moduleReward: ModuleReward | null;
  points: number;
  target: number;
  issuedAt: number;
  expiresAt: number;
  status: "active" | "claimed" | "expired" | "cash_fallback";
  claimedAt: number | null;
  reservedMinor: number;
};

function marketHuntRow(row: Record<string, unknown>): MarketHuntSlot {
  const moduleRewardKind = row.module_reward_kind === "module" || row.module_reward_kind === "parts" ? row.module_reward_kind as ModuleReward["kind"] : null;
  const moduleReward = moduleRewardKind && row.module_reward_rarity
    ? {
        kind: moduleRewardKind,
        rarity: String(row.module_reward_rarity) as ModuleReward["rarity"],
        quantity: Number(row.module_reward_quantity ?? 1),
        partsAmount: Number(row.module_reward_parts ?? 0),
        compatibleFamily: null,
        moduleId: row.module_reward_module_id == null ? null : String(row.module_reward_module_id),
        moduleName: row.module_reward_module_id == null ? null : moduleEntry(String(row.module_reward_module_id))?.name ?? null,
      }
    : null;
  return {
    id: String(row.id),
    playerId: String(row.player_id),
    issuedDay: String(row.issued_day),
    week: String(row.week),
    templateId: String(row.template_id),
    difficulty: row.difficulty as HuntDifficulty,
    rewardRarity: row.reward_rarity as RewardRarity,
    stockTicker: row.stock_ticker ? String(row.stock_ticker) : null,
    rewardValueMinor: Number(row.reward_value_minor),
    moduleReward,
    points: Number(row.points),
    target: Number(row.target) || 0,
    issuedAt: Number(row.issued_at),
    expiresAt: Number(row.expires_at),
    status: row.status as MarketHuntSlot["status"],
    claimedAt: row.claimed_at == null ? null : Number(row.claimed_at),
    reservedMinor: Number(row.reserved_minor),
  };
}

function loadMarketHunts(playerId: string, day: string): MarketHuntSlot[] {
  const rows = sqlite.prepare("SELECT * FROM market_hunt_slots WHERE player_id = ? AND issued_day = ? ORDER BY issued_at ASC").all(playerId, day) as Record<string, unknown>[];
  return rows.map(marketHuntRow);
}

function seedMix(seed: number, index: number): number {
  let value = (seed ^ Math.imul(index + 1, 0x9e3779b9)) >>> 0;
  value ^= value >>> 16;
  value = Math.imul(value, 0x85ebca6b) >>> 0;
  value ^= value >>> 13;
  return value >>> 0;
}

function chooseDifficulty(stage: MarketStage, seed: number): HuntDifficulty {
  const rule = STAGE_RULES[stage];
  const entries = Object.entries(rule.difficultyMix) as [HuntDifficulty, number][];
  const total = entries.reduce((sum, [, weight]) => sum + weight, 0);
  let cursor = ((seed % 1_000_000) / 1_000_000) * total;
  for (const [difficulty, weight] of entries) {
    cursor -= weight;
    if (cursor <= 0) return difficulty;
  }
  return "easy";
}

function canUseStock(stock: (typeof MARKET_STOCKS)[number], stage: MarketStage): boolean {
  return marketStageIndex(stock.unlockStage) <= marketStageIndex(stage);
}

function chooseStock(affinity: string, eventBias: string, stage: MarketStage, seed: number) {
  const affinityParts = affinity.split(",").map((part) => part.trim()).filter(Boolean);
  const eventParts = eventBias.split(",").map((part) => part.trim()).filter(Boolean);
  const unlocked = MARKET_STOCKS.filter((stock) => canUseStock(stock, stage));
  const candidates = affinity === "Broad"
    ? unlocked
    : unlocked.filter((stock) => affinityParts.includes(stock.ticker) || stock.affinityTags.some((tag) => affinityParts.includes(tag)));
  const pool = candidates.length ? candidates : unlocked;
  const weightOf = (stock: (typeof MARKET_STOCKS)[number]) => stock.selectionWeight + (eventBias === "Broad" ? 0 : (eventParts.includes(stock.ticker) || stock.affinityTags.some((tag) => eventParts.includes(tag)) ? stock.selectionWeight : 0));
  const total = pool.reduce((sum, stock) => sum + weightOf(stock), 0);
  let cursor = (seed % Math.max(1, total));
  for (const stock of pool) {
    cursor -= weightOf(stock);
    if (cursor < 0) return stock;
  }
  return pool[pool.length - 1] ?? MARKET_STOCKS[0]!;
}

function huntAchievable(hunt: MarketHuntTemplate, board: PlacedCard[]): boolean {
  const requirement = hunt.requiredBusiness.toLowerCase();
  if (requirement === "any" || requirement.includes("any customer-facing")) return true;
  if (requirement.includes("any 3 businesses")) return board.length >= 3;
  if (requirement.includes("3+ business categories")) return new Set(board.map((card) => CARDS[resolveType(card.type)]?.lineage)).size >= 3;
  if (requirement.includes("5+ business categories")) return new Set(board.map((card) => CARDS[resolveType(card.type)]?.lineage)).size >= 5;
  if (requirement.includes("synergy pair")) return board.length >= 2;
  const haystack = board.map((card) => {
    const spec = CARDS[resolveType(card.type)];
    return `${spec?.name ?? ""} ${spec?.lineage ?? ""}`.toLowerCase();
  });
  const tokens = requirement.split(/\s+\/\s+|\s+\+\s+|\s+or\s+|\s+/).filter((token) => token.length > 2 && !["any", "elite", "institution", "institutional"].includes(token));
  return tokens.some((token) => haystack.some((item) => item.includes(token)));
}

function realisticTarget(hunt: MarketHuntTemplate, target: number, board: PlacedCard[]): number {
  const metric = hunt.metric.toLowerCase();
  if (!metric.includes("customer") && !metric.includes("trader") && !metric.includes("investor")) return target;
  const capacity = board.reduce((sum, card) => sum + cardCustomers(card), 0);
  if (capacity <= 0) return target;
  return Math.min(target, Math.max(1, Math.floor(capacity * 2.5)));
}

function ensureMarketPool(week: string) {
  const statement = sqlite.prepare(
    "INSERT OR IGNORE INTO market_reward_pool (week, ticker, allocated_minor, reserved_minor, claimed_minor) VALUES (?, ?, ?, 0, 0)",
  );
  for (const stock of MARKET_STOCKS) {
    statement.run(week, stock.ticker, Math.round(500_000 * stock.allocationBps / 10_000));
  }
}

function reserveMarketReward(week: string, ticker: string, amountMinor: number): boolean {
  const row = sqlite.prepare("SELECT allocated_minor FROM market_reward_pool WHERE week = ? AND ticker = ?").get(week, ticker) as
    | { allocated_minor: number }
    | undefined;
  if (!row) return false;
  const now = new Date();
  const utcDay = now.getUTCDay() || 7;
  const monday = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - utcDay + 1);
  const weekEnd = monday + 7 * 86_400_000;
  const reserveCeiling = now.getTime() >= weekEnd - 24 * 3_600_000 ? row.allocated_minor : Math.floor(row.allocated_minor * 0.95);
  const result = sqlite.prepare(`
    UPDATE market_reward_pool
    SET reserved_minor = reserved_minor + ?
    WHERE week = ? AND ticker = ?
      AND reserved_minor + claimed_minor + ? <= ?
  `).run(amountMinor, week, ticker, amountMinor, reserveCeiling);
  return result.changes === 1;
}

function poolConsumption(week: string): number {
  const row = sqlite.prepare("SELECT COALESCE(SUM(reserved_minor + claimed_minor), 0) AS consumed FROM market_reward_pool WHERE week = ?").get(week) as { consumed: number };
  return Math.min(1, Number(row.consumed) / 500_000);
}

function throttledRarity(week: string, difficulty: HuntDifficulty, seed: number, eventShift: string, qualityBps: number, preferredRarity: RewardRarity): RewardRarity {
  const consumption = poolConsumption(week);
  const multipliers = consumption >= 0.95
    ? { common: 0, uncommon: 0, rare: 0, epic: 0, legendary: 0 }
    : consumption >= 0.9
      ? { common: 1.3, uncommon: 0.9, rare: 0.6, epic: 0.35, legendary: 0.1 }
      : consumption >= 0.8
        ? { common: 1.15, uncommon: 1, rare: 0.85, epic: 0.65, legendary: 0.4 }
        : { common: 1, uncommon: 1, rare: 1, epic: 1, legendary: 1 };
  const rule = DIFFICULTY_RULES[difficulty];
  const rarities = Object.keys(rule.rarityOdds) as RewardRarity[];
  const weights = rarities.map((rarity) => rule.rarityOdds[rarity] * multipliers[rarity]);
  const shift = eventShift.match(/(Common|Uncommon|Rare|Epic|Legendary) \+(\d+)%/i);
  if (shift) {
    const rarity = shift[1]!.toLowerCase() as RewardRarity;
    const bump = Number(shift[2]) / 100;
    const index = rarities.indexOf(rarity);
    const commonIndex = rarities.indexOf("common");
    if (index >= 0) {
      weights[index] = (weights[index] ?? 0) + bump;
      weights[commonIndex] = Math.max(0, (weights[commonIndex] ?? 0) - bump);
    }
  } else if (eventShift.includes("+1 tier")) {
    for (let i = rarities.length - 1; i > 0; i--) {
      const moved = (weights[i - 1] ?? 0) * 0.15;
      weights[i] = (weights[i] ?? 0) + moved;
      weights[i - 1] = Math.max(0, (weights[i - 1] ?? 0) - moved);
    }
  }
  if (qualityBps > 0) {
    const rareIndex = rarities.indexOf("rare");
    const commonIndex = rarities.indexOf("common");
    const bump = qualityBps / 10_000;
    weights[rareIndex] = (weights[rareIndex] ?? 0) + bump;
    weights[commonIndex] = Math.max(0, (weights[commonIndex] ?? 0) - bump);
  }
  const preferredIndex = rarities.indexOf(preferredRarity);
  if (preferredIndex >= 0 && preferredRarity !== "common") {
    const bias = 0.05;
    weights[preferredIndex] = (weights[preferredIndex] ?? 0) + bias;
    weights[rarities.indexOf("common")] = Math.max(0, (weights[rarities.indexOf("common")] ?? 0) - bias);
  }
  if (weights.every((weight) => weight <= 0)) return "common";
  const total = weights.reduce((sum, weight) => sum + weight, 0);
  let cursor = (seed % 1_000_000) / 1_000_000 * total;
  for (let i = 0; i < rarities.length; i++) {
    cursor -= weights[i]!;
    if (cursor <= 0) return rarities[i]!;
  }
  return rarities[rarities.length - 1]!;
}

function releaseMarketReservation(slot: MarketHuntSlot) {
  if (slot.stockTicker && slot.reservedMinor > 0) {
    sqlite.prepare("UPDATE market_reward_pool SET reserved_minor = MAX(0, reserved_minor - ?) WHERE week = ? AND ticker = ?").run(slot.reservedMinor, slot.week, slot.stockTicker);
  }
}

function claimMarketReservation(slot: MarketHuntSlot) {
  if (slot.stockTicker && slot.reservedMinor > 0) {
    sqlite.prepare("UPDATE market_reward_pool SET reserved_minor = MAX(0, reserved_minor - ?), claimed_minor = claimed_minor + ? WHERE week = ? AND ticker = ?").run(slot.reservedMinor, slot.reservedMinor, slot.week, slot.stockTicker);
  }
}

type PersistedCycle = { state: MarketCycleState; startedAt: number; endsAt: number; seed: number; cycleVersion: number };
type PlayerEventRow = { id: string; playerId: string; catalogId: string; scope: EventScope; status: string; issuedAt: number; startsAt: number; endsAt: number; choiceId: string | null; resolutionJson: string | null; resolvedAt: number | null; rewardClaimed: number };
type EventMissionRow = { id: string; playerId: string; eventId: string; templateId: string; target: number; issuedAt: number; expiresAt: number; status: string; claimedAt: number | null; rewardClaimed: number };

function stableEventSeed(value: string): number {
  let seed = 2_166_136_261;
  for (const char of value) {
    seed ^= char.charCodeAt(0);
    seed = Math.imul(seed, 16_777_619);
  }
  return seed >>> 0;
}

function cycleFromRow(row: Record<string, unknown>): PersistedCycle {
  return { state: row.state as MarketCycleState, startedAt: Number(row.started_at), endsAt: Number(row.ends_at), seed: Number(row.seed), cycleVersion: Number(row.cycle_version) };
}

function weightedCycleNext(state: MarketCycleState, seed: number): MarketCycleState {
  const entries = Object.entries(MARKET_CYCLE_TRANSITIONS[state]) as [MarketCycleState, number][];
  let cursor = (seed % 1_000_000) / 1_000_000;
  for (const [next, weight] of entries) {
    cursor -= weight;
    if (cursor <= 0) return next;
  }
  return entries[entries.length - 1]![0];
}

function ensureMarketCycle(now = Date.now()): PersistedCycle {
  let row = sqlite.prepare("SELECT * FROM plotgo_market_cycle WHERE id = 1").get() as Record<string, unknown> | undefined;
  if (!row) {
    const seed = stableEventSeed(`cycle:${Math.floor(now / 604_800_000)}`);
    const startedAt = now;
    const endsAt = now + 72 * 3_600_000;
    sqlite.prepare("INSERT INTO plotgo_market_cycle (id, state, started_at, ends_at, seed, cycle_version, updated_at) VALUES (1, ?, ?, ?, ?, 1, ?)").run("Neutral", startedAt, endsAt, seed, now);
    row = sqlite.prepare("SELECT * FROM plotgo_market_cycle WHERE id = 1").get() as Record<string, unknown>;
  }
  let cycle = cycleFromRow(row);
  while (now >= cycle.endsAt) {
    const nextSeed = stableEventSeed(`${cycle.seed}:${cycle.cycleVersion}:${cycle.endsAt}`);
    let nextState = weightedCycleNext(cycle.state, nextSeed);
    if (nextState === "Crisis") {
      const recentCrisis = (sqlite.prepare("SELECT payload_json AS payloadJson FROM plotgo_event_audit WHERE audit_type = 'cycle_transition' AND created_at > ? ORDER BY created_at DESC LIMIT 1").get(now - EVENT_REWARD_RULES.crisisCooldownHours * 3_600_000) as { payloadJson: string } | undefined);
      if (recentCrisis?.payloadJson.includes('"state":"Crisis"')) nextState = "Recovery";
    }
    const rule = MARKET_CYCLE_RULES.find((candidate) => candidate.state === nextState)!;
    const span = rule.typicalDurationHours[1] - rule.typicalDurationHours[0];
    const durationHours = rule.typicalDurationHours[0] + (nextSeed % Math.max(1, span + 1));
    const startedAt = cycle.endsAt;
    const endsAt = startedAt + durationHours * 3_600_000;
    sqlite.prepare("UPDATE plotgo_market_cycle SET state = ?, started_at = ?, ends_at = ?, seed = ?, cycle_version = ?, updated_at = ? WHERE id = 1").run(nextState, startedAt, endsAt, nextSeed, cycle.cycleVersion + 1, now);
    auditEvent(null, null, "cycle_transition", { from: cycle.state, state: nextState, cycleVersion: cycle.cycleVersion + 1, startedAt, endsAt });
    cycle = { state: nextState, startedAt, endsAt, seed: nextSeed, cycleVersion: cycle.cycleVersion + 1 };
  }
  return cycle;
}

function cycleGlobalEvent(cycle: PersistedCycle, stage: MarketStage, day: string): CatalogEvent {
  const candidates = EVENT_CATALOG.filter((event) => event.scope === "Global" && eventEligible(event, stage));
  const cycleRule = MARKET_CYCLE_RULES.find((rule) => rule.state === cycle.state)!;
  const weighted = candidates.map((event) => event.baseSpawnWeight * (event.category === "Risk/Crisis" && cycle.state === "Crisis" ? 2 : 1) * (event.stockBias === cycleRule.stockBias ? 1.25 : 1));
  const total = weighted.reduce((sum, value) => sum + value, 0);
  let cursor = (stableEventSeed(`${day}:${cycle.state}:${cycle.seed}`) % 1_000_000) / 1_000_000 * total;
  for (let i = 0; i < candidates.length; i++) { cursor -= weighted[i]!; if (cursor <= 0) return candidates[i]!; }
  return candidates[0] ?? EVENT_CATALOG[0]!;
}

function eventRow(row: Record<string, unknown>): PlayerEventRow {
  return { id: String(row.id), playerId: String(row.player_id), catalogId: String(row.catalog_id), scope: row.scope as EventScope, status: String(row.status), issuedAt: Number(row.issued_at), startsAt: Number(row.starts_at), endsAt: Number(row.ends_at), choiceId: row.choice_id == null ? null : String(row.choice_id), resolutionJson: row.resolution_json == null ? null : String(row.resolution_json), resolvedAt: row.resolved_at == null ? null : Number(row.resolved_at), rewardClaimed: Number(row.reward_claimed ?? 0) };
}

function activePlayerEvents(playerId: string, now = Date.now()): PlayerEventRow[] {
  const presence = sqlite.prepare("SELECT presence_state AS presenceState, personal_event_protection_until AS protectionUntil FROM players WHERE id = ?").get(playerId) as { presenceState: string; protectionUntil: number } | undefined;
  const expired = sqlite.prepare("SELECT * FROM plotgo_player_events WHERE player_id = ? AND status = 'active' AND ends_at <= ? AND choice_id IS NULL").all(playerId, now) as Record<string, unknown>[];
  for (const expiredRow of expired) {
    if (String(expiredRow.scope) === "Personal" && (presence?.presenceState !== "engaged" || Number(presence.protectionUntil ?? 0) > now)) {
      sqlite.prepare("UPDATE plotgo_player_events SET ends_at = ? WHERE id = ? AND choice_id IS NULL").run(now + 60 * 60_000, expiredRow.id);
      continue;
    }
    const event = EVENT_CATALOG.find((candidate) => candidate.id === String(expiredRow.catalog_id));
    const fallback = event ? EVENT_DECISIONS.filter((decision) => decision.eventId === event.id).sort((a, b) => Math.abs(a.modifier.riskBps) - Math.abs(b.modifier.riskBps) || a.immediateCostMinor - b.immediateCostMinor)[0] : undefined;
    if (!fallback) continue;
    const player = sqlite.prepare("SELECT cash_minor AS cashMinor, reputation_bps AS reputationBps, active_days AS activeDays FROM players WHERE id = ?").get(playerId) as { cashMinor: number; reputationBps: number; activeDays: string } | undefined;
    if (!player) continue;
    const cost = Math.min(player.cashMinor, fallback.immediateCostMinor);
    const nextCash = player.cashMinor - cost + Math.min(fallback.cashRewardMinor, EVENT_REWARD_RULES.weeklyCashCapMinor);
    const nextRep = Math.max(0, Math.min(10_000, player.reputationBps + fallback.modifier.reputationDelta * 100));
    sqlite.prepare("UPDATE players SET cash_minor = ?, earned_minor = earned_minor + ?, reputation_bps = ? WHERE id = ?").run(nextCash, Math.min(fallback.cashRewardMinor, EVENT_REWARD_RULES.weeklyCashCapMinor), nextRep, playerId);
    const resolution = { eventId: event?.id, decisionId: fallback.id, timeout: true, costMinor: cost, resolvedAt: now };
    sqlite.prepare("UPDATE plotgo_player_events SET status = 'expired', choice_id = ?, resolution_json = ?, resolved_at = ? WHERE id = ? AND choice_id IS NULL").run(fallback.id, JSON.stringify(resolution), now, expiredRow.id);
    auditEvent(playerId, String(expiredRow.id), "timeout", resolution);
    addEventPerformance(playerId, isoWeek(), marketStageForEmpireLevel(1), fallback.eventPoints);
  }
  sqlite.prepare("UPDATE plotgo_player_events SET status = 'expired' WHERE player_id = ? AND status = 'active' AND ends_at <= ?").run(playerId, now);
  const rows = sqlite.prepare("SELECT * FROM plotgo_player_events WHERE player_id = ? AND status = 'active' AND starts_at <= ? AND ends_at > ? ORDER BY issued_at ASC").all(playerId, now, now) as Record<string, unknown>[];
  return rows.map(eventRow);
}

function eventFamilyModifier(event: CatalogEvent, board: PlacedCard[]): EventModifier {
  if (!board.length) return catalogModifier(event);
  const modifiers = board.map((card) => catalogModifier(event, buildingFamily(card.type)));
  const keys = ["demandBps", "activityBps", "revenueBps", "riskBps", "huntSpawnBps", "reputationDelta"] as const;
  return Object.fromEntries(keys.map((key) => [key, Math.round(modifiers.reduce((sum, modifier) => sum + modifier[key], 0) / modifiers.length)])) as EventModifier;
}

function eventCooldownBlocked(playerId: string, event: CatalogEvent, stage: MarketStage, now: number): boolean {
  const cooldown = EVENT_REWARD_RULES.sameEventCooldownHours[stage] * 3_600_000;
  const recent = sqlite.prepare("SELECT issued_at FROM plotgo_player_events WHERE player_id = ? AND catalog_id = ? AND issued_at > ? ORDER BY issued_at DESC LIMIT 1").get(playerId, event.id, now - cooldown) as { issued_at: number } | undefined;
  return Boolean(recent);
}

function issuePersonalEvent(playerId: string, board: PlacedCard[], stage: MarketStage, createdAt: number, now: number): PlayerEventRow | null {
  const active = activePlayerEvents(playerId, now).filter((event) => event.scope === "Personal");
  const presence = sqlite.prepare("SELECT presence_state AS presenceState, personal_event_protection_until AS protectionUntil FROM players WHERE id = ?").get(playerId) as { presenceState: string; protectionUntil: number } | undefined;
  if (Number(presence?.protectionUntil ?? 0) > now) return active[0] ?? null;
  if (presence?.presenceState && presence.presenceState !== "engaged") return active[0] ?? null;
  if (active.length >= 2 || now - createdAt < 1) return active[0] ?? null;
  const last = sqlite.prepare("SELECT issued_at FROM plotgo_player_events WHERE player_id = ? ORDER BY issued_at DESC LIMIT 1").get(playerId) as { issued_at: number } | undefined;
  if (last && now - last.issued_at < 8 * 3_600_000) return active[0] ?? null;
  const ageHours = (now - createdAt) / 3_600_000;
  const recentNegative = (sqlite.prepare("SELECT catalog_id AS catalogId FROM plotgo_player_events WHERE player_id = ? AND issued_at > ?").all(playerId, now - EVENT_REWARD_RULES.negativePityWindowHours * 3_600_000) as { catalogId: string }[])
    .map((row) => EVENT_CATALOG.find((event) => event.id === row.catalogId))
    .filter((event) => event?.tone === "Negative").length;
  const candidates = EVENT_CATALOG.filter((event) => event.scope === "Personal" && eventEligible(event, stage) && !eventCooldownBlocked(playerId, event, stage, now) && !(ageHours < 72 && event.tone === "Negative") && !(recentNegative >= 2 && event.tone === "Negative"));
  if (!candidates.length) return active[0] ?? null;
  const seed = stableEventSeed(`${playerId}:${utcDay()}:${active.length}`);
  const event = candidates[seed % candidates.length]!;
  const id = newId();
  const startsAt = now;
  const endsAt = now + event.durationHours * 3_600_000;
  sqlite.prepare("INSERT INTO plotgo_player_events (id, player_id, catalog_id, scope, status, issued_at, starts_at, ends_at) VALUES (?, ?, ?, 'Personal', 'active', ?, ?, ?)").run(id, playerId, event.id, now, startsAt, endsAt);
  auditEvent(playerId, id, "spawn", { catalogId: event.id, endsAt });
  return { id, playerId, catalogId: event.id, scope: "Personal", status: "active", issuedAt: now, startsAt, endsAt, choiceId: null, resolutionJson: null, resolvedAt: null, rewardClaimed: 0 };
}

function eventMissionRow(row: Record<string, unknown>): EventMissionRow {
  return { id: String(row.id), playerId: String(row.player_id), eventId: String(row.event_id), templateId: String(row.template_id), target: Number(row.target), issuedAt: Number(row.issued_at), expiresAt: Number(row.expires_at), status: String(row.status), claimedAt: row.claimed_at == null ? null : Number(row.claimed_at), rewardClaimed: Number(row.reward_claimed ?? 0) };
}

function ensureEventMission(playerId: string, eventId: string, stage: MarketStage, board: PlacedCard[], now: number): EventMissionRow | null {
  sqlite.prepare("UPDATE plotgo_event_missions SET status = 'expired' WHERE player_id = ? AND status = 'active' AND expires_at <= ?").run(playerId, now);
  const existing = sqlite.prepare("SELECT * FROM plotgo_event_missions WHERE player_id = ? AND status = 'active' ORDER BY issued_at DESC LIMIT 1").get(playerId) as Record<string, unknown> | undefined;
  if (existing) return eventMissionRow(existing);
  const event = EVENT_CATALOG.find((candidate) => candidate.id === eventId) ?? EVENT_CATALOG[0]!;
  const family = event.category === "Market" ? "Market" : event.category === "Risk/Crisis" ? "Risk/Crisis" : event.category;
  const candidates = EVENT_MISSIONS.filter((mission) => eventEligible({ minStage: mission.minStage } as CatalogEvent, stage) && (mission.eventFamily === family || mission.eventFamily === "Prestige" || (family === "Customer" && mission.eventFamily === "Positive Market")));
  const template = candidates[stableEventSeed(`${playerId}:${eventId}:${now}`) % Math.max(1, candidates.length)] ?? EVENT_MISSIONS.find((mission) => eventEligible({ minStage: mission.minStage } as CatalogEvent, stage)) ?? EVENT_MISSIONS[0]!;
  const boardCapacity = board.reduce((sum, card) => sum + cardCustomers(card), 0);
  const target = /customer|client|investor/i.test(template.metric) && boardCapacity > 0
    ? Math.min(template.baseTarget, Math.max(1, Math.floor(boardCapacity * 2.5)))
    : template.baseTarget;
  const id = newId();
  sqlite.prepare("INSERT INTO plotgo_event_missions (id, player_id, event_id, template_id, target, issued_at, expires_at) VALUES (?, ?, ?, ?, ?, ?, ?)").run(id, playerId, eventId, template.id, target, now, now + template.timeLimitHours * 3_600_000);
  auditEvent(playerId, id, "mission_spawn", { eventId, templateId: template.id, target });
  return { id, playerId, eventId, templateId: template.id, target, issuedAt: now, expiresAt: now + template.timeLimitHours * 3_600_000, status: "active", claimedAt: null, rewardClaimed: 0 };
}

function eventState(playerId: string, board: PlacedCard[], stage: MarketStage, createdAt: number, now = Date.now()) {
  const cycle = ensureMarketCycle(now);
  const day = utcDay();
  const global = cycleGlobalEvent(cycle, stage, day);
  const personal = issuePersonalEvent(playerId, board, stage, createdAt, now);
  const allRows = activePlayerEvents(playerId, now);
  const personalRows = allRows.filter((row) => row.scope === "Personal");
  const globalChoiceRow = allRows.find((row) => row.scope === "Global" && row.catalogId === global.id) ?? null;
  const personalEvents = personalRows.map((row) => EVENT_CATALOG.find((event) => event.id === row.catalogId)).filter((event): event is CatalogEvent => Boolean(event));
  const modifiers = [cycleModifier(cycle.state), eventFamilyModifier(global, board), ...personalEvents.map((event) => eventFamilyModifier(event, board)), ...allRows.flatMap((row) => { const choice = row.choiceId ? EVENT_DECISIONS.find((decision) => decision.id === row.choiceId) : undefined; return choice ? [choice.modifier] : []; })];
  const mission = ensureEventMission(playerId, global.id, stage, board, now);
  const moduleLocks = [...new Set([
    global.id,
    ...personalEvents.map((event) => event.id),
  ].flatMap((eventId) => board.flatMap((card) => {
    const family = buildingFamily(card.type);
    const reason = moduleLockForEvent(eventId, family);
    return reason ? [{ eventId, buildingId: card.id, family, reason }] : [];
  })))];
  return {
    cycle,
    global,
    globalChoiceRow,
    personalRows,
    personalEvents,
    mission,
    globalDecisions: EVENT_DECISIONS.filter((decision) => decision.eventId === global.id),
    moduleInteractions: {
      global: eventModuleInteraction(global.id),
      personal: personalEvents.map((event) => ({ eventId: event.id, interaction: eventModuleInteraction(event.id) })),
    },
    moduleLocks,
    modifiers: stackModifiers(modifiers),
  };
}

function auditEvent(playerId: string | null, eventId: string | null, auditType: string, payload: unknown): string {
  const id = newId();
  const payloadJson = JSON.stringify(payload);
  const resolutionHash = createHash("sha256").update(payloadJson).digest("hex");
  sqlite.prepare("INSERT INTO plotgo_event_audit (id, player_id, event_id, audit_type, resolution_hash, payload_json, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)").run(id, playerId, eventId, auditType, resolutionHash, payloadJson, Date.now());
  return resolutionHash;
}

function grantPendingModuleReward(playerId: string, source: string, sourceEventId: string, reward: ModuleReward | null, metadata: Record<string, unknown> = {}): string | null {
  if (!reward) return null;
  const rewardId = newId();
  const inserted = sqlite.prepare(`
    INSERT OR IGNORE INTO plotgo_module_reward_events
      (reward_id, player_id, source, source_event_id, reward_kind, rarity, module_id, config_version, quantity, parts_amount, metadata_json, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(rewardId, playerId, source, sourceEventId, reward.kind, reward.rarity, reward.moduleId, MODULE_CONFIG_VERSION, reward.quantity, reward.partsAmount, JSON.stringify({ ...metadata, compatibleFamily: reward.compatibleFamily, moduleName: reward.moduleName }), Date.now());
  if (inserted.changes === 1) {
    if (reward.kind === "module" && reward.moduleId) grantModuleInventory(playerId, reward.moduleId, reward.quantity);
    if (reward.kind === "parts") grantModuleParts(playerId, reward.rarity, reward.partsAmount, source, sourceEventId);
  }
  const row = sqlite.prepare("SELECT reward_id AS rewardId FROM plotgo_module_reward_events WHERE player_id = ? AND source = ? AND source_event_id = ?").get(playerId, source, sourceEventId) as { rewardId: string } | undefined;
  return row?.rewardId ?? null;
}

function effectiveEventModifiersForPlayer(playerId: string, board: PlacedCard[], stage: MarketStage, createdAt: number): EventModifier {
  return eventState(playerId, board, stage, createdAt).modifiers;
}

function ensureMarketHunts(playerId: string, board: PlacedCard[], portfolio: Record<string, number>, day: string): MarketHuntSlot[] {
  const now = Date.now();
  sqlite.transaction(() => {
    const expired = sqlite.prepare("SELECT * FROM market_hunt_slots WHERE player_id = ? AND status = 'active' AND expires_at <= ?").all(playerId, now) as Record<string, unknown>[];
    const expire = sqlite.prepare("UPDATE market_hunt_slots SET status = 'expired' WHERE id = ? AND status = 'active' AND expires_at <= ?");
    for (const row of expired) {
      if (expire.run(String(row.id), now).changes === 1) releaseMarketReservation(marketHuntRow(row));
    }
  })();
  const week = isoWeek(new Date(`${day}T00:00:00Z`));
  ensureMarketPool(week);
  const activeBoard = operatingBoard(board);
  const stage = marketStageForEmpireLevel(empireLevel(activeBoard));
  const stageRule = STAGE_RULES[stage];
  const marketEvent = marketEventForDay(day, playerId);
  const bonuses = collectionBonuses(portfolio);
  const placement = resolvePlacement(activeBoard);
  const created = sqlite.prepare("SELECT created_at AS createdAt FROM players WHERE id = ?").get(playerId) as { createdAt: number } | undefined;
  const events = eventState(playerId, activeBoard, stage, Number(created?.createdAt ?? now));
  const desired = Math.min(5, Math.ceil((stageRule.baseHunts + stageRule.bonusHunts) * marketEvent.spawnMultiplier * events.global.huntSpawnMultiplier * (1 + (bonuses.researchSpawnBps + placement.effects.huntSpawnBps + events.modifiers.huntSpawnBps) / 10_000)));
  const existing = loadMarketHunts(playerId, day);
  const seen = new Set(existing.map((slot) => slot.templateId));
  const createCount = Math.max(0, desired - existing.length);
  const insert = sqlite.prepare(`
    INSERT INTO market_hunt_slots
      (id, player_id, issued_day, week, template_id, difficulty, reward_rarity, stock_ticker, reward_value_minor, module_reward_kind, module_reward_rarity, module_reward_module_id, module_reward_quantity, module_reward_parts, points, target, issued_at, expires_at, status, reserved_minor)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  for (let i = 0; i < createCount; i++) {
    const seed = seedMix(seedForDay(day, playerId), existing.length + i);
    const difficulty = chooseDifficulty(stage, seed);
    const eligible = MARKET_HUNTS.filter((hunt) => marketStageIndex(hunt.minStage) <= marketStageIndex(stage) && hunt.difficulty === difficulty && !seen.has(hunt.id) && huntAchievable(hunt, activeBoard));
    const fallback = MARKET_HUNTS.filter((hunt) => marketStageIndex(hunt.minStage) <= marketStageIndex(stage) && !seen.has(hunt.id) && huntAchievable(hunt, activeBoard));
    const pool = eligible.length ? eligible : fallback;
    if (!pool.length) break;
    const tutorialOpen = !onboardingMilestoneRows(playerId).some((row) => row.milestoneId === "onboarding_first_hunt_open");
    const tutorialTemplate = MARKET_HUNTS.find((hunt) => hunt.id === "first_customers");
    const template = tutorialOpen && tutorialTemplate && !seen.has(tutorialTemplate.id) && huntAchievable(tutorialTemplate, activeBoard)
      ? tutorialTemplate
      : pool[seed % pool.length]!;
    seen.add(template.id);
    const rarity = tutorialOpen ? "common" : throttledRarity(week, template.difficulty, seedMix(seed, 11), marketEvent.rewardRarityShift, bonuses.researchQualityBps + placement.effects.huntQualityBps, template.rewardBias);
    const rewardValueMinor = REWARD_VALUES_MINOR[rarity];
    const moduleReward = rollHuntModuleReward(template.difficulty, seedMix(seed, 23), template.family);
    const stock = tutorialOpen ? MARKET_STOCKS.find((candidate) => candidate.ticker === "AAPL") ?? chooseStock(template.stockAffinity, `${marketEvent.stockBias},${events.global.stockBias}`, stage, seedMix(seed, 17)) : chooseStock(template.stockAffinity, `${marketEvent.stockBias},${events.global.stockBias}`, stage, seedMix(seed, 17));
    const paused = poolConsumption(week) >= 0.95;
    const reserved = !paused && reserveMarketReward(week, stock.ticker, rewardValueMinor);
    const adjustedTarget = realisticTarget(template, template.target < 1
      ? Number((template.target * marketEvent.targetMultiplier).toFixed(3))
      : Math.max(1, Math.round(template.target * marketEvent.targetMultiplier * (1 + Math.max(-0.25, Math.min(0.25, events.modifiers.demandBps / 10_000))))), activeBoard);
    const issuedAt = now + i;
    insert.run(
      newId(), playerId, day, week, template.id, template.difficulty, rarity,
      reserved ? stock.ticker : null, rewardValueMinor,
      moduleReward?.kind ?? null, moduleReward?.rarity ?? null, moduleReward?.moduleId ?? null, moduleReward?.quantity ?? 0, moduleReward?.partsAmount ?? 0,
      template.points,
      adjustedTarget, issuedAt, issuedAt + template.durationHours * 3_600_000, reserved ? "active" : "cash_fallback", reserved ? rewardValueMinor : 0,
    );
    if (tutorialOpen && activeBoard.length > 0 && template.id === "first_customers") recordOnboardingMilestone(playerId, "onboarding_first_hunt_open", "market_hunt.issue", now);
  }
  return loadMarketHunts(playerId, day);
}

function templateForSlot(slot: MarketHuntSlot): MarketHuntTemplate {
  return MARKET_HUNTS.find((hunt) => hunt.id === slot.templateId) ?? MARKET_HUNTS[0]!;
}

function effectiveDistrictEvent(
  event: ReturnType<typeof eventForDay>,
  marketEvent: ReturnType<typeof marketEventForDay>,
  customerDemandBps = 0,
  eventModifiers: EventModifier = { demandBps: 0, activityBps: 0, revenueBps: 0, riskBps: 0, huntSpawnBps: 0, reputationDelta: 0 },
) {
  return {
    ...event,
    activityBps: Math.round(event.activityBps * marketEvent.activityModifier * (1 + eventModifiers.activityBps / 10_000)),
    populationBps: Math.round(event.populationBps * marketEvent.customerDemand * (1 + customerDemandBps / 10_000) * (1 + eventModifiers.demandBps / 10_000)),
    revenueBps: eventModifiers.revenueBps,
    riskBps: eventModifiers.riskBps,
    riskDeltaBps: event.riskDeltaBps,
    reputationDelta: eventModifiers.reputationDelta,
  };
}

function ensureOpeningLedger(playerId: string, balanceMinor: number) {
  const row = sqlite.prepare("SELECT COUNT(*) AS count FROM plotgo_ledger WHERE player_id = ?").get(playerId) as { count: number };
  if (row.count === 0) {
    sqlite.prepare(
      `INSERT INTO plotgo_ledger (id, player_id, day, reason, amount_minor, balance_minor, metadata_json, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(newId(), playerId, utcDay(), "grant", balanceMinor, balanceMinor, JSON.stringify({ source: "founder_plot" }), Date.now());
  }
}

function recordLedger(playerId: string, day: string, reason: string, amountMinor: number, balanceMinor: number, metadata: unknown) {
  sqlite.prepare(
    `INSERT INTO plotgo_ledger (id, player_id, day, reason, amount_minor, balance_minor, metadata_json, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(newId(), playerId, day, reason, amountMinor, balanceMinor, JSON.stringify(metadata), Date.now());
}

function parsePhase4Marks(raw: unknown) {
  try {
    const parsed = JSON.parse(String(raw ?? "[]"));
    if (!Array.isArray(parsed)) return null;
    const marks = parsed.filter((mark): mark is { ticker: (typeof PHASE4_TICKERS)[number]; returnBps: number } =>
      mark && PHASE4_TICKERS.includes(mark.ticker) && Number.isFinite(Number(mark.returnBps)),
    ).map((mark) => ({ ticker: mark.ticker, returnBps: Number(mark.returnBps) }));
    return marks.length === PHASE4_TICKERS.length ? marks : null;
  } catch {
    return null;
  }
}

function districtDay(playerId: string, day: string) {
  const existing = sqlite.prepare("SELECT player_id, day, seed, event_id AS eventId, marks_json AS marksJson FROM plotgo_district_day WHERE player_id = ? AND day = ?").get(playerId, day) as
    | { player_id: string; day: string; seed: number; eventId: string; marksJson: string }
    | undefined;
  if (existing) {
    const event = eventForDay(day, playerId);
    const marks = parsePhase4Marks(existing.marksJson) ?? phase4Marks(day, playerId, marketEventForDay(day, playerId));
    if (!parsePhase4Marks(existing.marksJson)) sqlite.prepare("UPDATE plotgo_district_day SET marks_json = ? WHERE player_id = ? AND day = ?").run(JSON.stringify(marks), playerId, day);
    return { seed: existing.seed, event, marks };
  }
  const seed = seedForDay(day, playerId);
  const event = eventForDay(day, playerId);
  const marks = phase4Marks(day, playerId, marketEventForDay(day, playerId));
  sqlite.prepare("INSERT INTO plotgo_district_day (player_id, day, seed, event_id, marks_json) VALUES (?, ?, ?, ?, ?)").run(playerId, day, seed, event.id, JSON.stringify(marks));
  return { seed, event, marks };
}

function settlePortfolio(playerId: string, day: string, marks: ReturnType<typeof phase4Marks>) {
  const rows = sqlite.prepare("SELECT ticker, weight_bps AS weightBps, allocated_minor AS allocatedMinor, last_mark_day AS lastMarkDay, effective_day AS effectiveDay FROM plotgo_position WHERE player_id = ? ORDER BY ticker").all(playerId) as Record<string, unknown>[];
  const eligible = rows.filter((row) => {
    const ticker = String(row.ticker);
    const effectiveDay = String(row.effectiveDay ?? "");
    return PHASE4_TICKERS.includes(ticker as (typeof PHASE4_TICKERS)[number]) && (effectiveDay === "" || effectiveDay < day) && String(row.lastMarkDay ?? "") !== day;
  });
  if (!eligible.length) return { applied: false, grossMarkMinor: 0, preFeeAumMinor: 0, feeMinor: 0, endAumMinor: 0, positions: [], marks };
  const result = applyPortfolioMarks(eligible.map((row) => ({
    ticker: String(row.ticker) as (typeof PHASE4_TICKERS)[number],
    weightBps: Number(row.weightBps),
    allocatedMinor: Math.max(0, Number(row.allocatedMinor)),
  })), marks);
  sqlite.transaction(() => {
    const update = sqlite.prepare("UPDATE plotgo_position SET allocated_minor = ?, mark_bps = ?, last_mark_day = ?, updated_at = ? WHERE player_id = ? AND ticker = ?");
    for (const position of result.positions) update.run(position.endMinor, position.markBps, day, Date.now(), playerId, position.ticker);
  })();
  return { applied: true, ...result, marks };
}

function sessionFor(playerId: string, day: string) {
  const row = sqlite.prepare("SELECT verb, receipt_json AS receiptJson, settled_at AS settledAt FROM plotgo_session WHERE player_id = ? AND day = ?").get(playerId, day) as
    | { verb: SessionVerb; receiptJson: string; settledAt: number }
    | undefined;
  if (!row) return null;
  return { verb: row.verb, settledAt: row.settledAt, receipt: JSON.parse(row.receiptJson) };
}

async function settlePlayer(playerId: string) {
  await processOfflineCatchup(playerId);
  const [p] = await db.select().from(players).where(eq(players.id, playerId));
  if (!p) return null;
  const board = await loadCards(playerId);
  const { map: portfolioMap } = await loadFrags(playerId);
  ensureOpeningLedger(playerId, p.cashMinor);
  const day = utcDay();
  if (p.huntDay !== day) await db.update(players).set({ huntDay: day, huntClaimed: 0, exchangeActionsToday: 0 }).where(eq(players.id, playerId));
  const marketHunts = ensureMarketHunts(playerId, board, portfolioMap, day);
  return {
    ...p,
    huntDay: day,
    huntClaimed: 0,
    exchangeActionsToday: p.huntDay === day ? p.exchangeActionsToday : 0,
    board,
    marketHunts,
    activeDays: parseDays((sqlite.prepare("SELECT active_days AS activeDays FROM players WHERE id = ?").get(playerId) as { activeDays: string } | undefined)?.activeDays),
  };
}

async function snapshot(playerId: string, moveTxId?: string) {
  const p = await settlePlayer(playerId);
  if (!p) return null;
  const presence = presenceRow(playerId);
  const { map, units, portfolio, collections } = await loadFrags(playerId);
  const ev = empireValueMinor(p.cashMinor, p.board, units);
  const day = utcDay();
  const dayData = districtDay(playerId, day);
  const marketEvent = marketEventForDay(day, playerId);
  const gate = stockClaimGate(p);
  const activeBoard = operatingBoard(p.board);
  const progressionLevel = currentEmpireLevel(playerId, activeBoard);
  const stage = marketStageForEmpireLevel(progressionLevel);
  const events = eventState(playerId, activeBoard, stage, p.createdAt);
  const activeEvent = effectiveDistrictEvent(dayData.event, marketEvent, collectionBonuses(map).customerDemandBps, events.modifiers);
  const moduleEffects = moduleEffectsForBoard(playerId, activeBoard, [events.global.id, ...events.personalEvents.map((event) => event.id)], events.cycle.state);
  const archetype = archetypeResolutionForPlayer(playerId, activeBoard);
  const placement = resolvePlacement(activeBoard);
  const placementAudit = recordPlacementAudit(playerId, p.board, moveTxId);
  if (hasTutorialCashAccessSynergy(activeBoard)) recordOnboardingMilestone(playerId, "onboarding_first_synergy", "placement.resolve");
  const metrics = settleDistrict(
    activeBoard,
    activeEvent,
    "walk",
    { cashMinor: p.cashMinor, reputationBps: p.reputationBps, conditionBps: p.conditionBps },
    dayData.seed,
    moduleEffects,
    archetype.effects,
  );
  const hunts = p.marketHunts.map((slot) => {
    const template = templateForSlot(slot);
    const progress = huntProgress(p, slot, template, metrics, map);
    return {
      ...template,
      id: slot.id,
      templateId: template.id,
      title: template.name,
      hint: `${template.metric}: ${(slot.target || template.target).toLocaleString()} ${template.unit}.`,
      difficulty: slot.difficulty,
      rewardRarity: slot.rewardRarity,
      stockTicker: slot.stockTicker,
      rewardValueMinor: slot.rewardValueMinor,
      moduleReward: slot.moduleReward ? { ...slot.moduleReward, label: moduleRewardLabel(slot.moduleReward) } : null,
      target: slot.target || template.target,
      points: slot.points,
      expiresAt: slot.expiresAt,
      status: slot.status,
      claimed: slot.status === "claimed",
      progress,
      ready: slot.status === "active" && progress.done && (!slot.stockTicker || gate.eligible),
      claimBlockedReason: slot.stockTicker && !gate.eligible ? gate.reason : null,
    };
  });
  if (progressionLevel >= 4) recordOnboardingMilestone(playerId, "onboarding_first_hunt_open", "hunt.available");
  const week = isoWeek(new Date(`${day}T00:00:00Z`));
  const pointRow = sqlite.prepare("SELECT COALESCE(SUM(points), 0) AS points FROM market_hunt_slots WHERE player_id = ? AND week = ? AND status = 'claimed'").get(playerId, week) as { points: number };
  const marketHuntPoints = Math.min(35, Number(pointRow.points));
  const marketHuntSubscore = Math.min(100, Math.round((marketHuntPoints / STAGE_RULES[stage].weeklyPointTarget) * 100));
  const weekPerformance = performanceSnapshot(p, weeklyPerformanceRow(playerId, week), week, stage);
  const pendingPayout = sqlite.prepare("SELECT week, payout_plot AS payoutPlot FROM weekly_performance WHERE player_id = ? AND finalized = 1 AND payout_plot > 0 AND claimed_at IS NULL ORDER BY week DESC LIMIT 1").get(playerId) as { week: string; payoutPlot: number } | undefined;
  return {
    playerId,
    founder: true,
    cashMinor: p.cashMinor,
    cash: displayCash(p.cashMinor),
    earnedMinor: p.earnedMinor,
    empireValueMinor: ev,
    empireValue: displayCash(ev),
    weeklyScore: p.weeklyScore,
    weeklyRedeemable: Boolean(pendingPayout),
    pendingPayout: pendingPayout ?? null,
    plotBalance: p.plotBalance,
    performance: weekPerformance,
    marketStage: stage,
    marketHuntPoints,
    marketHuntPointCap: 35,
    marketHuntSubscore,
    marketHuntPerformanceContribution: Number((marketHuntSubscore * 0.05).toFixed(2)),
    marketPoolConsumption: poolConsumption(week),
    stockClaimEligible: gate.eligible,
    stockClaimBlockedReason: gate.reason,
    activeDays: p.activeDays.length,
    presenceState: presence?.presenceState ?? "engaged",
    activeMinutesToday: parseNumberMap(presence?.activeMinutesDailyJson)[day] ?? 0,
    meaningfulActionsToday: parseNumberMap(presence?.meaningfulActionsDailyJson)[day] ?? 0,
    offlineSummary: offlineSummaryRow(playerId),
    onboarding: onboardingSnapshot(playerId),
    archetype: {
      selected: archetype.archetype,
      options: EMPIRE_ARCHETYPES,
      dominantShare: archetype.dominantShare,
      suppressed: archetype.suppressed,
      reason: archetype.reason,
      effects: archetype.effects,
      changedAt: p.archetypeChangedAt ?? null,
    },
    empireLevel: progressionLevel,
    cards: p.board,
    catalog: BUILDING_LIST.map((spec) => ({
      ...spec,
      moduleProfile: buildingModuleProfile(spec.id),
      unlocked: isUnlocked(spec.id, p.board, progressionLevel),
    })),
    fragments: map,
    moduleRewards: pendingModuleRewards(playerId),
    modules: {
      configVersion: MODULE_CONFIG_VERSION,
      inventory: moduleInventoryRows(playerId).filter((module) => module.quantityOwned > 0),
      parts: modulePartsRows(playerId),
      effects: moduleEffects,
      loadouts: moduleLoadoutSummaries(playerId, p.board),
    },
    portfolio,
    positions: positionRows(playerId),
    collections,
    hunts,
    hunt: hunts[0] ?? null,
    tickMinor: tickMinor(p.board),
    event: dayData.event,
    marketEvent,
    eventState: {
      cycle: events.cycle,
      globalEvent: events.global,
      globalChoice: events.globalChoiceRow ? { ...events.globalChoiceRow, decisions: events.globalDecisions } : { id: events.global.id, catalogId: events.global.id, choiceId: null, decisions: events.globalDecisions },
      personalEvents: events.personalRows.map((row) => ({ ...row, event: EVENT_CATALOG.find((candidate) => candidate.id === row.catalogId) ?? null, decisions: EVENT_DECISIONS.filter((decision) => decision.eventId === row.catalogId) })),
      mission: missionView(playerId, events.mission, metrics, p),
      moduleInteractions: events.moduleInteractions,
      moduleLocks: events.moduleLocks,
      modifiers: events.modifiers,
      catalogCount: EVENT_CATALOG_COUNT,
    },
    placement: metrics.placement,
    placementAudit,
    session: sessionFor(playerId, day),
    attributes: {
      riskBps: metrics.riskBps,
      reputationBps: p.reputationBps,
      conditionBps: p.conditionBps,
      population: metrics.population,
      capacity: metrics.capacity,
      satisfactionBps: metrics.satisfactionBps,
      segments: metrics.segments,
      transactions: metrics.transactions,
      volumeMinor: metrics.volumeMinor,
      synergyCount: metrics.synergyCount,
      revenue: metrics.revenue,
    },
  };
}

function huntProgress(
  p: {
    earnedMinor: number;
    board: PlacedCard[];
    reputationBps: number;
    transactions: number;
    volumeMinor: number;
  },
  slot: MarketHuntSlot,
  hunt: MarketHuntTemplate,
  metrics: { segments: { retailInvestors: number; activeTraders: number; highNetWorth: number; institutional: number }; population: number; capacity: number; synergyCount: number; transactions: number; volumeMinor: number },
  portfolio: Record<string, number>,
): { current: number; target: number; done: boolean } {
  const target = slot.target || hunt.target;
  let current = 0;
  const metric = hunt.metric.toLowerCase();
  if (metric.includes("customer") || metric.includes("investor")) current = metrics.population;
  else if (metric.includes("trader")) current = metrics.segments.retailInvestors + metrics.segments.activeTraders;
  else if (metric.includes("hnw")) current = metrics.segments.highNetWorth;
  else if (metric.includes("institutional")) current = metrics.segments.institutional;
  else if (metric.includes("reputation")) current = p.reputationBps / 100;
  else if (metric.includes("transaction")) current = metrics.transactions;
  else if (metric.includes("volume") || metric.includes("activity") || metric.includes("aum") || metric.includes("inflows")) current = metrics.volumeMinor / 100;
  else if (metric.includes("utilization")) current = metrics.capacity ? metrics.population / metrics.capacity : 0;
  else if (metric.includes("synergy")) current = metrics.synergyCount;
  else if (metric.includes("distinct stocks")) current = Object.values(portfolio).filter((units) => units > 0).length;
  else if (metric.includes("upgrade")) current = p.board.filter((card) => card.stage > 1).length;
  else if (metric.includes("category")) current = new Set(p.board.map((card) => CARDS[resolveType(card.type)]?.lineage)).size;
  else if (metric.includes("cash") || metric.includes("net")) current = p.earnedMinor / 100;
  else if (metric.includes("condition") || metric.includes("event")) current = 1;
  if (hunt.unit.includes("ratio") || hunt.unit.includes("margin") || hunt.unit.includes("utilization") || hunt.unit.includes("retention")) {
    current = Number(current.toFixed(3));
  }
  return { current, target, done: current >= target && slot.status === "active" };
}

app.get("/health", (c) => c.json({ ok: true }));

app.post("/api/session", async (c) => {
  const body = await c.req.json().catch(() => ({}));
  const id =
    (typeof body.playerId === "string" && body.playerId) ||
    c.req.header("x-player-id") ||
    newId();
  const [existing] = await db.select().from(players).where(eq(players.id, id));
  if (!existing) {
    const day = utcDay();
    await db.insert(players).values({
      id,
      createdAt: Date.now(),
      founder: 1,
      cashMinor: STARTER_CASH_MINOR,
      earnedMinor: 0,
      lastSettleAt: Date.now(),
      exchangeActionsToday: 0,
      huntDay: day,
      huntId: "upgrade_any",
      huntClaimed: 0,
      weeklyScore: 0,
      riskBps: 700,
      reputationBps: 5000,
      conditionBps: 10000,
      population: 0,
      capacity: 0,
      satisfactionBps: 5000,
      transactions: 0,
      volumeMinor: 0,
    });
    ensureOpeningLedger(id, STARTER_CASH_MINOR);
    sqlite.prepare("UPDATE players SET last_meaningful_action_at = ?, offline_started_at = ?, offline_processed_until = ?, presence_state = 'engaged' WHERE id = ?").run(Date.now(), Date.now(), Date.now(), id);
  }
  ensureOnboardingStarted(id);
  const snap = await snapshot(id);
  return c.json({ playerId: id, plot: snap });
});

app.get("/api/plot", async (c) => {
  const id = c.req.header("x-player-id");
  if (!id) return c.json({ error: "x-player-id required" }, 401);
  const snap = await snapshot(id);
  if (!snap) return c.json({ error: "no plot" }, 404);
  return c.json(snap);
});

app.get("/api/portfolio", async (c) => {
  const id = c.req.header("x-player-id");
  if (!id) return c.json({ error: "x-player-id required" }, 401);
  const [player] = await db.select().from(players).where(eq(players.id, id));
  if (!player) return c.json({ error: "no plot" }, 404);
  const { portfolio, collections } = await loadFrags(id);
  recordOnboardingMilestone(id, "onboarding_first_portfolio", "portfolio.view");
  return c.json({ portfolio, collections, positions: positionRows(id), instruments: PHASE4_INSTRUMENTS });
});

app.get("/api/positions", async (c) => {
  const id = c.req.header("x-player-id");
  if (!id) return c.json({ error: "x-player-id required" }, 401);
  const [player] = await db.select().from(players).where(eq(players.id, id));
  if (!player) return c.json({ error: "no plot" }, 404);
  return c.json({ positions: positionRows(id), instruments: PHASE4_INSTRUMENTS });
});

const RebalanceInput = z.object({ weights: z.record(z.enum(PHASE4_TICKERS), z.number().int().min(0).max(10_000)) });
app.post("/api/positions/rebalance", async (c) => {
  const id = c.req.header("x-player-id");
  if (!id) return c.json({ error: "x-player-id required" }, 401);
  const [player] = await db.select().from(players).where(eq(players.id, id));
  if (!player) return c.json({ error: "no plot" }, 404);
  const board = await loadCards(id);
  if (!board.some((card) => ["broker", "fund"].includes(CARDS[resolveType(card.type)]?.lineage ?? ""))) {
    return c.json({ error: "Place a Brokerage or Fund building before allocating a portfolio" }, 409);
  }
  const body = RebalanceInput.parse(await c.req.json());
  const weights = Object.fromEntries(PHASE4_TICKERS.map((ticker) => [ticker, Number(body.weights[ticker] ?? 0)])) as Record<(typeof PHASE4_TICKERS)[number], number>;
  if (Object.values(weights).reduce((sum, value) => sum + value, 0) !== 10_000) return c.json({ error: "portfolio weights must total 10000 bps" }, 400);
  const now = Date.now();
  const effectiveDay = utcDay(now);
  const existing = sqlite.prepare("SELECT COALESCE(SUM(allocated_minor), 0) AS allocatedMinor FROM plotgo_position WHERE player_id = ?").get(id) as { allocatedMinor: number };
  const portfolioCapitalMinor = Number(existing.allocatedMinor) > 0 ? Number(existing.allocatedMinor) : Number(player.cashMinor);
  sqlite.transaction(() => {
    const upsert = sqlite.prepare("INSERT INTO plotgo_position (player_id, ticker, weight_bps, allocated_minor, mark_bps, last_mark_day, effective_day, updated_at) VALUES (?, ?, ?, ?, 0, '', ?, ?) ON CONFLICT(player_id, ticker) DO UPDATE SET weight_bps = excluded.weight_bps, allocated_minor = excluded.allocated_minor, mark_bps = 0, effective_day = excluded.effective_day, updated_at = excluded.updated_at");
    for (const ticker of PHASE4_TICKERS) upsert.run(id, ticker, weights[ticker], Math.floor(portfolioCapitalMinor * weights[ticker] / 10_000), effectiveDay, now);
  })();
  recordOnboardingMilestone(id, "onboarding_first_portfolio", "portfolio.rebalance");
  recordMeaningfulAction(id, "portfolio:rebalance");
  return c.json({
    positions: positionRows(id),
    instruments: PHASE4_INSTRUMENTS,
    receipt: {
      type: "rebalance",
      effectiveDay,
      capitalMinor: portfolioCapitalMinor,
      weights,
      message: "In-game positions are simulated and will receive their next daily mark on the next UTC settlement.",
    },
  });
});

app.get("/api/onboarding", (c) => {
  const id = c.req.header("x-player-id");
  if (!id) return c.json({ error: "x-player-id required" }, 401);
  const state = onboardingSnapshot(id);
  if (!state) return c.json({ error: "no plot" }, 404);
  return c.json(state);
});

app.post("/api/onboarding/start", (c) => {
  const id = c.req.header("x-player-id");
  if (!id) return c.json({ error: "x-player-id required" }, 401);
  ensureOnboardingStarted(id);
  const state = onboardingSnapshot(id);
  if (!state) return c.json({ error: "no plot" }, 404);
  return c.json(state);
});

app.post("/api/onboarding/skip", (c) => {
  const id = c.req.header("x-player-id");
  if (!id) return c.json({ error: "x-player-id required" }, 401);
  const row = onboardingRow(id);
  if (!row) return c.json({ error: "no plot" }, 404);
  const now = Date.now();
  sqlite.prepare("UPDATE players SET onboarding_status = 'skipped', onboarding_step = 'freeplay', onboarding_skipped_at = COALESCE(onboarding_skipped_at, ?) WHERE id = ?").run(now, id);
  return c.json(onboardingSnapshot(id));
});

const ArchetypeInput = z.object({ archetype: z.enum(["trading", "investment", "banking", "tokenized_stock"]) });
app.post("/api/archetype", async (c) => {
  const id = c.req.header("x-player-id");
  if (!id) return c.json({ error: "x-player-id required" }, 401);
  const [player] = await db.select().from(players).where(eq(players.id, id));
  if (!player) return c.json({ error: "no plot" }, 404);
  const body = ArchetypeInput.parse(await c.req.json());
  const now = Date.now();
  const current = player.archetype as EmpireArchetype | null;
  if (current === body.archetype) return c.json({ archetype: current, chargedMinor: 0, changedAt: player.archetypeChangedAt ?? null });
  if (player.archetypeChangedAt != null && now - player.archetypeChangedAt < 7 * 24 * 60 * 60_000) return c.json({ error: "archetype can be retuned once every 7 days" }, 409);
  const retuneCost = 20_000;
  if (player.cashMinor < retuneCost) return c.json({ error: "retuning requires 200 Cash" }, 409);
  const changed = sqlite.prepare("UPDATE players SET cash_minor = cash_minor - ?, archetype = ?, archetype_changed_at = ? WHERE id = ? AND cash_minor >= ?").run(retuneCost, body.archetype, now, id, retuneCost);
  if (changed.changes !== 1) return c.json({ error: "retuning failed" }, 409);
  recordLedger(id, utcDay(), "archetype_retune", -retuneCost, player.cashMinor - retuneCost, { archetype: body.archetype });
  recordMeaningfulAction(id, `archetype:${body.archetype}`);
  const snap = await snapshot(id);
  return c.json({ ...snap, chargedMinor: retuneCost });
});

const SessionInput = z.object({
  verb: z.enum(SESSION_VERBS.map((verb) => verb.id) as [SessionVerb, ...SessionVerb[]]),
});

app.post("/api/session/settle", async (c) => {
  const id = c.req.header("x-player-id");
  if (!id) return c.json({ error: "x-player-id required" }, 401);
  const body = SessionInput.parse(await c.req.json());
  const day = utcDay();
  const existing = sessionFor(id, day);
  if (existing) return c.json({ ...(await snapshot(id)), receipt: existing.receipt });
  const p = await settlePlayer(id);
  if (!p) return c.json({ error: "no plot" }, 404);
  const dayData = districtDay(id, day);
  const marketEvent = marketEventForDay(day, id);
  const { map } = await loadFrags(id);
  const activeBoard = operatingBoard(p.board);
  const eventLayer = eventState(id, activeBoard, marketStageForEmpireLevel(currentEmpireLevel(id, activeBoard)), p.createdAt);
  const activeEvent = effectiveDistrictEvent(dayData.event, marketEvent, collectionBonuses(map).customerDemandBps, eventLayer.modifiers);
  const moduleEffects = moduleEffectsForBoard(id, activeBoard, [eventLayer.global.id, ...eventLayer.personalEvents.map((event) => event.id)], eventLayer.cycle.state);
  const archetype = archetypeResolutionForPlayer(id, activeBoard);
  let result = settleDistrict(
    activeBoard,
    activeEvent,
    body.verb,
    { cashMinor: p.cashMinor, reputationBps: p.reputationBps, conditionBps: p.conditionBps },
    dayData.seed,
    moduleEffects,
    archetype.effects,
  );
  let firstCustomerAssistUsed = false;
  const onboarding = onboardingRow(id);
  const onboardingElapsedMs = onboarding?.onboardingStartedAt == null ? 0 : Date.now() - onboarding.onboardingStartedAt;
  const firstCustomerMissing = !onboardingMilestoneRows(id).some((milestone) => milestone.milestoneId === "onboarding_first_customer");
  if (result.population <= 0 && activeBoard.length > 0 && onboarding?.onboardingStatus === "active" && onboarding.firstCustomerAssistUsed === 0 && firstCustomerMissing && onboardingElapsedMs >= 2 * 60_000) {
    const capacityBeforeAssist = activeBoard.reduce((sum, card) => sum + Math.max(1, CARDS[resolveType(card.type)]?.customersBase ?? 1), 0);
    if (capacityBeforeAssist > 0 && claimTutorialRecovery(id, "first_customer_assist", 0, { reason: "first_customer_demand_sla", elapsedMinutes: Number((onboardingElapsedMs / 60_000).toFixed(2)) })) {
      const assistedEvent = { ...activeEvent, populationBps: Math.max(activeEvent.populationBps, 10_000) };
      const assistedResult = settleDistrict(
        activeBoard,
        assistedEvent,
        body.verb,
        { cashMinor: p.cashMinor, reputationBps: p.reputationBps, conditionBps: p.conditionBps },
        dayData.seed,
        moduleEffects,
        archetype.effects,
      );
      if (assistedResult.population > 0) {
        result = assistedResult;
        firstCustomerAssistUsed = true;
      }
    }
  }
  const portfolio = settlePortfolio(id, day, dayData.marks);
  const portfolioCashMinor = portfolio.applied ? portfolio.feeMinor : 0;
  const totalCashDeltaMinor = result.cashDeltaMinor + portfolioCashMinor;
  const nextCash = Math.max(0, p.cashMinor + totalCashDeltaMinor);
  const performanceStage = marketStageForEmpireLevel(currentEmpireLevel(id, p.board));
  await db
    .update(players)
    .set({
      cashMinor: nextCash,
      earnedMinor: p.earnedMinor + result.earnedDeltaMinor + portfolioCashMinor,
      riskBps: result.riskBps,
      reputationBps: result.reputationBps,
      conditionBps: result.conditionBps,
      population: result.population,
      capacity: result.capacity,
      satisfactionBps: result.satisfactionBps,
      transactions: result.transactions,
      volumeMinor: result.volumeMinor,
      weeklyScore: p.weeklyScore + result.earnedDeltaMinor + portfolioCashMinor,
    })
    .where(eq(players.id, id));
  upsertWeeklySessionPerformance(id, isoWeek(new Date(`${day}T00:00:00Z`)), performanceStage, p.activeDays.filter((activeDay) => isoWeek(new Date(`${activeDay}T00:00:00Z`)) === isoWeek(new Date(`${day}T00:00:00Z`))).length, p.population, result);
  const receipt = {
    day,
    event: dayData.event,
    marketEvent,
    verb: body.verb,
    lines: portfolio.applied ? [...result.lines, { label: "Portfolio AUM fee", amountMinor: portfolioCashMinor }] : result.lines,
    cashDeltaMinor: totalCashDeltaMinor,
    cashAfterMinor: nextCash,
    riskBps: result.riskBps,
    reputationBps: result.reputationBps,
    transactions: result.transactions,
    volumeMinor: result.volumeMinor,
    synergyCount: result.synergyCount,
    revenue: result.revenue,
    portfolio: {
      applied: portfolio.applied,
      marks: portfolio.marks,
      grossMarkMinor: portfolio.grossMarkMinor,
      preFeeAumMinor: portfolio.preFeeAumMinor,
      feeMinor: portfolio.feeMinor,
      endAumMinor: portfolio.endAumMinor,
    },
    onboardingRecovery: firstCustomerAssistUsed ? ["first_customer_assist"] : [],
  };
  recordLedger(id, day, "session", totalCashDeltaMinor, nextCash, receipt);
  sqlite.prepare(
    "INSERT INTO plotgo_session (player_id, day, verb, receipt_json, settled_at) VALUES (?, ?, ?, ?, ?)",
  ).run(id, day, body.verb, JSON.stringify(receipt), Date.now());
  if (result.population > 0) recordOnboardingMilestone(id, "onboarding_first_customer", "session.settle");
  if (totalCashDeltaMinor > 0) recordOnboardingMilestone(id, "onboarding_first_cash", "session.settle");
  recordMeaningfulAction(id, `session:${body.verb}`);
  return c.json({ ...(await snapshot(id)), receipt });
});

function isTrade(type: string): boolean {
  const lin = CARDS[resolveType(type)]?.lineage;
  return lin === "trade" || lin === "exchange";
}

function buildValueMinor(card: PlacedCard): number {
  const base = CARDS[resolveType(card.type)]!.placeCostMinor;
  return card.stage <= 1 ? base : card.stage === 2 ? base + upgradeCostMinor(card.type, 1) : base + upgradeCostMinor(card.type, 1) + upgradeCostMinor(card.type, 2);
}

function operatingBoard(board: PlacedCard[], now = Date.now()): PlacedCard[] {
  return board.filter((card) => !card.operationalUntil || card.operationalUntil <= now);
}

const PLACEMENT_VERSIONS = {
  synergyVersion: 1,
  supportVersion: 1,
  stackVersion: 1,
  congestionVersion: 1,
  districtVersion: 1,
  tilemapVersion: 1,
  diagnosticVersion: 1,
} as const;

function placementGeometryHash(board: PlacedCard[]): string {
  const geometry = [...board]
    .sort((a, b) => a.id.localeCompare(b.id))
    .map((card) => [card.id, resolveType(card.type), card.x, card.y, card.orientation ?? 0].join(":"))
    .join("|");
  return createHash("sha256").update(geometry).digest("hex");
}

function recordPlacementAudit(playerId: string, board: PlacedCard[], moveTxId?: string) {
  const geometryHash = placementGeometryHash(board);
  const previous = sqlite.prepare("SELECT * FROM plotgo_placement_audit WHERE player_id = ?").get(playerId) as Record<string, unknown> | undefined;
  const layoutVersion = previous && previous.geometry_hash === geometryHash
    ? Number(previous.layout_version)
    : Number(previous?.layout_version ?? 0) + 1;
  const resolvedMoveTxId = moveTxId ?? (previous?.move_tx_id as string | null | undefined) ?? null;
  sqlite.prepare(`
    INSERT INTO plotgo_placement_audit
      (player_id, layout_version, geometry_hash, synergy_version, support_version, stack_version, congestion_version, district_version, tilemap_version, diagnostic_version, move_tx_id, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(player_id) DO UPDATE SET
      layout_version = excluded.layout_version,
      geometry_hash = excluded.geometry_hash,
      synergy_version = excluded.synergy_version,
      support_version = excluded.support_version,
      stack_version = excluded.stack_version,
      congestion_version = excluded.congestion_version,
      district_version = excluded.district_version,
      tilemap_version = excluded.tilemap_version,
      diagnostic_version = excluded.diagnostic_version,
      move_tx_id = excluded.move_tx_id,
      updated_at = excluded.updated_at
  `).run(
    playerId,
    layoutVersion,
    geometryHash,
    PLACEMENT_VERSIONS.synergyVersion,
    PLACEMENT_VERSIONS.supportVersion,
    PLACEMENT_VERSIONS.stackVersion,
    PLACEMENT_VERSIONS.congestionVersion,
    PLACEMENT_VERSIONS.districtVersion,
    PLACEMENT_VERSIONS.tilemapVersion,
    PLACEMENT_VERSIONS.diagnosticVersion,
    resolvedMoveTxId,
    Date.now(),
  );
  return {
    layoutVersion,
    geometryHash,
    ...PLACEMENT_VERSIONS,
    moveTxId: resolvedMoveTxId,
  };
}

function eventMoveLock(card: PlacedCard, eventId: string): string | null {
  const lineage = CARDS[resolveType(card.type)]?.lineage;
  if (eventId === "storm_warning") return "Relocation is locked during a storm warning settlement window.";
  if (eventId === "bank_run" && (lineage === "bank" || lineage === "lend")) return "Bank and lending buildings are locked during a bank run.";
  if (eventId === "credit_squeeze" && (lineage === "bank" || lineage === "lend" || lineage === "fund")) return "Credit-sensitive buildings are locked during a credit squeeze.";
  if (eventId === "liquidity_crunch" && (lineage === "trade" || lineage === "exchange" || lineage === "broker")) return "Trading buildings are locked during a liquidity crunch.";
  return null;
}

const Place = z.object({
  type: z.string(),
  x: z.number().int().min(0).max(11),
  y: z.number().int().min(0).max(11),
  orientation: z.union([z.literal(0), z.literal(90), z.literal(180), z.literal(270)]).default(0),
});

app.post("/api/plot/place", async (c) => {
  const id = c.req.header("x-player-id");
  if (!id) return c.json({ error: "x-player-id required" }, 401);
  const p = await settlePlayer(id);
  if (!p) return c.json({ error: "no plot" }, 404);
  const body = Place.parse(await c.req.json());
  const spec = CARDS[resolveType(body.type)];
  if (!spec) return c.json({ error: "Unknown building" }, 400);
  const level = currentEmpireLevel(id, p.board);
  if (!isUnlocked(spec.id, p.board, level)) {
    const unlockLevel = buildingUnlockLevel(spec.id);
    return c.json({ error: `Building Card unlocks at Empire Level ${unlockLevel ?? "?"}.` }, 400);
  }
  if (p.cashMinor < spec.placeCostMinor) {
    return c.json({ error: "Not enough Cash" }, 400);
  }
  if (!fits(p.board, spec.id, body.x, body.y, undefined, 12, body.orientation)) {
    return c.json({ error: "Does not fit" }, 400);
  }
  const cardId = newId();
  await db.insert(cards).values({
    id: cardId,
    playerId: id,
    type: spec.id,
    x: body.x,
    y: body.y,
    stage: 1,
    orientation: body.orientation,
    placedAt: Date.now(),
    operationalUntil: 0,
  });
  let exchange = p.exchangeActionsToday;
  if (isTrade(spec.id)) exchange += 1;
  await db
    .update(players)
    .set({
      cashMinor: p.cashMinor - spec.placeCostMinor,
      exchangeActionsToday: exchange,
    })
    .where(eq(players.id, id));
  recordLedger(id, utcDay(), "build", -spec.placeCostMinor, p.cashMinor - spec.placeCostMinor, { type: spec.id });
  if (spec.id === "cash_kiosk") recordOnboardingMilestone(id, "onboarding_first_build", "plot.place");
  if (spec.id === "trading_booth") recordOnboardingMilestone(id, "onboarding_second_business", "plot.place");
  if (spec.id === "savings_stand") recordOnboardingMilestone(id, "onboarding_third_business", "plot.place");
  const placedBoard = await loadCards(id);
  if (hasTutorialCashAccessSynergy(placedBoard)) recordOnboardingMilestone(id, "onboarding_first_synergy", "placement.resolve");
  recordMeaningfulAction(id, `place:${spec.id}`);
  return c.json(await snapshot(id, newId()));
});

const Move = z.object({
  cardId: z.string(),
  x: z.number().int().min(0).max(11),
  y: z.number().int().min(0).max(11),
  orientation: z.union([z.literal(0), z.literal(90), z.literal(180), z.literal(270)]).optional(),
});

app.post("/api/plot/move", async (c) => {
  const id = c.req.header("x-player-id");
  if (!id) return c.json({ error: "x-player-id required" }, 401);
  const p = await settlePlayer(id);
  if (!p) return c.json({ error: "no plot" }, 404);
  const body = Move.parse(await c.req.json());
  const card = p.board.find((x) => x.id === body.cardId);
  if (!card) return c.json({ error: "missing card" }, 404);
  const day = utcDay();
  const dayData = districtDay(id, day);
  const eventLock = eventMoveLock(card, dayData.event.id);
  if (eventLock) return c.json({ error: eventLock }, 409);
  if (card.operationalUntil && card.operationalUntil > Date.now()) return c.json({ error: "Building is still in relocation downtime" }, 409);
  const orientation = (body.orientation ?? card.orientation ?? 0) as Orientation;
  if (!fits(p.board, card.type, body.x, body.y, card.id, 12, orientation)) {
    return c.json({ error: "Does not fit" }, 400);
  }
  const now = Date.now();
  const freeWindow = !card.placedAt || now - card.placedAt < 24 * 3_600_000;
  const tutorialCorrection = tutorialRelocationAvailable(id, p.board, now) &&
    (card.type === "cash_kiosk" || card.type === "savings_stand");
  const normalFee = freeWindow ? 0 : Math.round(buildValueMinor(card) * 0.05);
  const fee = tutorialCorrection ? 0 : normalFee;
  if (p.cashMinor < fee) return c.json({ error: "Not enough Cash for relocation fee" }, 400);
  const downtimeUntil = tutorialCorrection || freeWindow ? 0 : now + 15 * 60_000;
  await db.update(cards).set({ x: body.x, y: body.y, orientation, operationalUntil: downtimeUntil }).where(eq(cards.id, body.cardId));
  if (tutorialCorrection) {
    claimTutorialRecovery(id, "free_tutorial_relocation", normalFee, {
      cardId: body.cardId,
      type: card.type,
      reason: "cash_access_synergy_recovery",
    });
  }
  if (fee > 0) {
    await db.update(players).set({ cashMinor: p.cashMinor - fee }).where(eq(players.id, id));
    recordLedger(id, day, "relocation", -fee, p.cashMinor - fee, { cardId: body.cardId, feeMinor: fee, downtimeUntil });
  }
  recordMeaningfulAction(id, `move:${body.cardId}`);
  return c.json(await snapshot(id, newId()));
});

app.post("/api/plot/rotate", async (c) => {
  const id = c.req.header("x-player-id");
  if (!id) return c.json({ error: "x-player-id required" }, 401);
  const p = await settlePlayer(id);
  if (!p) return c.json({ error: "no plot" }, 404);
  const body = z.object({ cardId: z.string(), orientation: z.union([z.literal(0), z.literal(90), z.literal(180), z.literal(270)]) }).parse(await c.req.json());
  const card = p.board.find((x) => x.id === body.cardId);
  if (!card) return c.json({ error: "missing card" }, 404);
  if (card.orientation === body.orientation) return c.json(await snapshot(id));
  // Rotation follows the same authoritative relocation rules as a move.
  const eventLock = eventMoveLock(card, districtDay(id, utcDay()).event.id);
  if (eventLock) return c.json({ error: eventLock }, 409);
  if (card.operationalUntil && card.operationalUntil > Date.now()) return c.json({ error: "Building is still in relocation downtime" }, 409);
  if (!fits(p.board, card.type, card.x, card.y, card.id, 12, body.orientation)) return c.json({ error: "Rotated footprint does not fit" }, 400);
  const now = Date.now();
  const freeWindow = !card.placedAt || now - card.placedAt < 24 * 3_600_000;
  const tutorialCorrection = tutorialRelocationAvailable(id, p.board, now) &&
    (card.type === "cash_kiosk" || card.type === "savings_stand");
  const normalFee = freeWindow ? 0 : Math.round(buildValueMinor(card) * 0.05);
  const fee = tutorialCorrection ? 0 : normalFee;
  if (p.cashMinor < fee) return c.json({ error: "Not enough Cash for relocation fee" }, 400);
  const downtimeUntil = tutorialCorrection || freeWindow ? 0 : now + 15 * 60_000;
  await db.update(cards).set({ orientation: body.orientation, operationalUntil: downtimeUntil }).where(eq(cards.id, card.id));
  if (tutorialCorrection) {
    claimTutorialRecovery(id, "free_tutorial_relocation", normalFee, {
      cardId: card.id,
      type: card.type,
      reason: "cash_access_synergy_recovery",
    });
  }
  if (fee > 0) {
    await db.update(players).set({ cashMinor: p.cashMinor - fee }).where(eq(players.id, id));
    recordLedger(id, utcDay(), "rotation", -fee, p.cashMinor - fee, { cardId: card.id, feeMinor: fee, downtimeUntil });
  }
  recordMeaningfulAction(id, `rotate:${card.id}`);
  return c.json(await snapshot(id, newId()));
});

const Upgrade = z.object({ cardId: z.string() });

app.post("/api/plot/upgrade", async (c) => {
  const id = c.req.header("x-player-id");
  if (!id) return c.json({ error: "x-player-id required" }, 401);
  const p = await settlePlayer(id);
  if (!p) return c.json({ error: "no plot" }, 404);
  const { cardId } = Upgrade.parse(await c.req.json());
  const card = p.board.find((x) => x.id === cardId);
  if (!card) return c.json({ error: "missing card" }, 404);
  if (card.stage >= 3) return c.json({ error: "Max stage" }, 400);
  const cost = upgradeCostMinor(card.type, card.stage as 1 | 2);
  if (p.cashMinor < cost) return c.json({ error: "Not enough Cash" }, 400);
  await db
    .update(cards)
    .set({ stage: card.stage + 1 })
    .where(eq(cards.id, cardId));
  let exchange = p.exchangeActionsToday;
  if (isTrade(card.type)) exchange += 1;
  await db
    .update(players)
    .set({ cashMinor: p.cashMinor - cost, exchangeActionsToday: exchange })
    .where(eq(players.id, id));
  recordLedger(id, utcDay(), "upgrade", -cost, p.cashMinor - cost, { cardId, type: card.type, toStage: card.stage + 1 });
  if (card.type === "cash_kiosk" && card.stage === 1) recordOnboardingMilestone(id, "onboarding_first_upgrade", "plot.upgrade");
  recordMeaningfulAction(id, `upgrade:${cardId}`);
  return c.json(await snapshot(id));
});

app.post("/api/plot/repair", async (c) => {
  const id = c.req.header("x-player-id");
  if (!id) return c.json({ error: "x-player-id required" }, 401);
  const p = await settlePlayer(id);
  if (!p) return c.json({ error: "no plot" }, 404);
  if (p.conditionBps >= 10_000) return c.json({ error: "District is already in good condition" }, 400);
  const cost = Math.max(50 * 100, p.board.reduce((sum, card) => sum + Math.round(CARDS[card.type].placeCostMinor * card.stage / 50), 0));
  if (p.cashMinor < cost) return c.json({ error: "Not enough Cash" }, 400);
  const conditionBps = Math.min(10_000, p.conditionBps + 2_000);
  await db.update(players).set({ cashMinor: p.cashMinor - cost, conditionBps }).where(eq(players.id, id));
  recordLedger(id, utcDay(), "repair", -cost, p.cashMinor - cost, { conditionBps });
  recordMeaningfulAction(id, "repair");
  return c.json(await snapshot(id));
});

const HuntClaim = z.object({ huntId: z.string().optional() });

app.post("/api/hunt/claim", async (c) => {
  const id = c.req.header("x-player-id");
  if (!id) return c.json({ error: "x-player-id required" }, 401);
  const p = await settlePlayer(id);
  if (!p) return c.json({ error: "no plot" }, 404);
  const body = HuntClaim.parse(await c.req.json().catch(() => ({})));
  const slot = p.marketHunts.find((candidate) => candidate.id === body.huntId) ?? p.marketHunts.find((candidate) => candidate.status === "active" || candidate.status === "cash_fallback");
  if (!slot) return c.json({ error: "No active Market Hunt" }, 400);
  if (slot.status === "claimed") return c.json({ error: "Already claimed" }, 400);
  if (slot.status === "expired") return c.json({ error: "Hunt expired" }, 400);
  const hunt = templateForSlot(slot);
  const day = utcDay();
  const dayData = districtDay(id, day);
  const marketEvent = marketEventForDay(day, id);
  const { map } = await loadFrags(id);
  const activeBoard = operatingBoard(p.board);
  const eventLayer = eventState(id, activeBoard, marketStageForEmpireLevel(currentEmpireLevel(id, activeBoard)), p.createdAt);
  const activeEvent = effectiveDistrictEvent(dayData.event, marketEvent, collectionBonuses(map).customerDemandBps, eventLayer.modifiers);
  const moduleEffects = moduleEffectsForBoard(id, activeBoard, [eventLayer.global.id, ...eventLayer.personalEvents.map((event) => event.id)], eventLayer.cycle.state);
  const archetype = archetypeResolutionForPlayer(id, activeBoard);
  const metrics = settleDistrict(
    activeBoard,
    activeEvent,
    "walk",
    { cashMinor: p.cashMinor, reputationBps: p.reputationBps, conditionBps: p.conditionBps },
    dayData.seed,
    moduleEffects,
    archetype.effects,
  );
  const prog = huntProgress(p, slot, hunt, metrics, map);
  if (!prog.done) return c.json({ error: "Hunt not complete" }, 400);
  const gate = stockClaimGate(p);
  if (slot.stockTicker && !gate.eligible) return c.json({ error: gate.reason }, 403);
  const claimResult = sqlite.transaction(() => {
    const claimed = sqlite.prepare("UPDATE market_hunt_slots SET status = 'claimed', claimed_at = ?, reserved_minor = 0 WHERE id = ? AND status IN ('active', 'cash_fallback')").run(Date.now(), slot.id);
    if (claimed.changes !== 1) return null;
    const claimPriceMinor = slot.stockTicker ? oraclePriceMinor(slot.stockTicker) : 0;
    if (slot.stockTicker && slot.rewardValueMinor > 0) {
      addStockUnits(id, slot.stockTicker, rewardUnitsMicrosAtPrice(slot.rewardValueMinor, claimPriceMinor));
      claimMarketReservation(slot);
    }
    const fallbackCashMinor = slot.stockTicker ? 0 : slot.rewardValueMinor;
    const moduleRewardId = grantPendingModuleReward(id, "market_hunt", slot.id, slot.moduleReward, { huntId: hunt.id, difficulty: slot.difficulty, stockTicker: slot.stockTicker });
    sqlite.prepare("UPDATE players SET cash_minor = cash_minor + ?, earned_minor = earned_minor + ?, hunt_claimed = 0 WHERE id = ?").run(fallbackCashMinor, fallbackCashMinor, id);
    addWeeklyHuntPerformance(id, slot.week, marketStageForEmpireLevel(currentEmpireLevel(id, p.board)), p.activeDays.filter((activeDay) => isoWeek(new Date(`${activeDay}T00:00:00Z`)) === slot.week).length);
    const balance = sqlite.prepare("SELECT cash_minor AS cashMinor FROM players WHERE id = ?").get(id) as { cashMinor: number };
    recordLedger(id, day, "hunt", fallbackCashMinor, balance.cashMinor, { hunt: hunt.id, ticker: slot.stockTicker, oraclePriceMinor: claimPriceMinor, rewardRarity: slot.rewardRarity, rewardValueMinor: slot.rewardValueMinor, points: slot.points, moduleRewardId });
    return { claimPriceMinor, fallbackCashMinor, moduleRewardId };
  })();
  if (!claimResult) return c.json({ error: "Hunt already claimed" }, 409);
  recordOnboardingMilestone(id, "onboarding_first_hunt_complete", "hunt.claim");
  if (slot.stockTicker) recordOnboardingMilestone(id, "onboarding_first_stock", "stock.reward");
  recordMeaningfulAction(id, `hunt:${slot.id}`);
  const snap = await snapshot(id);
  return c.json({ ...snap, dropped: slot.stockTicker, fallbackCashMinor: claimResult.fallbackCashMinor, rewardRarity: slot.rewardRarity, rewardValueMinor: slot.rewardValueMinor, moduleReward: slot.moduleReward ? { ...slot.moduleReward, label: moduleRewardLabel(slot.moduleReward), rewardId: claimResult.moduleRewardId } : null, huntPoints: slot.points });
});

const EventChoiceInput = z.object({ eventId: z.string(), decisionId: z.string() });

app.post("/api/event/choose", async (c) => {
  const id = c.req.header("x-player-id");
  if (!id) return c.json({ error: "x-player-id required" }, 401);
  const p = await settlePlayer(id);
  if (!p) return c.json({ error: "no plot" }, 404);
  const body = EventChoiceInput.parse(await c.req.json());
  let row = sqlite.prepare("SELECT * FROM plotgo_player_events WHERE player_id = ? AND id = ? AND status = 'active'").get(id, body.eventId) as Record<string, unknown> | undefined;
  if (!row) {
    const global = EVENT_CATALOG.find((candidate) => candidate.id === body.eventId && candidate.scope === "Global");
    if (global && global.playerChoice) {
      const currentGlobal = eventState(id, operatingBoard(p.board), marketStageForEmpireLevel(empireLevel(operatingBoard(p.board))), p.createdAt).global;
      if (currentGlobal.id !== global.id) return c.json({ error: "That global event is not active" }, 409);
      const cycle = ensureMarketCycle();
      const now = Date.now();
      const existing = sqlite.prepare("SELECT * FROM plotgo_player_events WHERE player_id = ? AND catalog_id = ? AND scope = 'Global' AND status = 'active'").get(id, global.id) as Record<string, unknown> | undefined;
      if (existing) row = existing;
      else {
        const eventId = newId();
        const endsAt = Math.min(cycle.endsAt, now + global.durationHours * 3_600_000);
        sqlite.prepare("INSERT INTO plotgo_player_events (id, player_id, catalog_id, scope, status, issued_at, starts_at, ends_at) VALUES (?, ?, ?, 'Global', 'active', ?, ?, ?)").run(eventId, id, global.id, now, now, endsAt);
        row = sqlite.prepare("SELECT * FROM plotgo_player_events WHERE id = ?").get(eventId) as Record<string, unknown>;
        auditEvent(id, eventId, "global_choice_open", { catalogId: global.id, endsAt });
      }
    }
  }
  if (!row) return c.json({ error: "Active event not found" }, 404);
  if (row.choice_id) return c.json({ error: "Event choice already resolved" }, 409);
  const event = EVENT_CATALOG.find((candidate) => candidate.id === String(row.catalog_id));
  const decision = EVENT_DECISIONS.find((candidate) => candidate.id === body.decisionId && candidate.eventId === event?.id);
  if (!event || !decision) return c.json({ error: "Invalid event decision" }, 400);
  if (p.cashMinor < decision.immediateCostMinor) return c.json({ error: "Not enough Cash for this decision" }, 400);
  const week = isoWeek();
  const remainingBudget = Math.max(0, EVENT_REWARD_RULES.weeklyCashCapMinor - eventRewardBudgetUsed(id, week));
  const cashReward = Math.min(decision.cashRewardMinor, remainingBudget);
  const nextCash = p.cashMinor - decision.immediateCostMinor + cashReward;
  const nextReputation = Math.max(0, Math.min(10_000, p.reputationBps + decision.modifier.reputationDelta * 100));
  const moduleReward = rollEventModuleReward(event.id, stableEventSeed(`${id}:${row.id}:${decision.id}`), "decision");
  const moduleRewardId = grantPendingModuleReward(id, "event_decision", String(row.id), moduleReward, { eventId: event.id, decisionId: decision.id });
  const resolution = { eventId: event.id, decisionId: decision.id, costMinor: decision.immediateCostMinor, cashRewardMinor: cashReward, eventPoints: decision.eventPoints, moduleRewardId, resolvedAt: Date.now() };
  await db.update(players).set({ cashMinor: nextCash, earnedMinor: p.earnedMinor + cashReward, reputationBps: nextReputation }).where(eq(players.id, id));
  sqlite.prepare("UPDATE plotgo_player_events SET choice_id = ?, resolution_json = ?, resolved_at = ? WHERE id = ? AND player_id = ? AND choice_id IS NULL").run(decision.id, JSON.stringify(resolution), Date.now(), row.id, id);
  if (cashReward > 0 || moduleRewardId) auditEvent(id, String(row.id), "reward", { amountMinor: cashReward, moduleRewardId, reason: "event_decision", decisionId: decision.id });
  addEventPerformance(id, week, marketStageForEmpireLevel(empireLevel(p.board)), decision.eventPoints);
  auditEvent(id, String(row.id), "decision", resolution);
  recordLedger(id, utcDay(), "event", cashReward - decision.immediateCostMinor, nextCash, resolution);
  recordMeaningfulAction(id, `event:${event.id}`);
  const snap = await snapshot(id);
  return c.json({ ...snap, moduleReward: moduleReward ? { ...moduleReward, label: moduleRewardLabel(moduleReward), rewardId: moduleRewardId } : null });
});

app.post("/api/event/mission/claim", async (c) => {
  const id = c.req.header("x-player-id");
  if (!id) return c.json({ error: "x-player-id required" }, 401);
  const p = await settlePlayer(id);
  if (!p) return c.json({ error: "no plot" }, 404);
  const body = z.object({ missionId: z.string().optional() }).parse(await c.req.json().catch(() => ({})));
  const row = (body.missionId
    ? sqlite.prepare("SELECT * FROM plotgo_event_missions WHERE player_id = ? AND id = ? AND status = 'active'").get(id, body.missionId)
    : sqlite.prepare("SELECT * FROM plotgo_event_missions WHERE player_id = ? AND status = 'active' ORDER BY issued_at DESC LIMIT 1").get(id)) as Record<string, unknown> | undefined;
  if (!row) return c.json({ error: "No active event mission" }, 404);
  const missionRow = eventMissionRow(row);
  const template = EVENT_MISSIONS.find((candidate) => candidate.id === missionRow.templateId);
  if (!template) return c.json({ error: "Mission template missing" }, 500);
  const day = utcDay();
  const dayData = districtDay(id, day);
  const marketEvent = marketEventForDay(day, id);
  const { map } = await loadFrags(id);
  const activeBoard = operatingBoard(p.board);
  const stage = marketStageForEmpireLevel(empireLevel(activeBoard));
  const eventLayer = eventState(id, activeBoard, stage, p.createdAt);
  const activeEvent = effectiveDistrictEvent(dayData.event, marketEvent, collectionBonuses(map).customerDemandBps, eventLayer.modifiers);
  const moduleEffects = moduleEffectsForBoard(id, activeBoard, [eventLayer.global.id, ...eventLayer.personalEvents.map((event) => event.id)], eventLayer.cycle.state);
  const archetype = archetypeResolutionForPlayer(id, activeBoard);
  const metrics = settleDistrict(activeBoard, activeEvent, "walk", { cashMinor: p.cashMinor, reputationBps: p.reputationBps, conditionBps: p.conditionBps }, dayData.seed, moduleEffects, archetype.effects);
  const progress = eventMissionProgress({ ...template, baseTarget: missionRow.target }, metrics, p);
  if (!progress.done) return c.json({ error: "Event mission not complete", progress }, 400);
  const week = isoWeek();
  const remainingBudget = Math.max(0, EVENT_REWARD_RULES.weeklyCashCapMinor - eventRewardBudgetUsed(id, week));
  const cashReward = Math.min(template.cashRewardMinor, remainingBudget);
  const nextCash = p.cashMinor + cashReward;
  const nextReputation = Math.max(0, Math.min(10_000, p.reputationBps + template.repReward * 100));
  const moduleReward = rollEventModuleReward(missionRow.eventId, stableEventSeed(`${id}:${missionRow.id}:${template.id}`), "mission");
  const moduleRewardId = grantPendingModuleReward(id, "event_mission", missionRow.id, moduleReward, { eventId: missionRow.eventId, templateId: template.id });
  await db.update(players).set({ cashMinor: nextCash, earnedMinor: p.earnedMinor + cashReward, reputationBps: nextReputation }).where(eq(players.id, id));
  sqlite.prepare("UPDATE plotgo_event_missions SET status = 'claimed', claimed_at = ?, reward_claimed = 1 WHERE id = ? AND player_id = ? AND status = 'active'").run(Date.now(), missionRow.id, id);
  if (cashReward > 0 || moduleRewardId) auditEvent(id, missionRow.id, "reward", { amountMinor: cashReward, moduleRewardId, reason: "event_mission", templateId: template.id });
  addEventPerformance(id, week, stage, template.eventPoints);
  const reward = { missionId: missionRow.id, templateId: template.id, cashRewardMinor: cashReward, repReward: template.repReward, eventPoints: template.eventPoints, moduleRewardId };
  auditEvent(id, missionRow.id, "mission_claim", reward);
  recordLedger(id, day, "event_mission", cashReward, nextCash, reward);
  recordMeaningfulAction(id, `event_mission:${missionRow.id}`);
  const snap = await snapshot(id);
  return c.json({ ...snap, moduleReward: moduleReward ? { ...moduleReward, label: moduleRewardLabel(moduleReward), rewardId: moduleRewardId } : null });
});

app.get("/api/events", async (c) => {
  const id = c.req.header("x-player-id");
  if (!id) return c.json({ error: "x-player-id required" }, 401);
  const snap = await snapshot(id);
  if (!snap) return c.json({ error: "no plot" }, 404);
  return c.json(snap.eventState);
});

function moduleLoadoutVersion(playerId: string, buildingId: string): number {
  const row = sqlite.prepare(`
    SELECT MAX(version) AS version FROM (
      SELECT loadout_version AS version FROM building_module_loadout WHERE player_id = ? AND building_id = ?
      UNION ALL
      SELECT loadout_version AS version FROM module_loadout_audit WHERE player_id = ? AND building_id = ?
    )
  `).get(playerId, buildingId, playerId, buildingId) as { version: number | null };
  return Number(row.version ?? 0);
}

function moduleLoadoutView(playerId: string, card: PlacedCard) {
  const profile = buildingModuleProfile(card.type);
  const unlockedSlots = moduleSlotsForRuntimeStage(card.type, card.stage);
  const rows = sqlite.prepare("SELECT slot_index AS slotIndex, module_id AS moduleId, effective_at AS effectiveAt, loadout_version AS loadoutVersion FROM building_module_loadout WHERE player_id = ? AND building_id = ? ORDER BY slot_index").all(playerId, card.id) as Record<string, unknown>[];
  const bySlot = new Map(rows.map((row) => [Number(row.slotIndex), row]));
  const slots = Array.from({ length: profile.maxModuleSlots }, (_, slotIndex) => {
    const row = bySlot.get(slotIndex);
    const entry = row?.moduleId ? moduleEntry(String(row.moduleId)) : null;
    return {
      slotIndex,
      unlocked: slotIndex < unlockedSlots,
      unlockLevel: profile.slotUnlockLevels[slotIndex] ?? null,
      module: entry ? { moduleId: entry.id, name: entry.name, rarity: entry.rarity.toLowerCase(), category: entry.category, primaryPower: entry.primaryPower, secondaryPower: entry.secondaryPower, condition: entry.condition } : null,
      effectiveAt: row?.effectiveAt == null ? null : Number(row.effectiveAt),
      loadoutVersion: Number(row?.loadoutVersion ?? moduleLoadoutVersion(playerId, card.id)),
    };
  });
  const events = eventState(playerId, [card], marketStageForEmpireLevel(empireLevel([card])), Date.now()).moduleLocks.filter((lock) => lock.buildingId === card.id);
  const effects = moduleEffectsForBoard(playerId, [card], events.map((lock) => lock.eventId));
  return {
    buildingId: card.id,
    buildingType: card.type,
    buildingFamily: moduleBuildingFamily(card.type),
    buildingStage: card.stage,
    profile,
    loadoutVersion: moduleLoadoutVersion(playerId, card.id),
    slots,
    effectiveAt: effectiveAtBoundary(),
    effects: effects[card.id],
    locks: events,
  };
}

function moduleLoadoutSummaries(playerId: string, board: PlacedCard[]) {
  return board.map((card) => {
    const profile = buildingModuleProfile(card.type);
    const unlockedSlots = moduleSlotsForRuntimeStage(card.type, card.stage);
    const rows = sqlite.prepare("SELECT slot_index AS slotIndex, module_id AS moduleId, effective_at AS effectiveAt FROM building_module_loadout WHERE player_id = ? AND building_id = ? ORDER BY slot_index").all(playerId, card.id) as Record<string, unknown>[];
    return {
      buildingId: card.id,
      buildingType: card.type,
      buildingStage: card.stage,
      loadoutVersion: moduleLoadoutVersion(playerId, card.id),
      maxModuleSlots: profile.maxModuleSlots,
      unlockedSlots,
      slots: rows.map((row) => ({
        slotIndex: Number(row.slotIndex),
        moduleId: String(row.moduleId),
        module: moduleEntry(String(row.moduleId))?.name ?? String(row.moduleId),
        rarity: moduleEntry(String(row.moduleId))?.rarity.toLowerCase() ?? "common",
        effectiveAt: Number(row.effectiveAt),
      })),
    };
  });
}

function moduleLockForBuilding(playerId: string, card: PlacedCard): string | null {
  const stage = marketStageForEmpireLevel(empireLevel([card]));
  const locks = eventState(playerId, [card], stage, Date.now()).moduleLocks.filter((lock) => lock.buildingId === card.id);
  return locks[0]?.reason ?? null;
}

function masteryTierRows(playerId: string, buildingType: string) {
  const type = resolveType(buildingType);
  const player = sqlite.prepare("SELECT active_days AS activeDays, reputation_bps AS reputationBps, transactions, volume_minor AS volumeMinor FROM players WHERE id = ?").get(playerId) as { activeDays: string; reputationBps: number; transactions: number; volumeMinor: number } | undefined;
  let activeDays: string[] = [];
  try { activeDays = JSON.parse(player?.activeDays ?? "[]") as string[]; } catch { activeDays = []; }
  const board = sqlite.prepare("SELECT stage FROM cards WHERE player_id = ? AND type = ?").all(playerId, type) as { stage: number }[];
  const maxStage = Math.max(0, ...board.map((row) => Number(row.stage)));
  const metrics = { activeDays: activeDays.length, buildingCount: board.length, maxStage, reputation: Number(player?.reputationBps ?? 0) / 100, transactions: Number(player?.transactions ?? 0), volume: Number(player?.volumeMinor ?? 0) };
  const objectives = [
    { tier: 1, text: "Place the building and complete one active day.", complete: metrics.buildingCount > 0 && metrics.activeDays >= 1 },
    { tier: 2, text: "Operate the building at Stage 2 with 10 transactions.", complete: metrics.maxStage >= 2 && metrics.transactions >= 10 },
    { tier: 3, text: "Operate for 3 active days with 60 reputation.", complete: metrics.buildingCount > 0 && metrics.activeDays >= 3 && metrics.reputation >= 60 },
    { tier: 4, text: "Reach Stage 3 and 50 transactions.", complete: metrics.maxStage >= 3 && metrics.transactions >= 50 },
    { tier: 5, text: "Operate for 7 active days and reach 100 transactions.", complete: metrics.buildingCount > 0 && metrics.activeDays >= 7 && metrics.transactions >= 100 },
  ];
  const existing = sqlite.prepare("SELECT tier, progress_json AS progressJson, status, completed_at AS completedAt, claimed_at AS claimedAt FROM building_mastery_progress WHERE player_id = ? AND building_type = ? ORDER BY tier").all(playerId, type) as Record<string, unknown>[];
  const byTier = new Map(existing.map((row) => [Number(row.tier), row]));
  const maxRarityByTier = ["common", "uncommon", "rare", "epic", "legendary"] as const;
  const rarityRank: Record<string, number> = { common: 0, uncommon: 1, rare: 2, epic: 3, legendary: 4 };
  return objectives.map((objective) => {
    const row = byTier.get(objective.tier);
    const complete = objective.complete;
    const status = row?.claimedAt != null ? "claimed" : complete ? "complete" : "active";
    sqlite.prepare(`
      INSERT INTO building_mastery_progress (player_id, building_type, tier, progress_json, status, completed_at, claimed_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(player_id, building_type, tier) DO UPDATE SET progress_json = excluded.progress_json, status = CASE WHEN building_mastery_progress.claimed_at IS NOT NULL THEN 'claimed' ELSE excluded.status END, completed_at = COALESCE(building_mastery_progress.completed_at, excluded.completed_at)
    `).run(playerId, type, objective.tier, JSON.stringify({ ...metrics, objective: objective.text }), status, complete ? (Number(row?.completedAt ?? 0) || Date.now()) : null, row?.claimedAt ?? null);
    const compatible = canonicalModuleCatalog().filter((entry) => moduleEquippable(type, entry.id) && rarityRank[entry.rarity.toLowerCase()] <= rarityRank[maxRarityByTier[objective.tier - 1]!]);
    const choices = compatible.slice(0, objective.tier >= 4 ? 2 : 3).map((entry) => ({ moduleId: entry.id, name: entry.name, rarity: entry.rarity.toLowerCase(), category: entry.category, primaryPower: entry.primaryPower, secondaryPower: entry.secondaryPower }));
    return { tier: objective.tier, objective: objective.text, progress: metrics, status, complete, claimedAt: row?.claimedAt == null ? null : Number(row.claimedAt), choices };
  });
}

function resolveCraftJobs(playerId: string) {
  const now = Date.now();
  const rows = sqlite.prepare("SELECT * FROM module_craft_jobs WHERE player_id = ? AND status = 'pending' AND completes_at <= ? ORDER BY completes_at").all(playerId, now) as Record<string, unknown>[];
  sqlite.transaction(() => {
    for (const row of rows) {
      const updated = sqlite.prepare("UPDATE module_craft_jobs SET status = 'completed', completed_at = ? WHERE craft_id = ? AND status = 'pending'").run(now, row.craft_id);
      if (updated.changes === 1) grantModuleInventory(playerId, String(row.module_id), 1, now);
    }
  })();
}

function craftRows(playerId: string) {
  resolveCraftJobs(playerId);
  return (sqlite.prepare("SELECT craft_id AS craftId, module_id AS moduleId, rarity, parts_cost AS partsCost, started_at AS startedAt, completes_at AS completesAt, status, completed_at AS completedAt FROM module_craft_jobs WHERE player_id = ? ORDER BY created_at DESC LIMIT 50").all(playerId) as Record<string, unknown>[]).map((row) => ({
    ...row,
    name: moduleEntry(String(row.moduleId))?.name ?? String(row.moduleId),
  }));
}

app.get("/api/modules", async (c) => {
  const id = c.req.header("x-player-id");
  if (!id) return c.json({ error: "x-player-id required" }, 401);
  const [player] = await db.select().from(players).where(eq(players.id, id));
  if (!player) return c.json({ error: "no plot" }, 404);
  return c.json({ configVersion: MODULE_CONFIG_VERSION, catalog: moduleInventoryRows(id), inventory: moduleInventoryRows(id).filter((module) => module.quantityOwned > 0), parts: modulePartsRows(id), crafts: craftRows(id) });
});

app.get("/api/buildings/:buildingId/modules", async (c) => {
  const id = c.req.header("x-player-id");
  if (!id) return c.json({ error: "x-player-id required" }, 401);
  const [player] = await db.select().from(players).where(eq(players.id, id));
  if (!player) return c.json({ error: "no plot" }, 404);
  const board = await loadCards(id);
  const card = board.find((candidate) => candidate.id === c.req.param("buildingId"));
  if (!card) return c.json({ error: "building not found" }, 404);
  return c.json({ loadout: moduleLoadoutView(id, card), inventory: moduleInventoryRows(id).filter((module) => module.quantityAvailable > 0) });
});

const EquipModule = z.object({ slot: z.number().int().min(0).max(3), moduleId: z.string(), expectedLoadoutVersion: z.number().int().nonnegative().optional(), idempotencyKey: z.string().min(8).max(128).optional() });

app.post("/api/buildings/:buildingId/modules/equip", async (c) => {
  const id = c.req.header("x-player-id");
  if (!id) return c.json({ error: "x-player-id required" }, 401);
  const [player] = await db.select().from(players).where(eq(players.id, id));
  if (!player) return c.json({ error: "no plot" }, 404);
  const board = await loadCards(id);
  const card = board.find((candidate) => candidate.id === c.req.param("buildingId"));
  if (!card) return c.json({ error: "building not found" }, 404);
  const body = EquipModule.parse(await c.req.json());
  const entry = moduleEntry(body.moduleId);
  const definition = body.moduleId ? moduleDefinition(body.moduleId) : null;
  if (!entry || !definition) return c.json({ error: "module not found" }, 404);
  const profile = buildingModuleProfile(card.type);
  const unlockedSlots = moduleSlotsForRuntimeStage(card.type, card.stage);
  if (body.slot >= profile.maxModuleSlots || body.slot >= unlockedSlots) return c.json({ error: "module slot is locked" }, 409);
  if (!moduleEquippable(card.type, entry.id, currentEmpireLevel(id, board)) || !moduleStageAllowedAtEmpireLevel(entry.id, currentEmpireLevel(id, board))) return c.json({ error: "module is not compatible with this building's stage, rarity, family, category, or Empire Level" }, 400);
  const lock = moduleLockForBuilding(id, card);
  if (lock) return c.json({ error: lock }, 409);
  const key = body.idempotencyKey ?? newId();
  try {
    sqlite.transaction(() => {
      const prior = sqlite.prepare("SELECT loadout_version AS version FROM module_loadout_audit WHERE player_id = ? AND building_id = ? AND idempotency_key = ?").get(id, card.id, key) as { version: number } | undefined;
      if (prior) return;
      const currentVersion = moduleLoadoutVersion(id, card.id);
      if (body.expectedLoadoutVersion != null && body.expectedLoadoutVersion !== currentVersion) throw new Error("loadout version conflict");
      const old = sqlite.prepare("SELECT module_id AS moduleId FROM building_module_loadout WHERE player_id = ? AND building_id = ? AND slot_index = ?").get(id, card.id, body.slot) as { moduleId: string } | undefined;
      if (old?.moduleId === body.moduleId) return;
      const available = sqlite.prepare("SELECT quantity_owned - quantity_equipped AS available FROM player_module_inventory WHERE player_id = ? AND module_id = ?").get(id, body.moduleId) as { available: number } | undefined;
      if (Number(available?.available ?? 0) <= 0) throw new Error("module is not available in inventory");
      const duplicate = sqlite.prepare("SELECT 1 AS present FROM building_module_loadout WHERE player_id = ? AND building_id = ? AND module_id = ? AND slot_index <> ?").get(id, card.id, body.moduleId, body.slot) as { present: number } | undefined;
      if (duplicate) throw new Error("a building cannot equip the same module twice");
      if (entry.rarity.toLowerCase() === "legendary") {
        const legendary = sqlite.prepare("SELECT COUNT(*) AS count FROM building_module_loadout l JOIN module_config m ON m.module_id = l.module_id AND m.config_version = ? WHERE l.player_id = ? AND l.building_id = ? AND lower(m.rarity) = 'legendary'").get(MODULE_CONFIG_VERSION, id, card.id) as { count: number };
        if (Number(legendary.count) >= 1 && old?.moduleId !== body.moduleId) throw new Error("only one Legendary Module may be equipped on a building");
      }
      const nextVersion = currentVersion + 1;
      if (old) sqlite.prepare("UPDATE player_module_inventory SET quantity_equipped = MAX(0, quantity_equipped - 1), row_version = row_version + 1 WHERE player_id = ? AND module_id = ?").run(id, old.moduleId);
      sqlite.prepare("DELETE FROM building_module_loadout WHERE player_id = ? AND building_id = ? AND slot_index = ?").run(id, card.id, body.slot);
      sqlite.prepare("INSERT INTO building_module_loadout (player_id, building_id, slot_index, module_id, effective_at, loadout_version) VALUES (?, ?, ?, ?, ?, ?)").run(id, card.id, body.slot, body.moduleId, effectiveAtBoundary(), nextVersion);
      sqlite.prepare("UPDATE player_module_inventory SET quantity_equipped = quantity_equipped + 1, row_version = row_version + 1 WHERE player_id = ? AND module_id = ?").run(id, body.moduleId);
      sqlite.prepare("INSERT INTO module_loadout_audit (event_id, player_id, building_id, slot_index, module_id, action, effective_at, loadout_version, idempotency_key, created_at) VALUES (?, ?, ?, ?, ?, 'equip', ?, ?, ?, ?)").run(newId(), id, card.id, body.slot, body.moduleId, effectiveAtBoundary(), nextVersion, key, Date.now());
    })();
  } catch (error) {
    return c.json({ error: error instanceof Error ? error.message : "module equip failed" }, 409);
  }
  recordMeaningfulAction(id, `module_equip:${card.id}:${body.slot}`);
  return c.json({ loadout: moduleLoadoutView(id, card) });
});

const UnequipModule = z.object({ slot: z.number().int().min(0).max(3), expectedLoadoutVersion: z.number().int().nonnegative().optional(), idempotencyKey: z.string().min(8).max(128).optional() });

app.post("/api/buildings/:buildingId/modules/unequip", async (c) => {
  const id = c.req.header("x-player-id");
  if (!id) return c.json({ error: "x-player-id required" }, 401);
  const [player] = await db.select().from(players).where(eq(players.id, id));
  if (!player) return c.json({ error: "no plot" }, 404);
  const board = await loadCards(id);
  const card = board.find((candidate) => candidate.id === c.req.param("buildingId"));
  if (!card) return c.json({ error: "building not found" }, 404);
  const body = UnequipModule.parse(await c.req.json());
  if (body.slot >= buildingModuleProfile(card.type).maxModuleSlots) return c.json({ error: "invalid module slot" }, 400);
  const lock = moduleLockForBuilding(id, card);
  if (lock) return c.json({ error: lock }, 409);
  const key = body.idempotencyKey ?? newId();
  try {
    sqlite.transaction(() => {
      const prior = sqlite.prepare("SELECT 1 FROM module_loadout_audit WHERE player_id = ? AND building_id = ? AND idempotency_key = ?").get(id, card.id, key);
      if (prior) return;
      const currentVersion = moduleLoadoutVersion(id, card.id);
      if (body.expectedLoadoutVersion != null && body.expectedLoadoutVersion !== currentVersion) throw new Error("loadout version conflict");
      const row = sqlite.prepare("SELECT module_id AS moduleId FROM building_module_loadout WHERE player_id = ? AND building_id = ? AND slot_index = ?").get(id, card.id, body.slot) as { moduleId: string } | undefined;
      if (!row) return;
      const nextVersion = currentVersion + 1;
      sqlite.prepare("DELETE FROM building_module_loadout WHERE player_id = ? AND building_id = ? AND slot_index = ?").run(id, card.id, body.slot);
      sqlite.prepare("UPDATE player_module_inventory SET quantity_equipped = MAX(0, quantity_equipped - 1), row_version = row_version + 1 WHERE player_id = ? AND module_id = ?").run(id, row.moduleId);
      sqlite.prepare("INSERT INTO module_loadout_audit (event_id, player_id, building_id, slot_index, module_id, action, effective_at, loadout_version, idempotency_key, created_at) VALUES (?, ?, ?, ?, ?, 'unequip', ?, ?, ?, ?)").run(newId(), id, card.id, body.slot, row.moduleId, effectiveAtBoundary(), nextVersion, key, Date.now());
    })();
  } catch (error) {
    return c.json({ error: error instanceof Error ? error.message : "module unequip failed" }, 409);
  }
  recordMeaningfulAction(id, `module_unequip:${card.id}:${body.slot}`);
  return c.json({ loadout: moduleLoadoutView(id, card) });
});

app.get("/api/building-mastery", async (c) => {
  const id = c.req.header("x-player-id");
  if (!id) return c.json({ error: "x-player-id required" }, 401);
  const [player] = await db.select().from(players).where(eq(players.id, id));
  if (!player) return c.json({ error: "no plot" }, 404);
  const requested = c.req.query("buildingType");
  const types = requested ? [resolveType(requested)] : [...new Set((await loadCards(id)).map((card) => resolveType(card.type)))];
  return c.json({ mastery: types.map((type) => ({ buildingType: type, tiers: masteryTierRows(id, type) })) });
});

app.post("/api/building-mastery/claim", async (c) => {
  const id = c.req.header("x-player-id");
  if (!id) return c.json({ error: "x-player-id required" }, 401);
  const [player] = await db.select().from(players).where(eq(players.id, id));
  if (!player) return c.json({ error: "no plot" }, 404);
  const body = z.object({ buildingType: z.string(), tier: z.number().int().min(1).max(5), choiceIndex: z.number().int().min(0).max(2), idempotencyKey: z.string().min(8).max(128).optional() }).parse(await c.req.json());
  const type = resolveType(body.buildingType);
  const tiers = masteryTierRows(id, type);
  const tier = tiers.find((candidate) => candidate.tier === body.tier);
  if (!tier || !tier.complete || tier.status === "claimed") return c.json({ error: "mastery tier is not claimable" }, 409);
  const choice = tier.choices[body.choiceIndex];
  if (!choice) return c.json({ error: "invalid mastery choice" }, 400);
  const key = body.idempotencyKey ?? newId();
  const sourceEventId = `${type}:${body.tier}`;
  try {
    sqlite.transaction(() => {
      const prior = sqlite.prepare("SELECT claimed_at AS claimedAt FROM building_mastery_progress WHERE player_id = ? AND building_type = ? AND tier = ?").get(id, type, body.tier) as { claimedAt: number | null } | undefined;
      if (prior?.claimedAt != null) return;
      const reward: ModuleReward = { kind: "module", rarity: choice.rarity as ModuleReward["rarity"], quantity: 1, partsAmount: 0, compatibleFamily: moduleBuildingFamily(type), moduleId: choice.moduleId, moduleName: choice.name };
      grantPendingModuleReward(id, "mastery", sourceEventId, reward, { buildingType: type, tier: body.tier, choiceIndex: body.choiceIndex, idempotencyKey: key });
      sqlite.prepare("UPDATE building_mastery_progress SET status = 'claimed', claimed_at = ?, row_version = row_version + 1 WHERE player_id = ? AND building_type = ? AND tier = ? AND claimed_at IS NULL").run(Date.now(), id, type, body.tier);
    })();
  } catch (error) {
    return c.json({ error: error instanceof Error ? error.message : "mastery claim failed" }, 409);
  }
  recordMeaningfulAction(id, `mastery:${type}:${body.tier}`);
  return c.json({ module: choice, mastery: masteryTierRows(id, type).find((candidate) => candidate.tier === body.tier) });
});

app.post("/api/modules/dismantle", async (c) => {
  const id = c.req.header("x-player-id");
  if (!id) return c.json({ error: "x-player-id required" }, 401);
  const [player] = await db.select().from(players).where(eq(players.id, id));
  if (!player) return c.json({ error: "no plot" }, 404);
  const body = z.object({ moduleId: z.string(), quantity: z.number().int().min(1).max(100), idempotencyKey: z.string().min(8).max(128).optional() }).parse(await c.req.json());
  const entry = moduleEntry(body.moduleId);
  if (!entry) return c.json({ error: "module not found" }, 404);
  const key = body.idempotencyKey ?? newId();
  const source = "dismantle";
  const sourceEventId = `${key}:${body.moduleId}`;
  try {
    sqlite.transaction(() => {
      const available = sqlite.prepare("SELECT quantity_owned - quantity_equipped AS available FROM player_module_inventory WHERE player_id = ? AND module_id = ?").get(id, body.moduleId) as { available: number } | undefined;
      if (Number(available?.available ?? 0) < body.quantity) throw new Error("not enough un-equipped copies");
      const changed = sqlite.prepare("UPDATE player_module_inventory SET quantity_owned = quantity_owned - ?, row_version = row_version + 1 WHERE player_id = ? AND module_id = ? AND quantity_owned - quantity_equipped >= ?").run(body.quantity, id, body.moduleId, body.quantity);
      if (changed.changes !== 1) throw new Error("inventory changed; retry");
      grantModuleParts(id, entry.rarity.toLowerCase(), entry.dismantleParts * body.quantity, source, sourceEventId);
    })();
  } catch (error) {
    return c.json({ error: error instanceof Error ? error.message : "dismantle failed" }, 409);
  }
  recordMeaningfulAction(id, `module_dismantle:${body.moduleId}`);
  return c.json({ moduleId: body.moduleId, dismantled: body.quantity, parts: entry.dismantleParts * body.quantity, partsBalance: modulePartsRows(id) });
});

function stageGateSatisfied(playerId: string, gate: string): boolean {
  const cardsForStage = sqlite.prepare("SELECT stage FROM cards WHERE player_id = ?").all(playerId) as { stage: number }[];
  const stage = marketStageForEmpireLevel(empireLevel(cardsForStage));
  const normalized = gate.toLowerCase();
  const required = normalized.includes("tycoon") ? "tycoon" : normalized.includes("elite") ? "elite" : normalized.includes("established") ? "established" : normalized.includes("growing") ? "growing" : normalized.includes("starter") ? "starter" : "humble";
  const rank: Record<string, number> = { humble: 0, starter: 1, growing: 2, established: 3, elite: 4, tycoon: 5 };
  return rank[stage] >= rank[required];
}

app.post("/api/modules/craft", async (c) => {
  const id = c.req.header("x-player-id");
  if (!id) return c.json({ error: "x-player-id required" }, 401);
  const [player] = await db.select().from(players).where(eq(players.id, id));
  if (!player) return c.json({ error: "no plot" }, 404);
  const body = z.object({ moduleId: z.string(), idempotencyKey: z.string().min(8).max(128).optional() }).parse(await c.req.json());
  const entry = moduleEntry(body.moduleId);
  if (!entry) return c.json({ error: "module not found" }, 404);
  if (!stageGateSatisfied(id, entry.stageGate)) return c.json({ error: `Module requires ${entry.stageGate}` }, 409);
  const key = body.idempotencyKey ?? newId();
  resolveCraftJobs(id);
  const existing = sqlite.prepare("SELECT craft_id AS craftId FROM module_craft_jobs WHERE player_id = ? AND idempotency_key = ?").get(id, key) as { craftId: string } | undefined;
  if (existing) return c.json({ crafts: craftRows(id) });
  const now = Date.now();
  const craftId = newId();
  try {
    sqlite.transaction(() => {
      const balance = sqlite.prepare("SELECT balance FROM module_parts_balance WHERE player_id = ? AND rarity = ?").get(id, entry.rarity.toLowerCase()) as { balance: number } | undefined;
      if (Number(balance?.balance ?? 0) < entry.craftCost) throw new Error(`requires ${entry.craftCost} ${entry.rarity} Parts`);
      const deducted = sqlite.prepare("UPDATE module_parts_balance SET balance = balance - ?, row_version = row_version + 1 WHERE player_id = ? AND rarity = ? AND balance >= ?").run(entry.craftCost, id, entry.rarity.toLowerCase(), entry.craftCost);
      if (deducted.changes !== 1) throw new Error("Parts balance changed; retry");
      sqlite.prepare("INSERT INTO module_parts_ledger (entry_id, player_id, rarity, delta, source, source_event_id, created_at) VALUES (?, ?, ?, ?, 'craft', ?, ?)").run(newId(), id, entry.rarity.toLowerCase(), -entry.craftCost, craftId, now);
      sqlite.prepare("INSERT INTO module_craft_jobs (craft_id, player_id, module_id, rarity, parts_cost, started_at, completes_at, status, idempotency_key, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, 'pending', ?, ?)").run(craftId, id, entry.id, entry.rarity.toLowerCase(), entry.craftCost, now, now + entry.craftTimeMin * 60_000, key, now);
    })();
  } catch (error) {
    return c.json({ error: error instanceof Error ? error.message : "craft failed" }, 409);
  }
  recordMeaningfulAction(id, `module_craft:${entry.id}`);
  return c.json({ craftId, moduleId: entry.id, name: entry.name, completesAt: now + entry.craftTimeMin * 60_000, crafts: craftRows(id) });
});

app.get("/api/modules/crafts", async (c) => {
  const id = c.req.header("x-player-id");
  if (!id) return c.json({ error: "x-player-id required" }, 401);
  const [player] = await db.select().from(players).where(eq(players.id, id));
  if (!player) return c.json({ error: "no plot" }, 404);
  return c.json({ crafts: craftRows(id) });
});

app.get("/api/modules/rewards", async (c) => {
  const id = c.req.header("x-player-id");
  if (!id) return c.json({ error: "x-player-id required" }, 401);
  const [player] = await db.select().from(players).where(eq(players.id, id));
  if (!player) return c.json({ error: "no plot" }, 404);
  return c.json({ rewards: pendingModuleRewards(id) });
});

app.post("/api/offline/summary/view", async (c) => {
  const id = c.req.header("x-player-id");
  if (!id) return c.json({ error: "x-player-id required" }, 401);
  const [player] = await db.select().from(players).where(eq(players.id, id));
  if (!player) return c.json({ error: "no plot" }, 404);
  const body = z.object({ summaryId: z.string().optional() }).parse(await c.req.json().catch(() => ({})));
  const result = body.summaryId
    ? sqlite.prepare("UPDATE plotgo_offline_summaries SET viewed_at = ? WHERE summary_id = ? AND player_id = ? AND viewed_at IS NULL").run(Date.now(), body.summaryId, id)
    : sqlite.prepare("UPDATE plotgo_offline_summaries SET viewed_at = ? WHERE summary_id = (SELECT summary_id FROM plotgo_offline_summaries WHERE player_id = ? AND viewed_at IS NULL ORDER BY returned_at DESC LIMIT 1)").run(Date.now(), id);
  return c.json({ viewed: result.changes === 1 });
});

app.get("/api/performance", async (c) => {
  const id = c.req.header("x-player-id");
  if (!id) return c.json({ error: "x-player-id required" }, 401);
  const snap = await snapshot(id);
  if (!snap) return c.json({ error: "no plot" }, 404);
  recordOnboardingMilestone(id, "onboarding_first_portfolio", "portfolio.view");
  recordOnboardingMilestone(id, "onboarding_first_performance", "performance.view");
  return c.json({ performance: snap.performance, plotBalance: snap.plotBalance });
});

app.post("/api/performance/finalize", async (c) => {
  const body = await c.req.json().catch(() => ({})) as { week?: unknown };
  const week = typeof body.week === "string" && /^\d{4}-W\d{2}$/.test(body.week)
    ? body.week
    : isoWeek(new Date(Date.now() - 7 * 86_400_000));
  return c.json(finalizePerformanceWeek(week));
});

app.post("/api/performance/claim", async (c) => {
  const id = c.req.header("x-player-id");
  if (!id) return c.json({ error: "x-player-id required" }, 401);
  const body = await c.req.json().catch(() => ({})) as { week?: unknown };
  const week = typeof body.week === "string" && /^\d{4}-W\d{2}$/.test(body.week)
    ? body.week
    : isoWeek(new Date(Date.now() - 7 * 86_400_000));
  const row = sqlite.prepare("SELECT payout_plot AS payoutPlot, finalized, claimed_at AS claimedAt FROM weekly_performance WHERE player_id = ? AND week = ?").get(id, week) as
    | { payoutPlot: number; finalized: number; claimedAt: number | null }
    | undefined;
  if (!row) return c.json({ error: "No weekly performance record" }, 404);
  if (row.finalized !== 1) return c.json({ error: "Weekly performance is not finalized" }, 400);
  if (row.claimedAt != null) return c.json({ error: "Payout already claimed" }, 400);
  if (row.payoutPlot <= 0) return c.json({ error: "No payout available" }, 400);
  const claimedAt = Date.now();
  const updated = sqlite.prepare("UPDATE weekly_performance SET claimed_at = ? WHERE player_id = ? AND week = ? AND claimed_at IS NULL").run(claimedAt, id, week);
  if (updated.changes !== 1) return c.json({ error: "Payout already claimed" }, 409);
  sqlite.prepare("UPDATE players SET plot_balance = plot_balance + ? WHERE id = ?").run(row.payoutPlot, id);
  const snap = await snapshot(id);
  return c.json({ ...snap, claimedWeek: week, claimedPlot: row.payoutPlot });
});

app.get("/api/leaderboard", async (c) => {
  const rows = await db.select().from(players);
  const ranked = [];
  for (const r of rows) {
    const board = await loadCards(r.id);
    const { units } = await loadFrags(r.id);
    const ev = empireValueMinor(r.cashMinor, board, units);
    ranked.push({
      playerId: r.id.slice(0, 8),
      empireValue: displayCash(ev),
      empireValueMinor: ev,
      founder: true,
    });
  }
  ranked.sort((a, b) => b.empireValueMinor - a.empireValueMinor);
  return c.json({ board: ranked.slice(0, 25) });
});

const port = Number(process.env.PORT ?? 8787);
serve({ fetch: app.fetch, port }, () => {
  console.log(`PlotGo API http://localhost:${port}`);
});
