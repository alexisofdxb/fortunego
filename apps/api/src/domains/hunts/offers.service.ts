import {
  MARKET_HUNTS,
  MARKET_STOCKS,
  REWARD_VALUES_MINOR,
  chooseDifficultyForAccount,
  collectionBonuses,
  isoWeek,
  marketEventForDay,
  marketStageForEmpireLevel,
  marketStageIndex,
  resolvePlacement,
  rollHuntModuleReward,
  seedForDay,
  type MarketHuntTemplate,
  type MarketStage,
  type PlacedCard,
  type RewardRarity,
} from "@plotgo/game";
import { prisma } from "../../infrastructure/postgres/client";
import { newId, num } from "../../shared/types";
import { claimDailyFlag } from "../../shared/daily-state";
import { loadCards, loadFrags, operatingBoard } from "../plot/board.service";
import { eventState } from "../events/events.service";
import { currentEmpireLevel, onboardingMilestoneRows, recordOnboardingMilestone } from "../player/onboarding.service";
import {
  chooseStock,
  ensureMarketPool,
  huntAchievable,
  marketHuntRow,
  poolConsumption,
  realisticTarget,
  releaseMarketReservation,
  reserveMarketReward,
  seedMix,
  throttledRarity,
} from "./hunts.service";

// ---------------------------------------------------------------------------
// Daily Market Hunt offer board (retention spec sheet 05).
// Canonical cadence: 3 new offers per player per UTC day at 00:00 UTC;
// unstarted offers expire at the next reset; started hunts keep their own
// real-time expiry; at most 5 hunts may be ACTIVE (started) at once; 1 free
// reroll/day replaces one unstarted offer. Spawn is idempotent by (player, day).
// ---------------------------------------------------------------------------

export const DAILY_OFFER_COUNT = 3;
export const MAX_ACTIVE_HUNTS = 5;

export function nextUtcMidnightMs(now = Date.now()): number {
  const next = new Date(now + 86_400_000);
  return Date.UTC(next.getUTCFullYear(), next.getUTCMonth(), next.getUTCDate());
}

export async function countActiveHunts(playerId: string): Promise<number> {
  return prisma.marketHuntSlot.count({
    where: { playerId, started: true, status: { in: ["active", "cash_fallback"] } },
  });
}

type OfferContext = {
  day: string;
  week: string;
  stage: MarketStage;
  marketEvent: ReturnType<typeof marketEventForDay>;
  events: Awaited<ReturnType<typeof eventState>>;
  bonuses: ReturnType<typeof collectionBonuses>;
  placementEffects: { huntSpawnBps: number; huntQualityBps: number };
  activeBoard: PlacedCard[];
  portfolio: Record<string, number>;
  accountAgeDays: number;
  tutorialOpen: boolean;
};

async function offerContext(playerId: string, day: string, now: number): Promise<OfferContext> {
  const board = await loadCards(playerId);
  const activeBoard = operatingBoard(board);
  const portfolio = (await loadFrags(playerId)).map;
  const player = await prisma.player.findUnique({ where: { id: playerId }, select: { createdAt: true } });
  const createdAt = num(player?.createdAt ?? now);
  const stage = marketStageForEmpireLevel(await currentEmpireLevel(playerId, activeBoard));
  return {
    day,
    week: isoWeek(new Date(`${day}T00:00:00Z`)),
    stage,
    marketEvent: marketEventForDay(day, playerId),
    events: await eventState(playerId, activeBoard, stage, createdAt),
    bonuses: collectionBonuses(portfolio),
    placementEffects: resolvePlacement(activeBoard).effects,
    activeBoard,
    portfolio,
    accountAgeDays: (now - createdAt) / 86_400_000,
    tutorialOpen: !(await onboardingMilestoneRows(playerId)).some((row) => row.milestoneId === "onboarding_first_hunt_open"),
  };
}

/** Create one offer deterministically from (player, day, index). */
async function createOffer(playerId: string, index: number, ctx: OfferContext, now: number, seen: Set<string>) {
  const seed = seedMix(seedForDay(ctx.day, playerId), index);
  const difficulty = chooseDifficultyForAccount(ctx.stage, seed, ctx.accountAgeDays);
  const eligible = MARKET_HUNTS.filter((hunt) => marketStageIndex(hunt.minStage) <= marketStageIndex(ctx.stage) && hunt.difficulty === difficulty && !seen.has(hunt.id) && huntAchievable(hunt, ctx.activeBoard));
  const fallback = MARKET_HUNTS.filter((hunt) => marketStageIndex(hunt.minStage) <= marketStageIndex(ctx.stage) && !seen.has(hunt.id) && huntAchievable(hunt, ctx.activeBoard));
  const pool = eligible.length ? eligible : fallback;
  if (!pool.length) return null;
  const tutorialTemplate = MARKET_HUNTS.find((hunt) => hunt.id === "first_customers");
  const template: MarketHuntTemplate = ctx.tutorialOpen && tutorialTemplate && !seen.has(tutorialTemplate.id) && huntAchievable(tutorialTemplate, ctx.activeBoard)
    ? tutorialTemplate
    : pool[seed % pool.length]!;
  seen.add(template.id);
  const rarity: RewardRarity = ctx.tutorialOpen && template.id === "first_customers"
    ? "common"
    : await throttledRarity(ctx.week, template.difficulty, seedMix(seed, 11), ctx.marketEvent.rewardRarityShift, ctx.bonuses.researchQualityBps + ctx.placementEffects.huntQualityBps, template.rewardBias);
  const rewardValueMinor = REWARD_VALUES_MINOR[rarity];
  const moduleReward = rollHuntModuleReward(template.difficulty, seedMix(seed, 23), template.family);
  // Stock selection + pool reservation happen at START time, not at offer time:
  // unstarted offers never hold pool reservations.
  const adjustedTarget = realisticTarget(template, template.target < 1
    ? Number((template.target * ctx.marketEvent.targetMultiplier).toFixed(3))
    : Math.max(1, Math.round(template.target * ctx.marketEvent.targetMultiplier * (1 + Math.max(-0.25, Math.min(0.25, ctx.events.modifiers.demandBps / 10_000))))), ctx.activeBoard);
  const issuedAt = now + index;
  await prisma.marketHuntSlot.create({
    data: {
      id: newId(),
      playerId,
      issuedDay: ctx.day,
      week: ctx.week,
      templateId: template.id,
      difficulty: template.difficulty,
      rewardRarity: rarity,
      stockTicker: null,
      rewardValueMinor,
      moduleRewardKind: moduleReward?.kind ?? null,
      moduleRewardRarity: moduleReward?.rarity ?? null,
      moduleRewardModuleId: moduleReward?.moduleId ?? null,
      moduleRewardQuantity: moduleReward?.quantity ?? 0,
      moduleRewardParts: moduleReward?.partsAmount ?? 0,
      points: template.points,
      target: adjustedTarget,
      issuedAt,
      // Unstarted offers expire at the next UTC reset; the real-time timer
      // only begins when the player starts the hunt.
      expiresAt: nextUtcMidnightMs(now),
      status: "active",
      reservedMinor: 0,
      started: false,
    },
  });
  if (ctx.tutorialOpen && ctx.activeBoard.length > 0 && template.id === "first_customers") {
    await recordOnboardingMilestone(playerId, "onboarding_first_hunt_open", "market_hunt.issue", now);
  }
  return template;
}

/**
 * Spawn the canonical 3 offers for (player, day). Idempotent: the daily flag
 * on PlayerDailyState guarantees exactly one generation per UTC day, from the
 * reset job or the lazy snapshot path — whichever comes first.
 */
export async function spawnDailyOffers(playerId: string, day: string, now = Date.now()): Promise<void> {
  if (!(await claimDailyFlag(playerId, day, "huntOfferSet"))) return;
  const ctx = await offerContext(playerId, day, now);
  await ensureMarketPool(ctx.week);
  const seen = new Set<string>();
  for (let index = 0; index < DAILY_OFFER_COUNT; index++) {
    await createOffer(playerId, index, ctx, now, seen);
  }
}

/**
 * Start an unstarted offer: enforces the max-5 ACTIVE rule, freezes the
 * reward (stock pick + pool reservation) and starts the real-time timer.
 */
export async function startHuntOffer(playerId: string, huntId: string, now = Date.now()): Promise<{ error: string; status: 400 | 404 | 409 } | { ok: true }> {
  const slot = await prisma.marketHuntSlot.findUnique({ where: { id: huntId } });
  if (!slot || slot.playerId !== playerId) return { error: "No such offer", status: 404 };
  if (slot.started) return { error: "Hunt already started", status: 409 };
  if (slot.status !== "active" || num(slot.expiresAt) <= now) return { error: "Offer expired", status: 400 };
  if ((await countActiveHunts(playerId)) >= MAX_ACTIVE_HUNTS) {
    return { error: `Active hunt queue is full (max ${MAX_ACTIVE_HUNTS})`, status: 409 };
  }
  const template = MARKET_HUNTS.find((hunt) => hunt.id === slot.templateId) ?? MARKET_HUNTS[0]!;
  const board = await loadCards(playerId);
  const activeBoard = operatingBoard(board);
  const portfolio = (await loadFrags(playerId)).map;
  const created = await prisma.player.findUnique({ where: { id: playerId }, select: { createdAt: true } });
  const stage = marketStageForEmpireLevel(await currentEmpireLevel(playerId, activeBoard));
  const marketEvent = marketEventForDay(slot.issuedDay, playerId);
  const events = await eventState(playerId, activeBoard, stage, num(created?.createdAt ?? now));
  const stockSeed = seedMix(num(slot.issuedAt), 17);
  const tutorialStock = MARKET_STOCKS.find((candidate) => candidate.ticker === "AAPL")!;
  const tutorialOpen = !(await onboardingMilestoneRows(playerId)).some((row) => row.milestoneId === "onboarding_first_hunt_open");
  const stock = tutorialOpen ? tutorialStock : chooseStock(template.stockAffinity, `${marketEvent.stockBias},${events.global.stockBias}`, stage, stockSeed);
  const paused = (await poolConsumption(slot.week)) >= 0.95;
  const rewardValueMinor = num(slot.rewardValueMinor);
  const reserved = !paused && (await reserveMarketReward(slot.week, stock.ticker, rewardValueMinor));
  const claimed = await prisma.marketHuntSlot.updateMany({
    where: { id: huntId, started: false, status: "active" },
    data: {
      started: true,
      issuedAt: now,
      expiresAt: now + template.durationHours * 3_600_000,
      stockTicker: reserved ? stock.ticker : null,
      status: reserved ? "active" : "cash_fallback",
      reservedMinor: reserved ? rewardValueMinor : 0,
    },
  });
  if (claimed.count !== 1) return { error: "Hunt already started", status: 409 };
  return { ok: true };
}

/**
 * Free daily reroll (spec sheet 05): replaces ONE unstarted offer — the
 * specified one, or deterministically the lowest-value unstarted offer.
 * Consumes the single daily reroll via the unique (player, day) flag.
 */
export async function rerollDailyOffer(playerId: string, day: string, huntId?: string, now = Date.now()): Promise<{ error: string; status: 400 | 404 | 409 } | { ok: true }> {
  await spawnDailyOffers(playerId, day, now);
  const offers = await prisma.marketHuntSlot.findMany({
    where: { playerId, issuedDay: day, started: false, status: "active" },
    orderBy: { issuedAt: "asc" },
  });
  if (!offers.length) return { error: "No unstarted offers to reroll", status: 400 };
  const target = huntId
    ? offers.find((offer) => offer.id === huntId)
    : [...offers].sort((a, b) => num(a.rewardValueMinor) - num(b.rewardValueMinor) || num(a.issuedAt) - num(b.issuedAt))[0];
  if (!target) return { error: "No such unstarted offer", status: 404 };
  if (!(await claimDailyFlag(playerId, day, "huntRerolled"))) {
    return { error: "Daily reroll already used", status: 409 };
  }
  // Unstarted offers never hold pool reservations, so deletion is safe.
  const deleted = await prisma.marketHuntSlot.deleteMany({ where: { id: target.id, started: false } });
  if (deleted.count !== 1) return { error: "Offer changed, retry", status: 409 };
  const ctx = await offerContext(playerId, day, now);
  const seen = new Set(
    (await prisma.marketHuntSlot.findMany({ where: { playerId, issuedDay: day }, select: { templateId: true } }))
      .map((row) => row.templateId),
  );
  await createOffer(playerId, DAILY_OFFER_COUNT, ctx, now, seen);
  return { ok: true };
}

/**
 * Expiry sweep (called from the lazy snapshot path and the reset job):
 * started hunts past their own real-time expiry flip to expired (reservations
 * released); unstarted offers from prior UTC days expire at the reset.
 * Active hunts are never deleted to make room.
 */
export async function expireStaleOffers(playerId: string, day: string, now = Date.now()): Promise<void> {
  await prisma.$transaction(async (tx) => {
    const expired = await tx.marketHuntSlot.findMany({
      where: { playerId, started: true, status: { in: ["active", "cash_fallback"] }, expiresAt: { lte: now } },
    });
    for (const row of expired) {
      const updated = await tx.marketHuntSlot.updateMany({
        where: { id: row.id, started: true, status: { in: ["active", "cash_fallback"] }, expiresAt: { lte: now } },
        data: { status: "expired" },
      });
      if (updated.count === 1) await releaseMarketReservation(marketHuntRow(row));
    }
  });
  await prisma.marketHuntSlot.updateMany({
    where: { playerId, started: false, status: "active", issuedDay: { lt: day } },
    data: { status: "expired" },
  });
}
