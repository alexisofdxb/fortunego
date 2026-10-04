import { createHash } from "node:crypto";
import {
  BUILDING_LIST,
  CARDS,
  EVENT_CATALOG,
  EVENT_CATALOG_COUNT,
  EVENT_DECISIONS,
  STAGE_RULES,
  announcedWindowsForWeek,
  buildingModuleProfile,
  collectionBonuses,
  currentAnnouncedWindow,
  empireValueMinor,
  displayCash,
  EMPIRE_ARCHETYPES,
  evaluateProgression,
  HEXES,
  isUnlocked,
  isoWeek,
  marketEventForDay,
  marketStageForEmpireLevel,
  maxHexesForLevel,
  moduleRewardLabel,
  normalizeCustomerSegments,
  resolvePlacement,
  resolveType,
  settleDistrict,
  utcDay,
  type CustomerSegments,
  type PlacedCard,
} from "@plotgo/game";
import { prisma } from "../infrastructure/postgres/client";
import { num, parseDays, parseNumberMap } from "./types";
import { archetypeResolutionForPlayer, districtDay, effectiveDistrictEvent, loadCards, loadFrags, operatingBoard, positionRows, sessionFor, stockClaimGate } from "../domains/plot/board.service";
import { eventState, missionView } from "../domains/events/events.service";
import { ensureOpeningLedger } from "../domains/economy/ledger.service";
import {
  huntProgress,
  marketHuntRow,
  poolConsumption,
  templateForSlot,
  type MarketHuntSlot,
} from "../domains/hunts/hunts.service";
import { spawnDailyOffers, expireStaleOffers } from "../domains/hunts/offers.service";
import { ensureDailyObjectives, evaluateObjectives } from "../domains/objectives/objectives.service";
import { unreadNotificationCount } from "../domains/notifications/notifications.service";
import { dailyFlag } from "./daily-state";
import { weekStartMs } from "../domains/performance/performance.service";
import { moduleEffectsForBoard, moduleInventoryRows, moduleLoadoutSummaries, modulePartsRows, MODULE_CONFIG_VERSION, moduleEntry, pendingModuleRewards } from "../domains/modules/modules.service";
import {
  liveopsCampaignRows,
  liveopsCasesView,
  liveopsInventoryRows,
  liveopsPassView,
  liveopsShopView,
} from "../domains/liveops/liveops.service";
import { currentEmpireLevel, hasTutorialCashAccessSynergy, onboardingSnapshot, recordOnboardingMilestone } from "../domains/player/onboarding.service";
import { empireProgress, hexBoardRows, ownedLandRows } from "../domains/land/land.service";
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
  /** Persisted per-segment customer counts (legacy v0.1 column; v0.2 derives segments from the board). */
  customerSegments: CustomerSegments | null;
  /** Legacy acquisition-boost window end (ms epoch); no longer read by settle. */
  acquisitionBoostUntil: number;
  empireLevel: number;
  empireXp: number;
  /** v1.0 completed promotion flags (rank names + revenue_tier entries). */
  promotions: string[];
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
    customerSegments: p.customerSegments == null ? null : normalizeCustomerSegments(p.customerSegments as Partial<CustomerSegments>),
    acquisitionBoostUntil: num(p.acquisitionBoostUntil),
    empireLevel: p.empireLevel,
    empireXp: p.empireXp,
    promotions: Array.isArray(p.promotions) ? (p.promotions as unknown[]).filter((entry): entry is string => typeof entry === "string") : [],
  };
}

/**
 * Canonical offer-board convergence (retention spec sheet 05): expire stale
 * hunts/offers, then spawn exactly 3 offers for (player, day) — idempotent by
 * (player, day), callable from the daily reset job and this lazy snapshot
 * path. Returns today's offers plus any cross-day STARTED hunts (started
 * hunts keep their own real-time expiry; max 5 ACTIVE).
 */
export async function ensureMarketHunts(playerId: string, board: PlacedCard[], portfolio: Record<string, number>, day: string): Promise<MarketHuntSlot[]> {
  await expireStaleOffers(playerId, day);
  await spawnDailyOffers(playerId, day);
  return loadVisibleHunts(playerId, day);
}

/** Today's offers + still-running started hunts from earlier UTC days. */
export async function loadVisibleHunts(playerId: string, day: string): Promise<MarketHuntSlot[]> {
  const now = Date.now();
  const rows = await prisma.marketHuntSlot.findMany({
    where: {
      playerId,
      OR: [
        { issuedDay: day },
        { started: true, status: { in: ["active", "cash_fallback"] } },
      ],
    },
    orderBy: { issuedAt: "asc" },
  });
  return rows
    .filter((row) => row.status !== "expired" && (row.started ? num(row.expiresAt) > now : row.issuedDay === day))
    .map(marketHuntRow);
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
    .map((card) => [card.id, resolveType(card.type), card.hexId].join(":"))
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
  const landRows = await ownedLandRows(playerId);
  // v1.0 progression view: the displayed level is the persisted (gate-capped)
  // level; the candidate level and the active gate are evaluated live.
  const progressionEval = evaluateProgression({
    xp: p.empireXp,
    ownedHexes: landRows.length,
    builtBusinesses: p.board.length,
    stage2PlusBuildings: p.board.filter((card) => card.stage >= 2).length,
    uniqueStocks: Object.values(map).filter((units) => units > 0).length,
    completedPromotions: p.promotions,
  });
  const hexBoard = {
    hexes: hexBoardRows(landRows),
    ownedCount: landRows.length,
    capacityForLevel: maxHexesForLevel(progressionLevel),
    candidateLevel: progressionEval.candidateLevel,
    activeGate: progressionEval.activeGate,
    ...empireProgress(progressionLevel, p.empireXp),
  };
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
      started: slot.started,
      claimed: slot.status === "claimed",
      progress,
      ready: slot.started && slot.status === "active" && progress.done && (!slot.stockTicker || gate.eligible),
      claimBlockedReason: slot.started && slot.stockTicker && !gate.eligible ? gate.reason : null,
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
  // --- Retention loop read model (additive; spec sheets 05/07/08/09/10/14) ---
  const playerDailyState = await prisma.playerDailyState.findUnique({ where: { playerId_day: { playerId, day } } });
  const activeHuntCount = hunts.filter((slot) => slot.started && (slot.status === "active" || slot.status === "cash_fallback")).length;
  await ensureDailyObjectives(playerId, day, stage, {
    population: metrics.population,
    capacity: metrics.capacity,
    cardCount: activeBoard.length,
  });
  const objectives = await evaluateObjectives(playerId, day);
  const nowMs = Date.now();
  const announced = announcedWindowsForWeek(week);
  const weekClosesAt = weekStartMs(week) + 7 * 86_400_000;
  const priorWeek = isoWeek(new Date(nowMs - 7 * 86_400_000));
  const [currentManifest, priorManifest] = await Promise.all([
    prisma.weeklySnapshot.findUnique({ where: { week }, select: { status: true } }),
    prisma.weeklySnapshot.findUnique({ where: { week: priorWeek }, select: { status: true } }),
  ]);
  const streakRow = await prisma.player.findUnique({ where: { id: playerId }, select: { operatingStreak: true, longestStreak: true } });
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
    empireXp: p.empireXp,
    hexBoard,
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
    activeHuntCount,
    rerollAvailable: !(playerDailyState?.huntRerolled ?? false),
    huntOffers: hunts.filter((slot) => !slot.started),
    objectives: {
      day,
      rerollAvailable: !(playerDailyState?.objectiveRerolled ?? false),
      lanes: objectives,
    },
    eventCalendar: {
      week,
      current: currentAnnouncedWindow(week, nowMs),
      announced,
    },
    weekStatus: {
      week,
      status: (currentManifest?.status ?? "open") as "open" | "pending" | "finalized",
      closesAt: weekClosesAt,
      msUntilClose: Math.max(0, weekClosesAt - nowMs),
      priorWeek: { week: priorWeek, status: priorManifest?.status ?? "open" },
    },
    operatingStreak: streakRow?.operatingStreak ?? 0,
    longestStreak: streakRow?.longestStreak ?? 0,
    notificationsUnread: await unreadNotificationCount(playerId),
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
    liveops: {
      inventory: await liveopsInventoryRows(playerId),
      campaigns: await liveopsCampaignRows(playerId),
      cases: await liveopsCasesView(playerId),
      pass: await liveopsPassView(playerId),
      shop: await liveopsShopView(playerId),
    },
  };
}
