import {
  DAILY_XP_CAPS,
  REVENUE_MILESTONE_THRESHOLDS_MINOR,
  XP_SOURCE_BASE,
  collectionProgress,
  evaluateProgression,
  landGradeXpMultiplier,
  landPrice,
  rankXpMultiplier,
  utcDay,
  type CardSpec,
} from "@plotgo/game";
import { prisma } from "../../infrastructure/postgres/client";
import { num } from "../../shared/types";

// ---------------------------------------------------------------------------
// Empire XP awards — Empire_Progression_System_v1.0 (canonical). Ten sources
// with fixed base amounts (XP_SOURCE_BASE), scaled by building-rank / land-grade
// multipliers, plus hard daily caps. Every award increments empireXp and then
// runs refreshProgression, which re-resolves the displayed level, persists new
// promotion flags (+300 XP each), revenue-milestone tiers (+100 × tier) and
// stock-set completions (+250 each). The old flat EMPIRE_XP_AWARDS table and
// its settle/event/craft/meaningful-action sites are removed: place awards
// construction XP, upgrade awards stage XP, acquire/bootstrap award land XP,
// hunt claim awards hunt XP (+ first-ticker discovery + set completion).
// ---------------------------------------------------------------------------

/** promotions Json entries are strings: rank names plus "revenue_tier:N". */
const REVENUE_TIER_PREFIX = "revenue_tier:";

function parsePromotions(json: unknown): string[] {
  if (!Array.isArray(json)) return [];
  return json.filter((entry): entry is string => typeof entry === "string");
}

/** Cumulative revenue milestone tier (0..5) for an earned_minor total. */
export function revenueTierForEarnedMinor(earnedMinor: number): number {
  let tier = 0;
  for (const threshold of REVENUE_MILESTONE_THRESHOLDS_MINOR) {
    if (earnedMinor >= threshold) tier += 1;
  }
  return tier;
}

function promotionTier(promotions: string[]): number {
  for (const entry of promotions) {
    if (entry.startsWith(REVENUE_TIER_PREFIX)) {
      const value = Number(entry.slice(REVENUE_TIER_PREFIX.length));
      if (Number.isFinite(value)) return Math.max(0, Math.floor(value));
    }
  }
  return 0;
}

/** Lazily roll the daily XP caps at a new UTC day; returns the live counters. */
async function ensureDailyXpReset(playerId: string): Promise<{ dailyObjectiveXp: number; dailyHuntXp: number }> {
  const day = utcDay();
  const row = await prisma.player.findUnique({
    where: { id: playerId },
    select: { dailyObjectiveXp: true, dailyHuntXp: true, dailyXpResetDay: true },
  });
  if (!row) return { dailyObjectiveXp: 0, dailyHuntXp: 0 };
  if (row.dailyXpResetDay !== day) {
    await prisma.player.update({
      where: { id: playerId },
      data: { dailyObjectiveXp: 0, dailyHuntXp: 0, dailyXpResetDay: day },
    });
    return { dailyObjectiveXp: 0, dailyHuntXp: 0 };
  }
  return { dailyObjectiveXp: row.dailyObjectiveXp, dailyHuntXp: row.dailyHuntXp };
}

/** Reset hook for the 00:00 UTC daily retention job (idempotent per day). */
export async function resetDailyXpCounters(playerId: string, day = utcDay()): Promise<void> {
  await prisma.player.updateMany({
    where: { id: playerId, dailyXpResetDay: { not: day } },
    data: { dailyObjectiveXp: 0, dailyHuntXp: 0, dailyXpResetDay: day },
  });
}

/**
 * Re-resolve a player's progression after any XP/empire change: loads the
 * counters (owned hexes, built businesses, stage2+ buildings, unique stocks),
 * folds in revenue-milestone and stock-set XP, evaluates v1.0, persists new
 * promotion flags (+300 XP each, re-evaluated once so chained promotions at the
 * next gate resolve in the same pass) and stores displayedLevel on the player.
 * empireXp is only ever incremented through the award paths.
 */
export async function refreshProgression(playerId: string): Promise<void> {
  const player = await prisma.player.findUnique({
    where: { id: playerId },
    select: { empireXp: true, earnedMinor: true, promotions: true, completedSetsAwarded: true },
  });
  if (!player) return;
  const [landCount, cardRows, fragmentRows] = await Promise.all([
    prisma.plotgoLand.count({ where: { playerId } }),
    prisma.card.findMany({ where: { playerId }, select: { stage: true } }),
    prisma.fragment.findMany({ where: { playerId }, select: { ticker: true, unitsBps: true, unitsMicros: true } }),
  ]);
  const portfolioMap: Record<string, number> = {};
  for (const row of fragmentRows) {
    portfolioMap[row.ticker] = Math.max(0, Number(row.unitsMicros ?? BigInt(row.unitsBps) * 10_000n));
  }
  const counters = {
    ownedHexes: landCount,
    builtBusinesses: cardRows.length,
    stage2PlusBuildings: cardRows.filter((row) => row.stage >= 2).length,
    uniqueStocks: Object.values(portfolioMap).filter((units) => units > 0).length,
  };
  let promotions = parsePromotions(player.promotions);
  let xpDelta = 0;
  // Revenue milestone: award (tier − previously awarded) × 100 once per tier.
  const tier = revenueTierForEarnedMinor(num(player.earnedMinor));
  const awardedTier = promotionTier(promotions);
  if (tier > awardedTier) {
    xpDelta += (tier - awardedTier) * XP_SOURCE_BASE.revenueMilestone;
    promotions = [...promotions.filter((entry) => !entry.startsWith(REVENUE_TIER_PREFIX)), `${REVENUE_TIER_PREFIX}${tier}`];
  }
  // Stock collection sets: award (completed − awarded) × 250, once per set.
  const completedSets = collectionProgress(portfolioMap).filter((collection) => collection.complete).length;
  let setsAwarded = player.completedSetsAwarded;
  if (completedSets > setsAwarded) {
    xpDelta += (completedSets - setsAwarded) * XP_SOURCE_BASE.stockSet;
    setsAwarded = completedSets;
  }
  // Promotion gates: persist met gates (+300 XP each) and re-evaluate once.
  let evaluation = evaluateProgression({ xp: player.empireXp + xpDelta, ...counters, completedPromotions: promotions });
  for (let pass = 0; pass < 3 && evaluation.justPromoted.length > 0; pass++) {
    const fresh = evaluation.justPromoted.filter((rank) => !promotions.some((entry) => entry.toLowerCase() === rank.toLowerCase()));
    if (fresh.length === 0) break;
    promotions = [...promotions, ...fresh];
    xpDelta += fresh.length * XP_SOURCE_BASE.promotion;
    evaluation = evaluateProgression({ xp: player.empireXp + xpDelta, ...counters, completedPromotions: promotions });
  }
  await prisma.player.update({
    where: { id: playerId },
    data: {
      empireXp: player.empireXp + xpDelta,
      empireLevel: evaluation.displayedLevel,
      promotions: promotions as object,
      completedSetsAwarded: setsAwarded,
    },
  });
}

/** Increment empire XP by `amount` (positive integers only), then re-resolve. */
async function grantEmpireXp(playerId: string, amount: number): Promise<void> {
  if (!Number.isFinite(amount) || amount <= 0) return;
  await prisma.player.update({ where: { id: playerId }, data: { empireXp: { increment: Math.round(amount) } } });
  await refreshProgression(playerId);
}

/**
 * First-time building construction (place route): 100 × building-rank
 * multiplier, once per building instance (a placed card is a new instance;
 * there is no XP for moving an existing building).
 */
export async function awardConstruction(playerId: string, spec: Pick<CardSpec, "era" | "id"> & { rank?: string }): Promise<void> {
  const amount = Math.round(XP_SOURCE_BASE.construction * rankXpMultiplier(spec.rank ?? spec.era));
  await grantEmpireXp(playerId, amount);
}

/**
 * Building upgrade: stage 2 = 50 × rank multiplier, stage 3 = 100 × rank
 * multiplier, once per building per stage (stages never regress).
 */
export async function awardUpgrade(playerId: string, spec: Pick<CardSpec, "era" | "id"> & { rank?: string }, toStage: 2 | 3): Promise<void> {
  const base = toStage === 2 ? XP_SOURCE_BASE.stage2Upgrade : XP_SOURCE_BASE.stage3Upgrade;
  const amount = Math.round(base * rankXpMultiplier(spec.rank ?? spec.era));
  await grantEmpireXp(playerId, amount);
}

/**
 * Hex / land acquisition (acquire route + starter-grant bootstrap): 75 ×
 * land-grade multiplier, once per parcel (the (playerId, hexId) unique key and
 * the replay path guarantee a single award; grants and purchases both count).
 */
export async function awardLand(playerId: string, parcelId: string): Promise<void> {
  const grade = landPrice(parcelId)?.grade ?? "Entry";
  const amount = Math.round(XP_SOURCE_BASE.land * landGradeXpMultiplier(grade));
  await grantEmpireXp(playerId, amount);
}

/**
 * Unique stock discovery: 40 XP, once per ticker. The caller guarantees the
 * first-insert (the fragments row did not exist before the credit); the counter
 * is derived, not stored.
 */
export async function awardStockDiscovery(playerId: string, _ticker: string): Promise<void> {
  await grantEmpireXp(playerId, XP_SOURCE_BASE.stockDiscovery);
}

/**
 * Stock collection set completion: 250 XP per newly completed collection,
 * tracked by diffing the completed-collection count against the persisted
 * completedSetsAwarded column (ledger-free, idempotent).
 */
export async function awardStockSet(playerId: string): Promise<void> {
  await refreshProgression(playerId);
}

/**
 * Customer / revenue milestone: 100 × tier when earned_minor crosses the
 * cumulative thresholds (1k/10k/100k/1M/10k minor = tiers 1..5). Each tier is
 * awarded once; progress is stored in the promotions Json as "revenue_tier:N".
 */
export async function awardRevenueMilestone(playerId: string): Promise<void> {
  await refreshProgression(playerId);
}

/**
 * Daily business objective completion: 25 XP, hard-capped at 75/day (the 4th
 * completion only awards the remainder up to the cap). The daily counter rolls
 * lazily at a new UTC day (plus the 00:00 UTC retention job).
 */
export async function awardDailyObjective(playerId: string): Promise<{ awarded: number }> {
  const counters = await ensureDailyXpReset(playerId);
  const awarded = Math.min(XP_SOURCE_BASE.dailyObjective, DAILY_XP_CAPS.dailyObjectiveXp - counters.dailyObjectiveXp);
  if (awarded <= 0) return { awarded: 0 };
  await prisma.player.update({ where: { id: playerId }, data: { dailyObjectiveXp: { increment: awarded } } });
  await grantEmpireXp(playerId, awarded);
  return { awarded };
}

/**
 * Market Hunt completion: 20 XP, hard-capped at 60/day (first 3 hunts), same
 * daily-reset mechanism as the objective cap.
 */
export async function awardHunt(playerId: string): Promise<{ awarded: number }> {
  const counters = await ensureDailyXpReset(playerId);
  const awarded = Math.min(XP_SOURCE_BASE.hunt, DAILY_XP_CAPS.dailyMarketHuntXp - counters.dailyHuntXp);
  if (awarded <= 0) return { awarded: 0 };
  await prisma.player.update({ where: { id: playerId }, data: { dailyHuntXp: { increment: awarded } } });
  await grantEmpireXp(playerId, awarded);
  return { awarded };
}
