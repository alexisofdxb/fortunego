import { createHash } from "node:crypto";
import {
  OFFLINE_CONFIG,
  normalizeCustomerSegments,
  seedForDay,
  settleDistrict,
  splitOfflineWindow,
  utcDay,
  isoWeek,
  marketStageForEmpireLevel,
  marketEventForDay,
  offlineCatchUpMinor,
  offlineNetPerHour,
  POPULATION_PER_CASH_DAY,
  type CustomerSegments,
  type OfflineSlice,
  type PlacedCard,
} from "@plotgo/game";
import { prisma } from "../infrastructure/postgres/client";
import { newId, num, parseDays, parseNumberMap } from "./types";
import { archetypeResolutionForPlayer, districtDay, effectiveDistrictEvent, loadCards, operatingBoard } from "../domains/plot/board.service";
import { eventState } from "../domains/events/events.service";
import { moduleEffectsForBoard } from "../domains/modules/modules.service";
import { recordOnboardingMilestone, onboardingMilestoneRows, currentEmpireLevel } from "../domains/player/onboarding.service";
import { auditEvent } from "../domains/plot/audit.service";

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
  customerSegments: CustomerSegments | null;
  acquisitionBoostUntil: number;
};

export async function presenceRow(playerId: string): Promise<PresenceRow | undefined> {
  const row = await prisma.player.findUnique({ where: { id: playerId } });
  if (!row) return undefined;
  const presence: PresenceRow = {
    id: row.id,
    createdAt: num(row.createdAt),
    cashMinor: num(row.cashMinor),
    earnedMinor: num(row.earnedMinor),
    population: row.population,
    capacity: row.capacity,
    satisfactionBps: row.satisfactionBps,
    riskBps: row.riskBps,
    reputationBps: row.reputationBps,
    conditionBps: row.conditionBps,
    transactions: row.transactions,
    volumeMinor: num(row.volumeMinor),
    lastMeaningfulActionAt: num(row.lastMeaningfulActionAt),
    offlineStartedAt: num(row.offlineStartedAt),
    offlineProcessedUntil: num(row.offlineProcessedUntil),
    presenceState: row.presenceState,
    offlineSessionId: row.offlineSessionId,
    activeDays: JSON.stringify(row.activeDays ?? []),
    activeMinutesDailyJson: JSON.stringify(row.activeMinutesDailyJson ?? {}),
    meaningfulActionsDailyJson: JSON.stringify(row.meaningfulActionsDailyJson ?? {}),
    customerSegments: row.customerSegments == null ? null : normalizeCustomerSegments(row.customerSegments as Partial<CustomerSegments>),
    acquisitionBoostUntil: num(row.acquisitionBoostUntil),
  };
  const now = Date.now();
  const lastAction = presence.lastMeaningfulActionAt || presence.createdAt || now;
  const cursor = presence.offlineProcessedUntil || presence.createdAt || now;
  if (!presence.lastMeaningfulActionAt || !presence.offlineProcessedUntil || !presence.offlineStartedAt) {
    await prisma.player.update({
      where: { id: playerId },
      data: {
        lastMeaningfulActionAt: lastAction,
        offlineStartedAt: lastAction,
        offlineProcessedUntil: cursor,
        presenceState: presence.presenceState ?? "engaged",
      },
    });
    presence.lastMeaningfulActionAt = lastAction;
    presence.offlineStartedAt = lastAction;
    presence.offlineProcessedUntil = cursor;
  }
  return presence;
}

export async function recordMeaningfulAction(playerId: string, action: string, now = Date.now()) {
  const row = await presenceRow(playerId);
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
  await prisma.player.update({
    where: { id: playerId },
    data: {
      lastMeaningfulActionAt: now,
      offlineStartedAt: now,
      offlineProcessedUntil: now,
      presenceState: "engaged",
      offlineSessionId: null,
      activeDays: retainedDays,
      activeMinutesDailyJson: minutesByDay,
      meaningfulActionsDailyJson: actionsByDay,
      lastSettleAt: now,
    },
  });
  await prisma.plotgoEventAudit.create({
    data: {
      id: newId(),
      playerId,
      eventId: null,
      auditType: "meaningful_action",
      resolutionHash: createHash("sha256").update(`${playerId}:${action}:${now}`).digest("hex"),
      payloadJson: { action, activeMinutes: minutesByDay[day], qualifyingActiveDay: retainedDays.includes(day) },
      createdAt: now,
    },
  });
  if ((await onboardingMilestoneRows(playerId)).some((milestone) => milestone.milestoneId === "onboarding_first_performance")) {
    await recordOnboardingMilestone(playerId, "onboarding_freeplay", `meaningful:${action}`, now);
  }
}

export type OfflineSummary = {
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

export async function offlineSummaryRow(playerId: string): Promise<OfflineSummary | null> {
  const row = await prisma.plotgoOfflineSummary.findFirst({
    where: { playerId, viewedAt: null },
    orderBy: { returnedAt: "desc" },
  });
  if (!row || num(row.returnedAt) - num(row.awayStartedAt) < OFFLINE_CONFIG.summaryThresholdMin * 60_000) return null;
  return {
    summaryId: row.summaryId,
    offlineSessionId: row.offlineSessionId,
    awayStartedAt: num(row.awayStartedAt),
    returnedAt: num(row.returnedAt),
    processedUntil: num(row.processedUntil),
    frozenMs: num(row.frozenMs),
    cashDeltaMinor: num(row.cashDeltaMinor),
    customerDelta: row.customerDelta,
    revenueCreditMinor: num(row.revenueCreditMinor),
    growthCredit: row.growthCredit,
    bands: (row.bandsJson as OfflineSummary["bands"]) ?? [],
    events: (row.eventsJson as string[]) ?? [],
    risk: (row.riskJson as OfflineSummary["risk"]) ?? { beforeBps: 0, afterBps: 0 },
    viewedAt: row.viewedAt == null ? null : num(row.viewedAt),
  };
}

export async function processOfflineCatchup(playerId: string, now = Date.now()): Promise<OfflineSummary | null> {
  const row = await presenceRow(playerId);
  if (!row) return null;
  const lastAction = row.lastMeaningfulActionAt || row.createdAt || now;
  const offlineStart = lastAction;
  const firstOfflineAt = lastAction + OFFLINE_CONFIG.afkTimeoutMin * 60_000;
  const cursor = Math.max(row.offlineProcessedUntil || row.createdAt, firstOfflineAt);
  const capUntil = lastAction + OFFLINE_CONFIG.accrualCapHours * 3_600_000;
  if (now <= firstOfflineAt) {
    await prisma.player.update({
      where: { id: playerId },
      data: { presenceState: now - lastAction > OFFLINE_CONFIG.afkTimeoutMin * 60_000 ? "afk_online" : "engaged" },
    });
    return offlineSummaryRow(playerId);
  }
  const bucketMs = 30 * 60_000;
  const processedUntil = now >= capUntil
    ? capUntil
    : Math.min(capUntil, firstOfflineAt + Math.floor(Math.max(0, now - firstOfflineAt) / bucketMs) * bucketMs);
  const slices = splitOfflineWindow(cursor, processedUntil, offlineStart);
  const board = operatingBoard(await loadCards(playerId));
  const stage = marketStageForEmpireLevel(await currentEmpireLevel(playerId, board));
  const eventLayer = await eventState(playerId, board, stage, row.createdAt, now);
  const day = utcDay(now);
  const dayData = await districtDay(playerId, day);
  const marketEvent = marketEventForDay(day, playerId);
  const activeEvent = effectiveDistrictEvent(dayData.event, marketEvent, 0, eventLayer.modifiers);
  const moduleEffects = await moduleEffectsForBoard(playerId, board, [eventLayer.global.id, ...eventLayer.personalEvents.map((event) => event.id)], eventLayer.cycle.state);
  const sessionId = row.offlineSessionId ?? newId();
  // v0.2 offline economy: the catch-up credit is the board's expected net Cash
  // (offlineCatchUpMinor: 0.5 efficiency, 12h cap inside), scaled per bucket
  // by the offline band's cashEfficiency. No v0.1 customer dynamics.
  const netPerHour = offlineNetPerHour(board);
  const expectedCustomers = Math.round((netPerHour * 24) / POPULATION_PER_CASH_DAY);
  let state = {
    cashMinor: row.cashMinor,
    earnedMinor: row.earnedMinor,
    population: row.population,
    capacity: row.capacity,
    satisfactionBps: row.satisfactionBps,
    riskBps: row.riskBps,
    reputationBps: row.reputationBps,
    conditionBps: row.conditionBps,
    transactions: row.transactions,
    volumeMinor: row.volumeMinor,
  };
  let cashDeltaTotal = 0;
  let customerDeltaTotal = 0;
  let revenueCreditTotal = 0;
  let growthCreditTotal = 0;
  let riskBefore = state.riskBps;
  const bands = new Map<string, { band: string; durationMs: number; cashEfficiency: number; customerIntensity: number }>();
  const events = [...new Set([eventLayer.global.id, ...eventLayer.personalEvents.map((event) => event.id)])];
  await prisma.$transaction(async (tx) => {
    await tx.plotgoOfflineSession.createMany({
      data: [{
        offlineSessionId: sessionId,
        playerId,
        startedAt: lastAction,
        processedFrom: cursor,
        processedUntil,
        capUntil,
        presenceState: "offline",
        status: "processed",
        configVersion: OFFLINE_CONFIG.configVersion,
        createdAt: now,
        completedAt: now,
      }],
      skipDuplicates: true,
    });
    for (let index = 0; index < slices.length; index++) {
      const slice: OfflineSlice = slices[index]!;
      const bucketId = createHash("sha256").update(`${sessionId}:${slice.startAt}:${slice.endAt}`).digest("hex").slice(0, 32);
      const existingBucket = await tx.plotgoOfflineBucket.findUnique({ where: { bucketId } });
      if (existingBucket) continue;
      const hours = slice.durationMs / 3_600_000;
      const settled = settleDistrict(board, activeEvent, "walk", state, seedForDay(day, `${playerId}:${bucketId}`), moduleEffects, (await archetypeResolutionForPlayer(playerId, board)).effects);
      // Single v0.2 credit per bucket: expected net × band cashEfficiency.
      const cashDelta = Math.round(offlineCatchUpMinor(board, hours) * slice.cashEfficiency);
      // Customers are derived from the board's expected net (deterministic).
      const nextPopulation = expectedCustomers;
      const customerDelta = nextPopulation - state.population;
      const riskAfter = Math.max(0, Math.min(9_500, Math.round(state.riskBps + (settled.riskBps - state.riskBps) * slice.riskIntensity)));
      const reputationAfter = Math.max(0, Math.min(10_000, Math.min(state.reputationBps, settled.reputationBps)));
      const conditionAfter = Math.max(0, Math.min(10_000, Math.round(state.conditionBps + (settled.conditionBps - state.conditionBps) * slice.customerIntensity)));
      const txDelta = Math.max(0, Math.round(settled.transactions * hours * slice.customerIntensity));
      const volumeDelta = Math.max(0, Math.round(settled.volumeMinor * hours * slice.cashEfficiency));
      const revenueCredit = Math.max(0, Math.round(cashDelta * slice.performanceRevenueCredit));
      const growthCredit = Math.max(0, customerDelta * slice.performanceGrowthCredit);
      await tx.plotgoOfflineBucket.create({
        data: {
          bucketId,
          offlineSessionId: sessionId,
          playerId,
          startAt: slice.startAt,
          endAt: slice.endAt,
          band: slice.band,
          presenceState: "offline",
          cashEfficiency: slice.cashEfficiency,
          customerIntensity: slice.customerIntensity,
          cashDeltaMinor: cashDelta,
          customerDelta,
          performanceRevenueCreditMinor: revenueCredit,
          performanceGrowthCredit: growthCredit,
          riskBeforeBps: state.riskBps,
          riskAfterBps: riskAfter,
          createdAt: now,
        },
      });
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
    await tx.player.update({
      where: { id: playerId },
      data: {
        cashMinor: state.cashMinor,
        earnedMinor: state.earnedMinor,
        population: state.population,
        capacity: state.capacity,
        satisfactionBps: state.satisfactionBps,
        riskBps: state.riskBps,
        reputationBps: state.reputationBps,
        conditionBps: state.conditionBps,
        transactions: state.transactions,
        volumeMinor: state.volumeMinor,
        offlineStartedAt: offlineStart,
        offlineProcessedUntil: processedUntil,
        lastSettleAt: processedUntil,
        presenceState: now >= capUntil ? "frozen" : "offline",
        offlineSessionId: sessionId,
      },
    });
    const aggregate = await tx.plotgoOfflineBucket.aggregate({
      where: { offlineSessionId: sessionId },
      _sum: { cashDeltaMinor: true, customerDelta: true, performanceRevenueCreditMinor: true, performanceGrowthCredit: true },
      _min: { startAt: true },
      _max: { endAt: true },
    });
    const aggregateBands = await tx.$queryRaw<{ band: string; durationMs: number; cashEfficiency: number; customerIntensity: number }[]>`
      SELECT band, SUM("endAt" - "startAt") AS "durationMs", MAX("cashEfficiency") AS "cashEfficiency",
        MAX("customerIntensity") AS "customerIntensity"
      FROM plotgo_offline_buckets WHERE "offlineSessionId" = ${sessionId} GROUP BY band ORDER BY MIN("startAt")
    `;
    const summaryCashDelta = Number(aggregate._sum.cashDeltaMinor ?? cashDeltaTotal);
    const summaryCustomerDelta = Number(aggregate._sum.customerDelta ?? customerDeltaTotal);
    const summaryRevenueCredit = Number(aggregate._sum.performanceRevenueCreditMinor ?? revenueCreditTotal);
    const summaryGrowthCredit = Number(aggregate._sum.performanceGrowthCredit ?? growthCreditTotal);
    const summaryBands = (aggregateBands.length ? aggregateBands : [...bands.values()]).map((band) => ({
      band: band.band,
      durationMs: Number(band.durationMs),
      cashEfficiency: Number(band.cashEfficiency),
      customerIntensity: Number(band.customerIntensity),
    }));
    const summaryJson = { cashDeltaMinor: summaryCashDelta, customerDelta: summaryCustomerDelta, revenueCreditMinor: summaryRevenueCredit, growthCredit: summaryGrowthCredit, bands: summaryBands, events, riskBeforeBps: riskBefore, riskAfterBps: state.riskBps };
    await tx.plotgoOfflineSession.update({
      where: { offlineSessionId: sessionId },
      data: { processedUntil, status: now >= capUntil ? "frozen" : "processed", summaryJson, completedAt: now },
    });
    const week = isoWeek(new Date(`${day}T00:00:00Z`));
    await tx.$executeRaw`
      INSERT INTO weekly_performance ("playerId", week, stage, "activeDays", "revenueMinor", "newRetainedCustomers")
      VALUES (${playerId}, ${week}, ${stage}, 0, ${revenueCreditTotal}, ${growthCreditTotal})
      ON CONFLICT ("playerId", week) DO UPDATE SET
        stage = EXCLUDED.stage,
        "revenueMinor" = weekly_performance."revenueMinor" + EXCLUDED."revenueMinor",
        "newRetainedCustomers" = weekly_performance."newRetainedCustomers" + EXCLUDED."newRetainedCustomers"
    `;
    const summaryId = (await tx.plotgoOfflineSummary.findUnique({ where: { offlineSessionId: sessionId }, select: { summaryId: true } }))?.summaryId ?? newId();
    await tx.$executeRaw`
      INSERT INTO plotgo_offline_summaries
        ("summaryId", "offlineSessionId", "playerId", "awayStartedAt", "returnedAt", "processedUntil", "frozenMs", "cashDeltaMinor", "customerDelta", "revenueCreditMinor", "growthCredit", "bandsJson", "eventsJson", "riskJson", "createdAt")
      VALUES (${summaryId}, ${sessionId}, ${playerId}, ${Number(aggregate._min.startAt ?? lastAction)}, ${now}, ${Number(aggregate._max.endAt ?? processedUntil)}, ${frozenMs}, ${summaryCashDelta}, ${summaryCustomerDelta}, ${summaryRevenueCredit}, ${summaryGrowthCredit}, ${JSON.stringify(summaryBands)}::jsonb, ${JSON.stringify(events)}::jsonb, ${JSON.stringify({ beforeBps: riskBefore, afterBps: state.riskBps })}::jsonb, ${now})
      ON CONFLICT ("offlineSessionId") DO UPDATE SET
        "returnedAt" = EXCLUDED."returnedAt",
        "processedUntil" = EXCLUDED."processedUntil",
        "frozenMs" = EXCLUDED."frozenMs",
        "cashDeltaMinor" = EXCLUDED."cashDeltaMinor",
        "customerDelta" = EXCLUDED."customerDelta",
        "revenueCreditMinor" = EXCLUDED."revenueCreditMinor",
        "growthCredit" = EXCLUDED."growthCredit",
        "bandsJson" = EXCLUDED."bandsJson",
        "eventsJson" = EXCLUDED."eventsJson",
        "riskJson" = EXCLUDED."riskJson"
    `;
  });
  return offlineSummaryRow(playerId);
}
