import {
  DIFFICULTY_RULES,
  MARKET_HUNTS,
  MARKET_STOCKS,
  chooseDifficulty,
  eventEligible,
  marketStageIndex,
  type HuntDifficulty,
  type MarketHuntTemplate,
  type MarketStage,
  type ModuleReward,
  type PlacedCard,
  type RewardRarity,
} from "@plotgo/game";
import { prisma } from "../../infrastructure/postgres/client";
import { num } from "../../shared/types";
import { moduleEntry } from "../modules/modules.service";

// ---------------------------------------------------------------------------
// Oracle prices
// ---------------------------------------------------------------------------

export async function oraclePriceMinor(ticker: string, now = Date.now()): Promise<number> {
  const stock = MARKET_STOCKS.find((candidate) => candidate.ticker === ticker) ?? MARKET_STOCKS[0]!;
  const row = await prisma.marketOraclePrice.findUnique({ where: { ticker } });
  if (row && now - num(row.refreshedAt) < 5 * 60_000) return num(row.priceMinor);
  if (!row) {
    await prisma.marketOraclePrice.create({ data: { ticker, priceMinor: stock.oraclePriceMinor, refreshedAt: now } });
    return stock.oraclePriceMinor;
  }
  const bucket = Math.floor(now / (5 * 60_000));
  let hash = bucket;
  for (const char of ticker) hash = Math.imul(hash ^ char.charCodeAt(0), 16_777_619);
  const movementBps = ((hash >>> 0) % 1001) - 500;
  const priceMinor = Math.max(100, Math.round(stock.oraclePriceMinor * (10_000 + movementBps) / 10_000));
  await prisma.marketOraclePrice.update({ where: { ticker }, data: { priceMinor, refreshedAt: now } });
  return priceMinor;
}

// ---------------------------------------------------------------------------
// Market reward pool
// ---------------------------------------------------------------------------

export async function ensureMarketPool(week: string) {
  await prisma.marketRewardPool.createMany({
    data: MARKET_STOCKS.map((stock) => ({
      week,
      ticker: stock.ticker,
      allocatedMinor: Math.round(500_000 * stock.allocationBps / 10_000),
      reservedMinor: 0,
      claimedMinor: 0,
    })),
    skipDuplicates: true,
  });
}

export async function reserveMarketReward(week: string, ticker: string, amountMinor: number): Promise<boolean> {
  const row = await prisma.marketRewardPool.findUnique({ where: { week_ticker: { week, ticker } } });
  if (!row) return false;
  const now = new Date();
  const utcDay = now.getUTCDay() || 7;
  const monday = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - utcDay + 1);
  const weekEnd = monday + 7 * 86_400_000;
  const reserveCeiling = now.getTime() >= weekEnd - 24 * 3_600_000 ? num(row.allocatedMinor) : Math.floor(num(row.allocatedMinor) * 0.95);
  // Conditional reserve: only when reserved + claimed + amount stays within the ceiling.
  const result = await prisma.$executeRaw`
    UPDATE market_reward_pool
    SET "reservedMinor" = "reservedMinor" + ${amountMinor}
    WHERE week = ${week} AND ticker = ${ticker}
      AND "reservedMinor" + "claimedMinor" + ${amountMinor} <= ${reserveCeiling}
  `;
  return result === 1;
}

export async function poolConsumption(week: string): Promise<number> {
  const aggregate = await prisma.marketRewardPool.aggregate({ where: { week }, _sum: { reservedMinor: true, claimedMinor: true } });
  return Math.min(1, (num(aggregate._sum.reservedMinor) + num(aggregate._sum.claimedMinor)) / 500_000);
}

export async function releaseMarketReservation(slot: { stockTicker: string | null; reservedMinor: number; week: string }) {
  if (slot.stockTicker && slot.reservedMinor > 0) {
    await prisma.$executeRaw`
      UPDATE market_reward_pool SET "reservedMinor" = GREATEST(0, "reservedMinor" - ${slot.reservedMinor})
      WHERE week = ${slot.week} AND ticker = ${slot.stockTicker}
    `;
  }
}

export async function claimMarketReservation(slot: { stockTicker: string | null; reservedMinor: number; week: string }) {
  if (slot.stockTicker && slot.reservedMinor > 0) {
    await prisma.$executeRaw`
      UPDATE market_reward_pool SET "reservedMinor" = GREATEST(0, "reservedMinor" - ${slot.reservedMinor}), "claimedMinor" = "claimedMinor" + ${slot.reservedMinor}
      WHERE week = ${slot.week} AND ticker = ${slot.stockTicker}
    `;
  }
}
// ---------------------------------------------------------------------------
// Market hunts
// ---------------------------------------------------------------------------

export type MarketHuntSlot = {
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
  // Offer-board lifecycle: unstarted offers expire at the next UTC reset;
  // started hunts keep their own real-time expiry (spec sheet 05).
  started: boolean;
};

export function marketHuntRow(row: {
  id: string; playerId: string; issuedDay: string; week: string; templateId: string; difficulty: string; rewardRarity: string;
  stockTicker: string | null; rewardValueMinor: bigint; moduleRewardKind: string | null; moduleRewardRarity: string | null;
  moduleRewardModuleId: string | null; moduleRewardQuantity: number; moduleRewardParts: number; points: number; target: number;
  issuedAt: bigint; expiresAt: bigint; status: string; claimedAt: bigint | null; reservedMinor: bigint; started: boolean;
}): MarketHuntSlot {
  const moduleRewardKind = row.moduleRewardKind === "module" || row.moduleRewardKind === "parts" ? row.moduleRewardKind as ModuleReward["kind"] : null;
  const moduleReward = moduleRewardKind && row.moduleRewardRarity
    ? {
        kind: moduleRewardKind,
        rarity: row.moduleRewardRarity as ModuleReward["rarity"],
        quantity: row.moduleRewardQuantity ?? 1,
        partsAmount: row.moduleRewardParts ?? 0,
        compatibleFamily: null,
        moduleId: row.moduleRewardModuleId,
        moduleName: row.moduleRewardModuleId == null ? null : moduleEntry(row.moduleRewardModuleId)?.name ?? null,
      }
    : null;
  return {
    id: row.id,
    playerId: row.playerId,
    issuedDay: row.issuedDay,
    week: row.week,
    templateId: row.templateId,
    difficulty: row.difficulty as HuntDifficulty,
    rewardRarity: row.rewardRarity as RewardRarity,
    stockTicker: row.stockTicker,
    rewardValueMinor: num(row.rewardValueMinor),
    moduleReward,
    points: row.points,
    target: row.target || 0,
    issuedAt: num(row.issuedAt),
    expiresAt: num(row.expiresAt),
    status: row.status as MarketHuntSlot["status"],
    claimedAt: row.claimedAt == null ? null : num(row.claimedAt),
    reservedMinor: num(row.reservedMinor),
    started: row.started,
  };
}

export async function loadMarketHunts(playerId: string, day: string): Promise<MarketHuntSlot[]> {
  const rows = await prisma.marketHuntSlot.findMany({
    where: { playerId, issuedDay: day },
    orderBy: { issuedAt: "asc" },
  });
  return rows.map(marketHuntRow);
}

export function templateForSlot(slot: MarketHuntSlot): MarketHuntTemplate {
  return MARKET_HUNTS.find((hunt) => hunt.id === slot.templateId) ?? MARKET_HUNTS[0]!;
}

export function seedMix(seed: number, index: number): number {
  let value = (seed ^ Math.imul(index + 1, 0x9e3779b9)) >>> 0;
  value ^= value >>> 16;
  value = Math.imul(value, 0x85ebca6b) >>> 0;
  value ^= value >>> 13;
  return value >>> 0;
}

// Difficulty draw lives in @plotgo/game (single source of truth, shared with the
// account-age rule); re-exported here for existing importers.
export { chooseDifficulty };

function canUseStock(stock: (typeof MARKET_STOCKS)[number], stage: MarketStage): boolean {
  return marketStageIndex(stock.unlockStage) <= marketStageIndex(stage);
}

export function chooseStock(affinity: string, eventBias: string, stage: MarketStage, seed: number) {
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

export function huntAchievable(hunt: MarketHuntTemplate, board: PlacedCard[]): boolean {
  const requirement = hunt.requiredBusiness.toLowerCase();
  if (requirement === "any" || requirement.includes("any customer-facing")) return true;
  if (requirement.includes("any 3 businesses")) return board.length >= 3;
  if (requirement.includes("3+ business categories")) return new Set(board.map((card) => CARDS_lineage(card))).size >= 3;
  if (requirement.includes("5+ business categories")) return new Set(board.map((card) => CARDS_lineage(card))).size >= 5;
  if (requirement.includes("synergy pair")) return board.length >= 2;
  const haystack = board.map((card) => {
    const spec = CARDS_spec(card);
    return `${spec?.name ?? ""} ${spec?.lineage ?? ""}`.toLowerCase();
  });
  const tokens = requirement.split(/\s+\/\s+|\s+\+\s+|\s+or\s+|\s+/).filter((token) => token.length > 2 && !["any", "elite", "institution", "institutional"].includes(token));
  return tokens.some((token) => haystack.some((item) => item.includes(token)));
}

export function realisticTarget(hunt: MarketHuntTemplate, target: number, board: PlacedCard[]): number {
  const metric = hunt.metric.toLowerCase();
  if (!metric.includes("customer") && !metric.includes("trader") && !metric.includes("investor")) return target;
  const capacity = board.reduce((sum, card) => sum + cardCustomers(card), 0);
  if (capacity <= 0) return target;
  return Math.min(target, Math.max(1, Math.floor(capacity * 2.5)));
}

export function huntProgress(
  p: { earnedMinor: number; board: PlacedCard[]; reputationBps: number; transactions: number; volumeMinor: number },
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
  else if (metric.includes("category")) current = new Set(p.board.map((card) => CARDS_lineage(card))).size;
  else if (metric.includes("cash") || metric.includes("net")) current = p.earnedMinor / 100;
  else if (metric.includes("condition") || metric.includes("event")) current = 1;
  if (hunt.unit.includes("ratio") || hunt.unit.includes("margin") || hunt.unit.includes("utilization") || hunt.unit.includes("retention")) {
    current = Number(current.toFixed(3));
  }
  return { current, target, done: current >= target && slot.status === "active" };
}

// Re-exported game helpers used above (kept as locals to preserve exact old logic).
import { CARDS, cardCustomers, resolveType } from "@plotgo/game";

function CARDS_spec(card: PlacedCard) {
  return CARDS[resolveType(card.type)];
}

function CARDS_lineage(card: PlacedCard): string {
  return CARDS_spec(card)?.lineage ?? "";
}

export async function throttledRarity(week: string, difficulty: HuntDifficulty, seed: number, eventShift: string, qualityBps: number, preferredRarity: RewardRarity): Promise<RewardRarity> {
  const consumption = await poolConsumption(week);
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
