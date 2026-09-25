import { createHash } from "node:crypto";
import {
  BUILDING_LIST,
  CARDS,
  EVENT_CATALOG,
  EVENT_CATALOG_COUNT,
  EVENT_DECISIONS,
  MARKET_HUNTS,
  MARKET_STOCKS,
  REWARD_VALUES_MINOR,
  STAGE_RULES,
  buildingModuleProfile,
  collectionBonuses,
  empireValueMinor,
  displayCash,
  EMPIRE_ARCHETYPES,
  isUnlocked,
  isoWeek,
  marketEventForDay,
  marketStageForEmpireLevel,
  marketStageIndex,
  moduleRewardLabel,
  resolvePlacement,
  resolveType,
  rollHuntModuleReward,
  seedForDay,
  settleDistrict,
  tickMinor,
  utcDay,
  type PlacedCard,
} from "@plotgo/game";
import { prisma } from "../infrastructure/postgres/client";
import { newId, num, parseDays, parseNumberMap } from "./types";
import { archetypeResolutionForPlayer, districtDay, effectiveDistrictEvent, loadCards, loadFrags, operatingBoard, positionRows, sessionFor, stockClaimGate } from "../domains/plot/board.service";
import { eventState, missionView } from "../domains/events/events.service";
import { ensureOpeningLedger } from "../domains/economy/ledger.service";
import {
  chooseDifficulty,
  chooseStock,
  ensureMarketPool,
  huntAchievable,
  huntProgress,
  loadMarketHunts,
  marketHuntRow,
  poolConsumption,
  realisticTarget,
  releaseMarketReservation,
  reserveMarketReward,
  seedMix,
  templateForSlot,
  throttledRarity,
  type MarketHuntSlot,
} from "../domains/hunts/hunts.service";
import { moduleEffectsForBoard, moduleInventoryRows, moduleLoadoutSummaries, modulePartsRows, MODULE_CONFIG_VERSION, moduleEntry, pendingModuleRewards } from "../domains/modules/modules.service";
import { currentEmpireLevel, hasTutorialCashAccessSynergy, onboardingMilestoneRows, onboardingSnapshot, recordOnboardingMilestone } from "../domains/player/onboarding.service";
import { offlineSummaryRow, presenceRow, processOfflineCatchup } from "./offline";
import { performanceSnapshot, weeklyPerformanceRow } from "../domains/performance/performance.service";

export type SettledPlayer = {
  id: string;
  createdAt: number;
  founder: number;
  cashMinor: number;
  earnedMinor: number;
  lastSettleAt: number;
  exchangeActionsToday: number;
  huntDay: string;
  huntId: string;
  huntClaimed: number;
  weeklyScore: number;
  riskBps: number;
  reputationBps: number;
  conditionBps: number;
  population: number;
  capacity: number;
  satisfactionBps: number;
  transactions: number;
  volumeMinor: number;
  plotBalance: number;
  archetype: string | null;
  archetypeChangedAt: number | null;
  board: PlacedCard[];
  marketHunts: MarketHuntSlot[];
  activeDays: string[];
};

export async function settlePlayer(playerId: string): Promise<SettledPlayer | null> {
  await processOfflineCatchup(playerId);
  const p = await prisma.player.findUnique({ where: { id: playerId } });
  if (!p) return null;
  const board = await loadCards(playerId);
  const { map: portfolioMap } = await loadFrags(playerId);
  await ensureOpeningLedger(prisma, playerId, num(p.cashMinor));
  const day = utcDay();
  if (p.huntDay !== day) await prisma.player.update({ where: { id: playerId }, data: { huntDay: day, huntClaimed: false, exchangeActionsToday: 0 } });
  const marketHunts = await ensureMarketHunts(playerId, board, portfolioMap, day);
  const activeDaysRow = await prisma.player.findUnique({ where: { id: playerId }, select: { activeDays: true } });
  return {
    id: p.id,
    createdAt: num(p.createdAt),
    founder: p.founder ? 1 : 0,
    cashMinor: num(p.cashMinor),
    earnedMinor: num(p.earnedMinor),
    lastSettleAt: num(p.lastSettleAt),
    exchangeActionsToday: p.huntDay === day ? p.exchangeActionsToday : 0,
    huntDay: day,
    huntId: p.huntId,
    huntClaimed: 0,
    weeklyScore: p.weeklyScore,
    riskBps: p.riskBps,
    reputationBps: p.reputationBps,
    conditionBps: p.conditionBps,
    population: p.population,
    capacity: p.capacity,
    satisfactionBps: p.satisfactionBps,
    transactions: p.transactions,
    volumeMinor: num(p.volumeMinor),
    plotBalance: num(p.plotBalance),
    archetype: p.archetype,
    archetypeChangedAt: p.archetypeChangedAt == null ? null : num(p.archetypeChangedAt),
    board,
    marketHunts,
    activeDays: parseDays(activeDaysRow?.activeDays),
  };
}

export async function ensureMarketHunts(playerId: string, board: PlacedCard[], portfolio: Record<string, number>, day: string): Promise<MarketHuntSlot[]> {
  const now = Date.now();
  await prisma.$transaction(async (tx) => {
    const expired = await tx.marketHuntSlot.findMany({ where: { playerId, status: "active", expiresAt: { lte: now } } });
    for (const row of expired) {
      const updated = await tx.marketHuntSlot.updateMany({ where: { id: row.id, status: "active", expiresAt: { lte: now } }, data: { status: "expired" } });
      if (updated.count === 1) await releaseMarketReservation(marketHuntRow(row));
    }
  });
  const week = isoWeek(new Date(`${day}T00:00:00Z`));
  await ensureMarketPool(week);
  const activeBoard = operatingBoard(board);
  const stage = marketStageForEmpireLevel((await currentEmpireLevel(playerId, activeBoard)));
  const stageRule = STAGE_RULES[stage];
  const marketEvent = marketEventForDay(day, playerId);
  const bonuses = collectionBonuses(portfolio);
  const placement = resolvePlacement(activeBoard);
  const created = await prisma.player.findUnique({ where: { id: playerId }, select: { createdAt: true } });
  const events = await eventState(playerId, activeBoard, stage, num(created?.createdAt ?? now));
  const desired = Math.min(5, Math.ceil((stageRule.baseHunts + stageRule.bonusHunts) * marketEvent.spawnMultiplier * events.global.huntSpawnMultiplier * (1 + (bonuses.researchSpawnBps + placement.effects.huntSpawnBps + events.modifiers.huntSpawnBps) / 10_000)));
  const existing = await loadMarketHunts(playerId, day);
  const seen = new Set(existing.map((slot) => slot.templateId));
  const createCount = Math.max(0, desired - existing.length);
  for (let i = 0; i < createCount; i++) {
    const seed = seedMix(seedForDay(day, playerId), existing.length + i);
    const difficulty = chooseDifficulty(stage, seed);
    const eligible = MARKET_HUNTS.filter((hunt) => marketStageIndex(hunt.minStage) <= marketStageIndex(stage) && hunt.difficulty === difficulty && !seen.has(hunt.id) && huntAchievable(hunt, activeBoard));
    const fallback = MARKET_HUNTS.filter((hunt) => marketStageIndex(hunt.minStage) <= marketStageIndex(stage) && !seen.has(hunt.id) && huntAchievable(hunt, activeBoard));
    const pool = eligible.length ? eligible : fallback;
    if (!pool.length) break;
    const tutorialOpen = !(await onboardingMilestoneRows(playerId)).some((row) => row.milestoneId === "onboarding_first_hunt_open");
    const tutorialTemplate = MARKET_HUNTS.find((hunt) => hunt.id === "first_customers");
    const template = tutorialOpen && tutorialTemplate && !seen.has(tutorialTemplate.id) && huntAchievable(tutorialTemplate, activeBoard)
      ? tutorialTemplate
      : pool[seed % pool.length]!;
    seen.add(template.id);
    const rarity = tutorialOpen ? "common" : await throttledRarity(week, template.difficulty, seedMix(seed, 11), marketEvent.rewardRarityShift, bonuses.researchQualityBps + placement.effects.huntQualityBps, template.rewardBias);
    const rewardValueMinor = REWARD_VALUES_MINOR[rarity];
    const moduleReward = rollHuntModuleReward(template.difficulty, seedMix(seed, 23), template.family);
    const stock = tutorialOpen ? MARKET_STOCKS.find((candidate) => candidate.ticker === "AAPL") ?? chooseStock(template.stockAffinity, `${marketEvent.stockBias},${events.global.stockBias}`, stage, seedMix(seed, 17)) : chooseStock(template.stockAffinity, `${marketEvent.stockBias},${events.global.stockBias}`, stage, seedMix(seed, 17));
    const paused = (await poolConsumption(week)) >= 0.95;
    const reserved = !paused && await reserveMarketReward(week, stock.ticker, rewardValueMinor);
    const adjustedTarget = realisticTarget(template, template.target < 1
      ? Number((template.target * marketEvent.targetMultiplier).toFixed(3))
      : Math.max(1, Math.round(template.target * marketEvent.targetMultiplier * (1 + Math.max(-0.25, Math.min(0.25, events.modifiers.demandBps / 10_000))))), activeBoard);
    const issuedAt = now + i;
    await prisma.marketHuntSlot.create({
      data: {
        id: newId(),
        playerId,
        issuedDay: day,
        week,
        templateId: template.id,
        difficulty: template.difficulty,
        rewardRarity: rarity,
        stockTicker: reserved ? stock.ticker : null,
        rewardValueMinor,
        moduleRewardKind: moduleReward?.kind ?? null,
        moduleRewardRarity: moduleReward?.rarity ?? null,
        moduleRewardModuleId: moduleReward?.moduleId ?? null,
        moduleRewardQuantity: moduleReward?.quantity ?? 0,
        moduleRewardParts: moduleReward?.partsAmount ?? 0,
        points: template.points,
        target: adjustedTarget,
        issuedAt,
        expiresAt: issuedAt + template.durationHours * 3_600_000,
        status: reserved ? "active" : "cash_fallback",
        reservedMinor: reserved ? rewardValueMinor : 0,
      },
    });
    if (tutorialOpen && activeBoard.length > 0 && template.id === "first_customers") await recordOnboardingMilestone(playerId, "onboarding_first_hunt_open", "market_hunt.issue", now);
  }
  return loadMarketHunts(playerId, day);
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

export function placementGeometryHash(board: PlacedCard[]): string {
  const geometry = [...board]
    .sort((a, b) => a.id.localeCompare(b.id))
    .map((card) => [card.id, resolveType(card.type), card.x, card.y, card.orientation ?? 0].join(":"))
    .join("|");
  return createHash("sha256").update(geometry).digest("hex");
}

export async function recordPlacementAudit(playerId: string, board: PlacedCard[], moveTxId?: string) {
  const geometryHash = placementGeometryHash(board);
  const previous = await prisma.plotgoPlacementAudit.findUnique({ where: { playerId } });
  const layoutVersion = previous && previous.geometryHash === geometryHash
    ? previous.layoutVersion
    : (previous?.layoutVersion ?? 0) + 1;
  const resolvedMoveTxId = moveTxId ?? previous?.moveTxId ?? null;
  await prisma.plotgoPlacementAudit.upsert({
    where: { playerId },
    create: {
      playerId,
      layoutVersion,
      geometryHash,
      ...PLACEMENT_VERSIONS,
      moveTxId: resolvedMoveTxId,
      updatedAt: Date.now(),
    },
    update: {
      layoutVersion,
      geometryHash,
      ...PLACEMENT_VERSIONS,
      moveTxId: resolvedMoveTxId,
      updatedAt: Date.now(),
    },
  });
  return {
    layoutVersion,
    geometryHash,
    ...PLACEMENT_VERSIONS,
    moveTxId: resolvedMoveTxId,
  };
}

export function eventMoveLock(card: PlacedCard, eventId: string): string | null {
  const lineage = CARDS[resolveType(card.type)]?.lineage;
  if (eventId === "storm_warning") return "Relocation is locked during a storm warning settlement window.";
  if (eventId === "bank_run" && (lineage === "bank" || lineage === "lend")) return "Bank and lending buildings are locked during a bank run.";
  if (eventId === "credit_squeeze" && (lineage === "bank" || lineage === "lend" || lineage === "fund")) return "Credit-sensitive buildings are locked during a credit squeeze.";
  if (eventId === "liquidity_crunch" && (lineage === "trade" || lineage === "exchange" || lineage === "broker")) return "Trading buildings are locked during a liquidity crunch.";
  return null;
}

export async function snapshot(playerId: string, moveTxId?: string) {
  const p = await settlePlayer(playerId);
  if (!p) return null;
  const presence = await presenceRow(playerId);
  const { map, units, portfolio, collections } = await loadFrags(playerId);
  const ev = empireValueMinor(p.cashMinor, p.board, units);
  const day = utcDay();
  const dayData = await districtDay(playerId, day);
  const marketEvent = marketEventForDay(day, playerId);
  const gate = stockClaimGate(p);
  const activeBoard = operatingBoard(p.board);
  const progressionLevel = await currentEmpireLevel(playerId, activeBoard);
  const stage = marketStageForEmpireLevel(progressionLevel);
  const events = await eventState(playerId, activeBoard, stage, p.createdAt);
  const activeEvent = effectiveDistrictEvent(dayData.event, marketEvent, collectionBonuses(map).customerDemandBps, events.modifiers);
  const moduleEffects = await moduleEffectsForBoard(playerId, activeBoard, [events.global.id, ...events.personalEvents.map((event) => event.id)], events.cycle.state);
  const archetype = await archetypeResolutionForPlayer(playerId, activeBoard);
  const placement = resolvePlacement(activeBoard);
  const placementAudit = await recordPlacementAudit(playerId, p.board, moveTxId);
  if (hasTutorialCashAccessSynergy(activeBoard)) await recordOnboardingMilestone(playerId, "onboarding_first_synergy", "placement.resolve");
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
  if (progressionLevel >= 4) await recordOnboardingMilestone(playerId, "onboarding_first_hunt_open", "hunt.available");
  const week = isoWeek(new Date(`${day}T00:00:00Z`));
  const pointAggregate = await prisma.marketHuntSlot.aggregate({ where: { playerId, week, status: "claimed" }, _sum: { points: true } });
  const marketHuntPoints = Math.min(35, Number(pointAggregate._sum.points ?? 0));
  const marketHuntSubscore = Math.min(100, Math.round((marketHuntPoints / STAGE_RULES[stage].weeklyPointTarget) * 100));
  const weekPerformance = performanceSnapshot(p, await weeklyPerformanceRow(playerId, week), week, stage);
  const pendingPayout = await prisma.weeklyPerformance.findFirst({
    where: { playerId, finalized: true, payoutPlot: { gt: 0 }, claimedAt: null },
    orderBy: { week: "desc" },
    select: { week: true, payoutPlot: true },
  });
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
    pendingPayout: pendingPayout ? { week: pendingPayout.week, payoutPlot: num(pendingPayout.payoutPlot) } : null,
    plotBalance: p.plotBalance,
    performance: weekPerformance,
    marketStage: stage,
    marketHuntPoints,
    marketHuntPointCap: 35,
    marketHuntSubscore,
    marketHuntPerformanceContribution: Number((marketHuntSubscore * 0.05).toFixed(2)),
    marketPoolConsumption: await poolConsumption(week),
    stockClaimEligible: gate.eligible,
    stockClaimBlockedReason: gate.reason,
    activeDays: p.activeDays.length,
    presenceState: presence?.presenceState ?? "engaged",
    activeMinutesToday: parseNumberMap(presence?.activeMinutesDailyJson)[day] ?? 0,
    meaningfulActionsToday: parseNumberMap(presence?.meaningfulActionsDailyJson)[day] ?? 0,
    offlineSummary: await offlineSummaryRow(playerId),
    onboarding: await onboardingSnapshot(playerId),
    archetype: {
      selected: archetype.archetype,
      options: EMPIRE_ARCHETYPES,
      dominantShare: archetype.dominantShare,
      suppressed: archetype.suppressed,
      reason: archetype.reason,
      effects: archetype.effects,
      changedAt: p.archetypeChangedAt,
    },
    empireLevel: progressionLevel,
    cards: p.board,
    catalog: BUILDING_LIST.map((spec) => ({
      ...spec,
      moduleProfile: buildingModuleProfile(spec.id),
      unlocked: isUnlocked(spec.id, p.board, progressionLevel),
    })),
    fragments: map,
    moduleRewards: await pendingModuleRewards(playerId),
    modules: {
      configVersion: MODULE_CONFIG_VERSION,
      inventory: (await moduleInventoryRows(playerId)).filter((module) => module.quantityOwned > 0),
      parts: await modulePartsRows(playerId),
      effects: moduleEffects,
      loadouts: await moduleLoadoutSummaries(playerId, p.board),
    },
    portfolio,
    positions: await positionRows(playerId),
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
      mission: await missionView(playerId, events.mission, metrics, p),
      moduleInteractions: events.moduleInteractions,
      moduleLocks: events.moduleLocks,
      modifiers: events.modifiers,
      catalogCount: EVENT_CATALOG_COUNT,
    },
    placement: metrics.placement,
    placementAudit,
    session: await sessionFor(playerId, day),
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
