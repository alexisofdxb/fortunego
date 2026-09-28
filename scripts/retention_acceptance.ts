import { execFileSync, spawn, type ChildProcess } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import { randomUUID } from "node:crypto";
import dotenv from "dotenv";
import { PrismaClient } from "@prisma/client";
import { announcedWindowsForWeek, isoWeek, objectiveRewardMinor, unlockedHexIds } from "@plotgo/game";

// Retention loop acceptance (PLOT_Daily_Weekly_Retention_Loop_v1.0):
// offer board cadence/expiry/reroll, daily objectives + evidence completion,
// active-day eligibility + cosmetic streak, settlement pending -> finalized
// with a deduped claimable notification, deterministic event calendar, and
// the notification inbox endpoints. Spawned API on port 8797.

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const require = createRequire(path.join(scriptDir, "package.json"));
dotenv.config({ path: path.resolve(scriptDir, "../.env") });

const repoRoot = path.resolve(scriptDir, "..");
const apiCwd = path.join(repoRoot, "apps", "api");
const tsxCli = path.join(path.dirname(require.resolve("tsx/package.json", { paths: [apiCwd] })), "dist", "cli.mjs");
const apiPort = 8797;
const baseUrl = `http://127.0.0.1:${apiPort}`;
const adminToken = process.env.ADMIN_TOKEN ?? "change-me-to-a-long-random-string";
const playerA = `retention-a-${randomUUID()}`;
const playerB = `retention-b-${randomUUID()}`;
const playerC = `retention-c-${randomUUID()}`;
const playerIds = [playerA, playerB, playerC];
const prisma = new PrismaClient();

// Weekly manifest state captured before the test mutates it (cleanup restores
// or removes it; other suites share the week row).
let manifestExisted = false;
let manifestPriorStatus: string | null = null;

type JsonObject = Record<string, any>;

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function utcDayAt(now: number): string {
  return new Date(now).toISOString().slice(0, 10);
}

const now = Date.now();
const today = utcDayAt(now);
const yesterday = utcDayAt(now - 86_400_000);
const currentWeek = isoWeek(new Date(now));
const priorWeek = isoWeek(new Date(now - 7 * 86_400_000));

async function request(pathname: string, init: RequestInit = {}, playerId?: string, admin = false): Promise<JsonObject> {
  const headers = new Headers(init.headers);
  headers.set("content-type", "application/json");
  if (playerId) headers.set("x-player-id", playerId);
  if (admin) headers.set("authorization", `Bearer ${adminToken}`);
  const response = await fetch(`${baseUrl}${pathname}`, { ...init, headers });
  const body = await response.json().catch(() => ({}));
  return { status: response.status, ...body } as JsonObject;
}

async function get(pathname: string, playerId?: string, admin = false): Promise<JsonObject> {
  return request(pathname, {}, playerId, admin);
}

async function post(pathname: string, body: JsonObject, playerId?: string, admin = false): Promise<JsonObject> {
  return request(pathname, { method: "POST", body: JSON.stringify(body) }, playerId, admin);
}

async function postOk(pathname: string, body: JsonObject, playerId?: string, admin = false): Promise<JsonObject> {
  const result = await post(pathname, body, playerId, admin);
  assert(result.status === undefined || result.status === 200, `POST ${pathname} failed: ${JSON.stringify(result)}`);
  return result;
}

async function postExpectStatus(pathname: string, body: JsonObject, playerId: string | undefined, status: number, admin = false): Promise<JsonObject> {
  const result = await post(pathname, body, playerId, admin);
  assert(result.status === status, `POST ${pathname} expected ${status}, got ${JSON.stringify(result)}`);
  return result;
}

async function waitForApi(): Promise<void> {
  try {
    const response = await fetch(`${baseUrl}/health`);
    if (response.ok) throw new Error(`port ${apiPort} is already serving an API; a stale test server may still be running`);
  } catch (error) {
    if (error instanceof Error && error.message.includes("already serving")) throw error;
  }
  for (let attempt = 0; attempt < 60; attempt++) {
    try {
      const response = await fetch(`${baseUrl}/health`);
      if (response.ok) return;
    } catch {
      // The API is still starting.
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error("Timed out waiting for the retention acceptance API");
}

async function cashOf(playerId: string): Promise<number> {
  const row = await prisma.player.findUnique({ where: { id: playerId }, select: { cashMinor: true } });
  return Number(row?.cashMinor ?? 0);
}

/** Mirror of POST /api/session's player creation, without the snapshot call
 * (so fixtures exist before the first offer spawn). */
async function createPlayerDirect(playerId: string, population = 0): Promise<void> {
  await prisma.player.create({
    data: {
      id: playerId,
      createdAt: now,
      founder: true,
      cashMinor: 10_000_000,
      earnedMinor: 0,
      lastSettleAt: now,
      exchangeActionsToday: 0,
      huntDay: today,
      huntId: "upgrade_any",
      huntClaimed: false,
      weeklyScore: 0,
      riskBps: 700,
      reputationBps: 5_000,
      conditionBps: 10_000,
      population,
      capacity: 0,
      satisfactionBps: 5_000,
      transactions: 0,
      volumeMinor: 0,
      lastMeaningfulActionAt: now,
      offlineStartedAt: now,
      offlineProcessedUntil: now,
      presenceState: "engaged",
    },
  });
}

async function seedBoard(playerId: string): Promise<string[]> {
  const hexes = unlockedHexIds("humble");
  const cards = [
    { id: `retention-card-trade-${randomUUID()}`, type: "trading_booth", hexId: hexes[0]! },
    { id: `retention-card-fund-${randomUUID()}`, type: "small_fund", hexId: hexes[1]! },
    { id: `retention-card-loan-${randomUUID()}`, type: "micro_loan", hexId: hexes[2]! },
  ];
  await prisma.card.createMany({
    data: cards.map((card) => ({ ...card, playerId, stage: 1, placedAt: now, operationalUntil: 0 })),
  });
  return cards.map((card) => card.id);
}

async function cleanupFixtures(): Promise<void> {
  const delegates = [
    "plotgoOnboardingMilestone", "plotgoTutorialRecoveryLedger", "card", "fragment",
    "plotgoPosition", "marketHuntSlot", "weeklyPerformance",
    "plotgoLedger", "plotgoDistrictDay", "plotgoSession", "plotgoPlacementAudit",
    "plotgoPlayerEvent", "plotgoEventMission", "plotgoEventAudit", "plotgoModuleRewardEvent",
    "playerModuleInventory", "buildingModuleLoadout", "moduleLoadoutAudit", "buildingMasteryProgress",
    "modulePartsBalance", "modulePartsLedger", "moduleCraftJob", "plotgoOfflineSession",
    "plotgoOfflineBucket", "plotgoOfflineSummary",
    "plotgoObjectiveState", "playerDailyState", "notificationOutbox",
  ] as const;
  await prisma.$transaction(async (tx) => {
    await tx.plotgoVisit.deleteMany({ where: { OR: [{ visitorId: { in: playerIds } }, { hostId: { in: playerIds } }] } });
    await tx.plotgoInvestment.deleteMany({ where: { OR: [{ visitorId: { in: playerIds } }, { hostId: { in: playerIds } }] } });
    for (const delegate of delegates) {
      // @ts-expect-error dynamic delegate access for fixture cleanup
      await tx[delegate].deleteMany({ where: { playerId: { in: playerIds } } });
    }
    await tx.player.deleteMany({ where: { id: { in: playerIds } } });
  });
  // Restore/remove the shared weekly manifest row to its pre-test state.
  if (manifestExisted) {
    if (manifestPriorStatus) {
      await prisma.weeklySnapshot.updateMany({ where: { week: priorWeek }, data: { status: manifestPriorStatus } });
    }
  } else {
    await prisma.weeklySnapshot.deleteMany({ where: { week: priorWeek } });
  }
}

async function runAcceptance(): Promise<void> {
  // --- Fixtures -------------------------------------------------------------
  await createPlayerDirect(playerA, 10);
  await createPlayerDirect(playerB, 0);
  await createPlayerDirect(playerC, 5);
  await seedBoard(playerA);
  const capPerObjective = objectiveRewardMinor("humble");
  const capThreeObjectives = 3 * capPerObjective;

  // --- 1. Offer board: 3 offers/day, started flag, countdown ----------------
  const sessionA = await postOk("/api/session", { playerId: playerA });
  const plotA = sessionA.plot as JsonObject;
  const offersA = (plotA.hunts as JsonObject[]).filter((hunt) => !hunt.started);
  assert(offersA.length === 3, `expected 3 daily offers, got ${offersA.length}`);
  assert(plotA.activeHuntCount === 0, "no started hunts yet");
  assert(plotA.rerollAvailable === true, "reroll must be available at day start");
  assert(typeof plotA.notificationsUnread === "number", "snapshot must expose notificationsUnread");
  const announced = (plotA.eventCalendar as JsonObject).announced as JsonObject[];
  assert(Array.isArray(announced) && announced.length <= 2, "announced calendar must expose <=2 windows");
  assert(
    JSON.stringify(announcedWindowsForWeek(currentWeek)) === JSON.stringify(announcedWindowsForWeek(currentWeek)),
    "announced windows must be deterministic",
  );
  const weekStatusSnapshot = plotA.weekStatus as JsonObject;
  assert(["open", "pending", "finalized"].includes(weekStatusSnapshot.status as string), "weekStatus.status must be exposed");
  assert(typeof weekStatusSnapshot.msUntilClose === "number" && weekStatusSnapshot.msUntilClose > 0, "countdown must be positive mid-week");

  // Claiming an unstarted offer is rejected (no started hunt selected).
  await postExpectStatus("/api/hunt/claim", { huntId: offersA[0]!.id }, playerA, 400);
  // Start two offers: real-time expiry begins at start (not the daily reset).
  const [offer1, offer2, offer3] = offersA;
  await postOk("/api/hunts/start", { huntId: offer1!.id }, playerA);
  const started2 = await postOk("/api/hunts/start", { huntId: offer2!.id }, playerA);
  assert(started2.activeHuntCount === 2, "activeHuntCount must be 2 after starting two offers");
  const startedEntry = (started2.hunts as JsonObject[]).find((hunt) => hunt.id === offer1!.id)!;
  assert(startedEntry.started === true, "started hunt must carry started=true");
  const nextMidnight = Date.UTC(new Date(now + 86_400_000).getUTCFullYear(), new Date(now + 86_400_000).getUTCMonth(), new Date(now + 86_400_000).getUTCDate());
  assert((startedEntry.expiresAt as number) > nextMidnight, "started hunt must keep its own real-time expiry beyond the daily reset");

  // --- 2. Max-5 ACTIVE + queue-full semantics --------------------------------
  const templates = (await prisma.marketHuntSlot.findMany({ where: { playerId: playerA, issuedDay: today }, take: 1 })).map((row) => row.templateId);
  for (let i = 0; i < 3; i++) {
    await prisma.marketHuntSlot.create({
      data: {
        id: `retention-seeded-active-${i}-${randomUUID()}`,
        playerId: playerA,
        issuedDay: today,
        week: currentWeek,
        templateId: templates[0]!,
        difficulty: "easy",
        rewardRarity: "common",
        points: 1,
        target: 1,
        issuedAt: now + 100 + i,
        expiresAt: now + 24 * 3_600_000,
        status: "active",
        reservedMinor: 0,
        started: true,
      },
    });
  }
  await postExpectStatus("/api/hunts/start", { huntId: offer3!.id }, playerA, 409);
  const queueFullSnap = await postOk("/api/session", { playerId: playerA });
  assert(queueFullSnap.plot.activeHuntCount === 5, "activeHuntCount must cap at 5");
  const unstartedAfterFull = (queueFullSnap.plot.hunts as JsonObject[]).filter((hunt) => !hunt.started);
  assert(
    unstartedAfterFull.length === 1 && unstartedAfterFull[0]!.id === offer3!.id && unstartedAfterFull[0]!.status === "active",
    "unstarted offers must remain available (never deleted) even when the active queue is full",
  );

  // --- 3. Free reroll: replaces one unstarted offer, then 409 ---------------
  const unstartedBeforeReroll = unstartedAfterFull.map((hunt) => hunt.id as string).sort();
  const startedBeforeReroll = (queueFullSnap.plot.hunts as JsonObject[]).filter((hunt) => hunt.started).map((hunt) => hunt.id as string).sort();
  const reroll = await postOk("/api/hunts/reroll", {}, playerA);
  assert(reroll.rerollAvailable === false, "reroll must be consumed after one use");
  const unstartedAfterReroll = (reroll.hunts as JsonObject[]).filter((hunt) => !hunt.started);
  assert(unstartedAfterReroll.length === 1, "reroll must replace (not remove) an unstarted offer");
  const unstartedIdsAfter = unstartedAfterReroll.map((hunt) => hunt.id as string).sort();
  assert(
    JSON.stringify(unstartedIdsAfter) !== JSON.stringify(unstartedBeforeReroll),
    "reroll must deterministically replace exactly one unstarted offer",
  );
  assert(
    JSON.stringify((reroll.hunts as JsonObject[]).filter((hunt) => hunt.started).map((hunt) => hunt.id as string).sort()) === JSON.stringify(startedBeforeReroll),
    "started hunts must survive a reroll",
  );
  await postExpectStatus("/api/hunts/reroll", {}, playerA, 409);
  // Cannot reroll a started hunt by id.
  await postExpectStatus("/api/hunts/reroll", { huntId: offer1!.id }, playerB, 404);

  // --- 4. Daily reset: expiry, eligibility, streak, respawn ------------------
  await prisma.player.update({
    where: { id: playerA },
    data: { activeMinutesDailyJson: { [yesterday]: 12 }, meaningfulActionsDailyJson: { [yesterday]: 1 } },
  });
  await prisma.player.update({
    where: { id: playerB },
    data: { activeMinutesDailyJson: { [yesterday]: 20 }, meaningfulActionsDailyJson: { [yesterday]: 0 } },
  });
  // Prior-day fixtures: an unstarted offer (expires at reset) and a started
  // hunt (keeps its own real-time expiry).
  await prisma.marketHuntSlot.create({
    data: {
      id: `retention-yesterday-offer-${randomUUID()}`,
      playerId: playerA,
      issuedDay: yesterday,
      week: isoWeek(new Date(`${yesterday}T00:00:00Z`)),
      templateId: templates[0]!,
      difficulty: "easy",
      rewardRarity: "common",
      points: 1,
      target: 1,
      issuedAt: now - 20 * 3_600_000,
      expiresAt: now - 4 * 3_600_000,
      status: "active",
      reservedMinor: 0,
      started: false,
    },
  });
  const yesterdayStartedId = `retention-yesterday-started-${randomUUID()}`;
  await prisma.marketHuntSlot.create({
    data: {
      id: yesterdayStartedId,
      playerId: playerA,
      issuedDay: yesterday,
      week: isoWeek(new Date(`${yesterday}T00:00:00Z`)),
      templateId: templates[0]!,
      difficulty: "easy",
      rewardRarity: "common",
      points: 1,
      target: 1,
      issuedAt: now - 20 * 3_600_000,
      expiresAt: now + 1 * 3_600_000,
      status: "active",
      reservedMinor: 0,
      started: true,
    },
  });
  const cashBeforeReset = await cashOf(playerA);
  const reset1 = await postOk("/api/admin/jobs/daily-reset", {}, undefined, true);
  assert(reset1.ok === true, "daily-reset job must run");
  const yesterdayOffer = await prisma.marketHuntSlot.findFirst({ where: { playerId: playerA, issuedDay: yesterday, started: false } });
  assert(yesterdayOffer?.status === "expired", "unstarted offers must expire at the next reset");
  const yesterdayStarted = await prisma.marketHuntSlot.findUnique({ where: { id: yesterdayStartedId } });
  assert(yesterdayStarted?.status === "active", "started hunts must survive the daily reset");
  const dailyA = await prisma.playerDailyState.findUnique({ where: { playerId_day: { playerId: playerA, day: yesterday } } });
  assert(dailyA?.eligible === true && dailyA.engagedMinutes === 12 && dailyA.meaningfulActions === 1, "10 engaged min + 1 action must qualify as an eligible active day");
  const playerARow = await prisma.player.findUnique({ where: { id: playerA }, select: { operatingStreak: true, longestStreak: true, cashMinor: true } });
  assert(playerARow?.operatingStreak === 1, "eligible day must increment the operating streak");
  assert((await cashOf(playerA)) === cashBeforeReset, "streak/eligibility must never pay Cash");
  const dailyB = await prisma.playerDailyState.findUnique({ where: { playerId_day: { playerId: playerB, day: yesterday } } });
  const playerBRow = await prisma.player.findUnique({ where: { id: playerB }, select: { operatingStreak: true } });
  assert(dailyB?.eligible === false, "heartbeat-only minutes must NOT qualify (>=1 meaningful action required)");
  assert(playerBRow?.operatingStreak === 0, "heartbeat-only day must not build a streak");
  // Weekly performance active_days reads from the authoritative daily state.
  const weekOfYesterday = isoWeek(new Date(`${yesterday}T00:00:00Z`));
  const weeklyA = await prisma.weeklyPerformance.findUnique({ where: { playerId_week: { playerId: playerA, week: weekOfYesterday } } });
  assert((weeklyA?.activeDays ?? 0) >= 1, "eligible day must be recorded into weekly_performance.activeDays");
  // Reset idempotency: a second run spawns nothing new.
  const offersBeforeReplay = await prisma.marketHuntSlot.count({ where: { playerId: playerA, issuedDay: today } });
  const unstartedBeforeReplay = await prisma.marketHuntSlot.count({ where: { playerId: playerA, issuedDay: today, started: false } });
  await postOk("/api/admin/jobs/daily-reset", {}, undefined, true);
  assert(
    (await prisma.marketHuntSlot.count({ where: { playerId: playerA, issuedDay: today } })) === offersBeforeReplay
    && (await prisma.marketHuntSlot.count({ where: { playerId: playerA, issuedDay: today, started: false } })) === unstartedBeforeReplay,
    "reset must be idempotent: no duplicate offers for today",
  );
  assert((await prisma.marketHuntSlot.findUnique({ where: { id: yesterdayStartedId } }))?.status === "active");
  // Missed day resets the streak quietly (longest kept); still no payout.
  await prisma.playerDailyState.delete({ where: { playerId_day: { playerId: playerA, day: yesterday } } });
  await prisma.player.update({ where: { id: playerA }, data: { meaningfulActionsDailyJson: { [yesterday]: 0 } } });
  await postOk("/api/admin/jobs/daily-reset", {}, undefined, true);
  const streakAfterMiss = await prisma.player.findUnique({ where: { id: playerA }, select: { operatingStreak: true, longestStreak: true } });
  assert(streakAfterMiss?.operatingStreak === 0, "a missed eligible day must reset the operating streak");
  assert(streakAfterMiss?.longestStreak === 1, "longest streak must be kept historically");
  assert((await cashOf(playerA)) === cashBeforeReset, "streak reset must never cost Cash or points");
  // The reset also spawns offers for players who have not snapshot today.
  const sessionB = await postOk("/api/session", { playerId: playerB });
  assert((sessionB.plot.hunts as JsonObject[]).filter((hunt) => !hunt.started).length === 3, "reset must spawn 3 offers for every player");

  // --- 5. Objectives: 3 lanes, evidence completion, offline alone cannot ----
  const objectivesC = await get("/api/objectives", playerC);
  assert(objectivesC.rerollAvailable === true, "objective reroll available at day start");
  const lanes = (objectivesC.objectives as JsonObject[]).map((objective) => objective.lane).sort();
  assert(JSON.stringify(lanes) === JSON.stringify(["growth", "market", "operations"]), `expected 3 lanes, got ${lanes.join(",")}`);
  // Force the growth lane to the net-customers template with a known baseline,
  // then simulate an offline-only population gain (no ledger/audit evidence).
  await prisma.plotgoObjectiveState.update({
    where: { playerId_day_lane: { playerId: playerC, day: today, lane: "growth" } },
    data: {
      templateId: "growth_net_customers",
      targetJson: { target: 5 },
      evidenceCursor: { populationBaseline: 5, cardCountBaseline: 0, stage: "humble", assignedAt: now },
      createdAt: now,
    },
  });
  await prisma.player.update({ where: { id: playerC }, data: { population: 50 } });
  const offlineOnly = await get("/api/objectives", playerC);
  const growthOffline = (offlineOnly.objectives as JsonObject[]).find((objective) => objective.lane === "growth")!;
  assert(growthOffline.status === "active", "offline customer gain alone must NOT complete a growth objective");
  assert(growthOffline.progress.current === 45, `growth progress must track the population delta, got ${growthOffline.progress.current}`);
  // Single daily lane reroll, then 409.
  const laneReroll = await postOk("/api/objectives/reroll", { lane: "market" }, playerC);
  assert(laneReroll.rerollAvailable === false, "lane reroll must be consumed");
  const marketRerolled = (laneReroll.objectives as JsonObject[]).find((objective: JsonObject) => objective.lane === "market")!;
  assert(marketRerolled.rerolled === true && marketRerolled.status === "active", "lane reroll must replace the template and reset progress");
  await postExpectStatus("/api/objectives/reroll", { lane: "operations" }, playerC, 409);
  // Now a real validated action (session settle) plus the net-customer state —
  // growth must complete and pay Cash capped per stage. (The settle itself
  // recomputes population from the (empty) board, so the customer evidence is
  // applied after the action, as it would be by a real customer change.)
  const cashCBefore = await cashOf(playerC);
  await postOk("/api/session/settle", { verb: "walk" }, playerC);
  await prisma.player.update({ where: { id: playerC }, data: { population: 55 } });
  const objectivesAfter = await get("/api/objectives", playerC);
  const growthDone = (objectivesAfter.objectives as JsonObject[]).find((objective) => objective.lane === "growth")!;
  assert(
    growthDone.status === "complete" && growthDone.progress.done === true,
    `validated action + net customers must complete the growth objective: ${JSON.stringify(growthDone)}`,
  );
  const completedLanes = (objectivesAfter.objectives as JsonObject[]).filter((objective) => objective.status === "complete");
  const expectedPayout = completedLanes.reduce((sum, objective) => sum + (objective.rewardMinor as number), 0);
  assert(expectedPayout > 0, "completed objectives must pay Cash");
  for (const objective of completedLanes) {
    assert((objective.rewardMinor as number) <= capPerObjective, `objective reward ${objective.rewardMinor} exceeds the per-objective cap ${capPerObjective}`);
  }
  assert(expectedPayout <= capThreeObjectives, `daily objective payout ${expectedPayout} exceeds the 5% daily cap ${capThreeObjectives}`);
  assert((await cashOf(playerC)) - cashCBefore === expectedPayout, "objective payout must equal the sum of completed rewards exactly");
  const objectiveLedger = await prisma.plotgoLedger.findMany({ where: { playerId: playerC, day: today, reason: "objective" } });
  assert(objectiveLedger.length === completedLanes.length, "each completion must append one ledger row");
  assert(objectiveLedger.every((row) => (row.metadataJson as JsonObject).source === "objective"), "objective rewards must be tagged source=objective in the cash ledger");

  // --- 6. Settlement: pending -> finalized + deduped claimable notification --
  const manifestBefore = await prisma.weeklySnapshot.findUnique({ where: { week: priorWeek } });
  manifestExisted = Boolean(manifestBefore);
  manifestPriorStatus = manifestBefore?.status ?? null;
  await prisma.weeklyPerformance.upsert({
    where: { playerId_week: { playerId: playerA, week: priorWeek } },
    create: {
      playerId: playerA,
      week: priorWeek,
      stage: "humble",
      activeDays: 3,
      activityMinor: 600_000,
      revenueMinor: 300_000,
      activeCustomersTotal: 500,
      customerSamples: 5,
      newRetainedCustomers: 53,
      utilizationBpsTotal: 27_500,
      reputationBpsTotal: 27_500,
      riskBpsTotal: 5_000,
      sessions: 5,
      huntsCompleted: 5,
    },
    update: {
      activeDays: 3,
      activityMinor: 600_000,
      revenueMinor: 300_000,
      activeCustomersTotal: 500,
      customerSamples: 5,
      newRetainedCustomers: 53,
      utilizationBpsTotal: 27_500,
      reputationBpsTotal: 27_500,
      riskBpsTotal: 5_000,
      sessions: 5,
      huntsCompleted: 5,
      finalized: false,
      finalizedAt: null,
      claimedAt: null,
      payoutPlot: 0,
      score: 0,
      eligible: false,
      snapshotId: null,
    },
  });
  await prisma.player.update({ where: { id: playerA }, data: { createdAt: now - 8 * 86_400_000 } });
  const closeResult = await postOk("/api/admin/jobs/weekly-close", {}, undefined, true);
  assert(closeResult.manifestStatus === "pending", `prior week must enter pending at close, got ${closeResult.manifestStatus}`);
  const performanceView = await get("/api/performance", playerA);
  assert((performanceView.weekStatus as JsonObject).priorWeek.status === "pending", "GET /api/performance must expose prior week as pending");
  const finalize1 = await postOk("/api/performance/finalize", { week: priorWeek }, undefined, true);
  assert(finalize1.eligible >= 1 && finalize1.totalPayout > 0, `finalize must produce an eligible payout: ${JSON.stringify(finalize1)}`);
  const manifestAfter = await prisma.weeklySnapshot.findUnique({ where: { week: priorWeek } });
  assert(manifestAfter?.status === "finalized", "finalize must move the manifest pending -> finalized");
  const finalizedRow = await prisma.weeklyPerformance.findUnique({ where: { playerId_week: { playerId: playerA, week: priorWeek } } });
  assert(finalizedRow?.finalized === true && Number(finalizedRow.payoutPlot) > 0, "eligible finalized row must carry a positive payout");
  const payoutNotifications = () => prisma.notificationOutbox.findMany({ where: { playerId: playerA, type: "payout_ready" } });
  assert((await payoutNotifications()).length === 1, "exactly one payout_ready notification must be created");
  await postOk("/api/performance/finalize", { week: priorWeek }, undefined, true);
  assert((await payoutNotifications()).length === 1, "re-finalize must not duplicate the claimable notification (dedupe 1/epoch)");
  const performanceFinal = await get("/api/performance", playerA);
  assert((performanceFinal.weekStatus as JsonObject).priorWeek.status === "finalized", "prior week must read finalized after admin finalize");

  // --- 7. Notification inbox + read endpoints --------------------------------
  await postOk("/api/admin/jobs/notification-dispatch", {}, undefined, true);
  const inbox = await get("/api/notifications", playerA);
  const inboxRows = inbox.notifications as JsonObject[];
  assert(inboxRows.length >= 1 && inbox.unread >= 1, "inbox must expose the claimable notification");
  const payoutEntry = inboxRows.find((row) => row.type === "payout_ready")!;
  assert(payoutEntry.state === "sent", "dispatched notification must be sent");
  assert(!/profit|guaranteed|last chance|don't miss/i.test(`${payoutEntry.title} ${payoutEntry.body}`), "notification copy must never use profit language");
  await postOk(`/api/notifications/${payoutEntry.id}/read`, {}, playerA);
  await postOk("/api/notifications/read-all", {}, playerA);
  const inboxAfter = await get("/api/notifications", playerA);
  assert(inboxAfter.unread === 0, "read-all must empty the unread inbox");

  console.log("retention acceptance passed: 3 offers/day + start/expiry/max-5 + queue-full semantics, free reroll 1/day, objectives 3 lanes + evidence-only completion (offline alone cannot complete) + capped Cash payout + 1 lane reroll/day, active-day eligibility (heartbeat-only rejected) + cosmetic streak (increments, resets on miss, never pays), weekly settlement pending -> finalized with deduped payout notification, deterministic <=2 announced windows, notification inbox/read endpoints");
}

async function main(): Promise<void> {
  let server: ChildProcess | undefined;
  try {
    const command = `"${process.execPath}" "${tsxCli}" src/index.ts`;
    server = spawn(command, {
      cwd: apiCwd,
      env: { ...process.env, PORT: String(apiPort) },
      stdio: "ignore",
      shell: true,
      windowsHide: true,
    });
    await waitForApi();
    await runAcceptance();
  } finally {
    if (server && !server.killed) {
      try {
        if (process.platform === "win32" && server.pid) execFileSync("taskkill", ["/PID", String(server.pid), "/T", "/F"], { stdio: "ignore" });
        else server.kill();
      } catch {
        // The spawned shell may already be gone; never mask the acceptance result.
      }
    }
    await cleanupFixtures();
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
