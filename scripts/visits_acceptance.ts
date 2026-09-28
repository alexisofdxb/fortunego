import { execFileSync, spawn, type ChildProcess } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import { randomUUID } from "node:crypto";
import dotenv from "dotenv";
import { PrismaClient } from "@prisma/client";
import { isoWeek, unlockedHexIds } from "@plotgo/game";

// Load the repo-root .env so DATABASE_URL is available for the fixture client
// and inherited by the spawned API server.
const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const require = createRequire(path.join(scriptDir, "package.json"));
dotenv.config({ path: path.resolve(scriptDir, "../.env") });

const repoRoot = path.resolve(scriptDir, "..");
const apiCwd = path.join(repoRoot, "apps", "api");
const tsxCli = path.join(path.dirname(require.resolve("tsx/package.json", { paths: [apiCwd] })), "dist", "cli.mjs");
const apiPort = 8796;
const baseUrl = `http://127.0.0.1:${apiPort}`;
const playerIds = [`visits-visitor-${randomUUID()}`, `visits-host-${randomUUID()}`];
const visitorId = playerIds[0]!;
const hostId = playerIds[1]!;
const prisma = new PrismaClient();

type JsonObject = Record<string, any>;

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

async function request(pathname: string, init: RequestInit = {}, playerId?: string): Promise<JsonObject> {
  const headers = new Headers(init.headers);
  headers.set("content-type", "application/json");
  if (playerId) headers.set("x-player-id", playerId);
  const response = await fetch(`${baseUrl}${pathname}`, { ...init, headers });
  const body = await response.json().catch(() => ({}));
  return { status: response.status, ...body } as JsonObject;
}

async function post(pathname: string, body: JsonObject, playerId?: string): Promise<JsonObject> {
  return request(pathname, { method: "POST", body: JSON.stringify(body) }, playerId);
}

async function postOk(pathname: string, body: JsonObject, playerId?: string): Promise<JsonObject> {
  const result = await post(pathname, body, playerId);
  assert(result.status === undefined || result.status === 200, `POST ${pathname} failed: ${JSON.stringify(result)}`);
  return result;
}

async function postExpectStatus(pathname: string, body: JsonObject, playerId: string | undefined, status: number): Promise<JsonObject> {
  const result = await post(pathname, body, playerId);
  assert(result.status === status, `POST ${pathname} expected ${status}, got ${JSON.stringify(result)}`);
  return result;
}

async function waitForApi(): Promise<void> {
  // Fail fast with a clear message if a stale server still owns the port.
  try {
    const response = await fetch(`${baseUrl}/health`);
    if (response.ok) throw new Error(`port ${apiPort} is already serving an API; a stale test server may still be running`);
  } catch (error) {
    if (error instanceof Error && error.message.includes("already serving")) throw error;
    // Nothing is listening yet, as expected.
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
  throw new Error("Timed out waiting for the visits acceptance API");
}

async function cashOf(playerId: string): Promise<number> {
  const row = await prisma.player.findUnique({ where: { id: playerId }, select: { cashMinor: true } });
  return Number(row?.cashMinor ?? 0);
}

/** Age every visit between visitor and host (distinct past days) so another visit is allowed today. */
async function ageVisits(): Promise<void> {
  const visits = await prisma.plotgoVisit.findMany({ where: { visitorId, hostId }, orderBy: { createdAt: "asc" } });
  for (let index = 0; index < visits.length; index++) {
    const pastDay = new Date(Date.now() - (index + 1) * 86_400_000).toISOString().slice(0, 10);
    await prisma.plotgoVisit.update({ where: { id: visits[index]!.id }, data: { day: pastDay } });
  }
}

/** Clear the player's session row so it can settle again on the same UTC day. */
async function allowResettle(playerId: string, day: string): Promise<void> {
  await prisma.plotgoSession.deleteMany({ where: { playerId, day } });
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
  ] as const;
  await prisma.$transaction(async (tx) => {
    await tx.plotgoVisit.deleteMany({ where: { OR: [{ visitorId: { in: playerIds } }, { hostId: { in: playerIds } }] } });
    await tx.plotgoInvestment.deleteMany({ where: { OR: [{ visitorId: { in: playerIds } }, { hostId: { in: playerIds } }] } });
    for (const delegate of delegates) {
      // @ts-expect-error dynamic delegate access for fixture cleanup
      await tx[delegate].deleteMany({ where: { playerId: { in: playerIds } } });
    }
    await tx.plotgoLand.deleteMany({ where: { playerId: { in: playerIds } } });
    await tx.player.deleteMany({ where: { id: { in: playerIds } } });
  });
}

async function runAcceptance(): Promise<void> {
  const today = new Date().toISOString().slice(0, 10);
  const yesterday = new Date(Date.now() - 86_400_000).toISOString().slice(0, 10);

  // --- Fixtures: two players; host board seeded directly with one eligible
  // building per visit action plus three invest targets. --------------------
  await postOk("/api/session", { playerId: visitorId });
  await postOk("/api/session", { playerId: hostId });
  const now = Date.now();
  // Seed the host board directly: one eligible building per visit action plus
  // three invest targets, one per hex on the humble ring (hex-native board).
  const hostHexes = unlockedHexIds("humble");
  const hostCards: { id: string; type: string; hexId: string }[] = [
    { id: `visits-card-trade-${randomUUID()}`, type: "trading_booth", hexId: hostHexes[0]! },
    { id: `visits-card-fund-${randomUUID()}`, type: "small_fund", hexId: hostHexes[1]! },
    { id: `visits-card-loan-${randomUUID()}`, type: "micro_loan", hexId: hostHexes[2]! },
    { id: `visits-card-inv1-${randomUUID()}`, type: "savings_stand", hexId: hostHexes[3]! },
    { id: `visits-card-inv2-${randomUUID()}`, type: "cash_locker", hexId: hostHexes[4]! },
    { id: `visits-card-inv3-${randomUUID()}`, type: "market_info", hexId: hostHexes[5]! },
  ];
  await prisma.card.createMany({
    data: hostCards.map((card) => ({ ...card, playerId: hostId, stage: 1, placedAt: now, operationalUntil: 0 })),
  });
  // v0.2: buildings stand on owned parcels. The fixture seeds the board
  // directly, so grant the matching land rows the same way (one per hex).
  await prisma.plotgoLand.createMany({
    data: hostHexes.slice(0, hostCards.length).map((hexId, index) => ({
      id: `visits-land-${index}-${randomUUID()}`,
      playerId: hostId,
      hexId,
      method: index === 0 ? "starter_grant" : "frontier_deed",
      priceMinor: 0,
      acquiredAt: now,
    })),
  });
  await prisma.player.update({ where: { id: visitorId }, data: { cashMinor: 1_000_000 } });
  const cardId = (suffix: string) => hostCards.find((card) => card.id.includes(suffix))!.id;

  // --- Privacy: the public board read model exposes no cash/ledger data. ---
  const boardView = await request(`/api/players/${hostId}/board`);
  assert(boardView.status === undefined || boardView.status === 200, `board read model failed: ${JSON.stringify(boardView)}`);
  assert(boardView.playerId === hostId && typeof boardView.name === "string", "board read model must identify the host");
  assert(boardView.empireLevel >= 1 && Array.isArray(boardView.buildings), "board read model must expose empire level and buildings");
  const leaked = ["cash", "cashMinor", "ledger", "fragments", "earnedMinor", "plotBalance"].filter((key) => key in boardView);
  assert(leaked.length === 0, `board read model leaked private fields: ${leaked.join(", ")}`);
  for (const building of boardView.buildings as JsonObject[]) {
    const extra = Object.keys(building).filter((key) => !["id", "type", "name", "hexId", "stage", "lineage", "color"].includes(key));
    assert(extra.length === 0, `board building leaked private fields: ${extra.join(", ")}`);
  }
  const missingBoard = await request(`/api/players/nobody-${randomUUID()}/board`);
  assert(missingBoard.status === 404, "board read model must 404 for unknown players");

  // --- Leaderboard boards (visit target list + extended boards). -----------
  for (const kind of ["cash_7d", "reputation"]) {
    const leaderboard = await request(`/api/leaderboard?board=${kind}`);
    assert(leaderboard.kind === kind && Array.isArray(leaderboard.board), `leaderboard?board=${kind} malformed: ${JSON.stringify(leaderboard)}`);
    assert(leaderboard.board.some((entry: JsonObject) => entry.playerId === hostId), `leaderboard?board=${kind} must include the host`);
  }

  // --- Visit fee split: trade fee moves visitor → host in one receipt. ------
  const visitorBeforeTrade = await cashOf(visitorId);
  const hostBeforeTrade = await cashOf(hostId);
  const tradeKey = `visits-trade-${randomUUID()}`;
  // trading_booth: notional 20_000 × rateBps 25 / 10_000 = 50 minor fee.
  const trade = await postOk("/api/visits", { hostId, action: "trade", buildingId: cardId("trade"), idempotencyKey: tradeKey }, visitorId);
  assert(trade.replayed === false && trade.feeMinor === 50 && trade.notionalMinor === 0, `trade receipt malformed: ${JSON.stringify(trade)}`);
  assert((await cashOf(visitorId)) === visitorBeforeTrade - 50, "trade fee must debit the visitor");
  assert((await cashOf(hostId)) === hostBeforeTrade + 50, "trade fee must credit the host in the same flow");
  const tradeLedger = await prisma.plotgoLedger.findMany({ where: { day: today, reason: { in: ["visit_out", "visit_in"] } } });
  const visitorOut = tradeLedger.find((row) => row.playerId === visitorId && row.reason === "visit_out");
  const hostIn = tradeLedger.find((row) => row.playerId === hostId && row.reason === "visit_in");
  assert(Number(visitorOut?.amountMinor) === -50 && Number(hostIn?.amountMinor) === 50, "visit fee must be ledgered on both sides");

  // --- Idempotent replay: same key returns the original receipt, no charge. -
  const replay = await postOk("/api/visits", { hostId, action: "trade", buildingId: cardId("trade"), idempotencyKey: tradeKey }, visitorId);
  assert(replay.replayed === true && replay.visitId === trade.visitId, "idempotent replay must return the original visit receipt");
  assert((await cashOf(visitorId)) === visitorBeforeTrade - 50 && (await cashOf(hostId)) === hostBeforeTrade + 50, "idempotent replay must not re-charge");

  // --- Self-visit rejection. ------------------------------------------------
  await postExpectStatus("/api/visits", { hostId: visitorId, action: "trade", buildingId: cardId("trade"), idempotencyKey: `visits-self-${randomUUID()}` }, visitorId, 400);

  // --- 0-Cash visitor rejection. --------------------------------------------
  await prisma.player.update({ where: { id: visitorId }, data: { cashMinor: 0 } });
  await postExpectStatus("/api/visits", { hostId, action: "trade", buildingId: cardId("trade"), idempotencyKey: `visits-broke-${randomUUID()}` }, visitorId, 400);
  await prisma.player.update({ where: { id: visitorId }, data: { cashMinor: 1_000_000 } });

  // --- Ineligible action/building pairing rejection. ------------------------
  await postExpectStatus("/api/visits", { hostId, action: "deposit", buildingId: cardId("trade"), idempotencyKey: `visits-mismatch-${randomUUID()}` }, visitorId, 400);

  // --- Deposit visit: fee + notional move to the host. ----------------------
  await ageVisits();
  const visitorBeforeDeposit = await cashOf(visitorId);
  const hostBeforeDeposit = await cashOf(hostId);
  // small_fund: notional 50_000 × rateBps 150 / 10_000 = 750 minor fee.
  const deposit = await postOk("/api/visits", { hostId, action: "deposit", buildingId: cardId("fund"), idempotencyKey: `visits-deposit-${randomUUID()}` }, visitorId);
  assert(deposit.feeMinor === 750 && deposit.notionalMinor === 50_000, `deposit receipt malformed: ${JSON.stringify(deposit)}`);
  assert((await cashOf(visitorId)) === visitorBeforeDeposit - 50_750, "deposit must debit fee + notional from the visitor");
  assert((await cashOf(hostId)) === hostBeforeDeposit + 50_750, "deposit must credit fee + notional to the host");

  // --- Borrow visit: same mechanics, lend-lineage building. -----------------
  await ageVisits();
  const visitorBeforeBorrow = await cashOf(visitorId);
  const hostBeforeBorrow = await cashOf(hostId);
  // micro_loan: notional 30_000 × rateBps 60 / 10_000 = 180 minor fee.
  const borrow = await postOk("/api/visits", { hostId, action: "borrow", buildingId: cardId("loan"), idempotencyKey: `visits-borrow-${randomUUID()}` }, visitorId);
  assert(borrow.feeMinor === 180 && borrow.notionalMinor === 30_000, `borrow receipt malformed: ${JSON.stringify(borrow)}`);
  assert((await cashOf(visitorId)) === visitorBeforeBorrow - 30_180, "borrow must debit fee + notional from the visitor");
  assert((await cashOf(hostId)) === hostBeforeBorrow + 30_180, "borrow must credit fee + notional to the host");

  // --- One visit per (visitor, host, UTC day). ------------------------------
  await postExpectStatus("/api/visits", { hostId, action: "trade", buildingId: cardId("trade"), idempotencyKey: `visits-second-${randomUUID()}` }, visitorId, 409);

  // --- Deposit/borrow notional auto-returns at the visitor's settle. --------
  const visitorSettle = await postOk("/api/session/settle", { verb: "walk" }, visitorId);
  assert(visitorSettle.receipt.visitEconomy?.receivedMinor === 80_000, `visitor settle must return 80_000 notional: ${JSON.stringify(visitorSettle.receipt.visitEconomy)}`);
  const returnedCount = await prisma.plotgoVisit.count({ where: { visitorId, returnedAt: { not: null } } });
  assert(returnedCount === 2, "both notional visits must be marked returned");

  // --- Visit fees accumulate as host player revenue (recorded, not scored). -
  const isoWeekLabel = isoWeek(new Date(`${today}T00:00:00Z`));
  const hostWeekly = await prisma.weeklyPerformance.findUnique({ where: { playerId_week: { playerId: hostId, week: isoWeekLabel } } });
  assert(Number(hostWeekly?.playerRevenueMinor) === 50 + 750 + 180, `host playerRevenueMinor must equal 980, got ${hostWeekly?.playerRevenueMinor}`);

  // --- Investment validation: min/max bounds + one active per building. -----
  await postExpectStatus("/api/invest", { hostId, buildingId: cardId("inv1"), amountMinor: 5_000, idempotencyKey: `visits-low-${randomUUID()}` }, visitorId, 400);
  await postExpectStatus("/api/invest", { hostId, buildingId: cardId("inv1"), amountMinor: 500_001, idempotencyKey: `visits-high-${randomUUID()}` }, visitorId, 400);
  await postExpectStatus("/api/invest", { hostId, buildingId: `visits-card-ghost-${randomUUID()}`, amountMinor: 100_000, idempotencyKey: `visits-invisible-${randomUUID()}` }, visitorId, 404);

  // --- Investment capital transfer: visitor → host, liability on the row. ---
  const visitorBeforeInvest = await cashOf(visitorId);
  const hostBeforeInvest = await cashOf(hostId);
  const investKey = `visits-invest-${randomUUID()}`;
  const invest = await postOk("/api/invest", { hostId, buildingId: cardId("inv1"), amountMinor: 100_000, idempotencyKey: investKey }, visitorId);
  assert(invest.replayed === false && invest.shareBps === 2_500 && invest.amountMinor === 100_000, `invest receipt malformed: ${JSON.stringify(invest)}`);
  assert(invest.maturesDay > invest.startedDay, "investment must carry a maturity day");
  assert((await cashOf(visitorId)) === visitorBeforeInvest - 100_000, "invest must debit the visitor");
  assert((await cashOf(hostId)) === hostBeforeInvest + 100_000, "invest must credit the host (host keeps the capital)");
  const investRow = await prisma.plotgoInvestment.findUnique({ where: { id: invest.investmentId } });
  assert(investRow && investRow.status === "active" && Number(investRow.owedMinor) === 100_000, "investment row must track the liability");
  await postExpectStatus("/api/invest", { hostId, buildingId: cardId("inv1"), amountMinor: 20_000, idempotencyKey: `visits-dupe-${randomUUID()}` }, visitorId, 409);
  const investReplay = await postOk("/api/invest", { hostId, buildingId: cardId("inv1"), amountMinor: 100_000, idempotencyKey: investKey }, visitorId);
  assert(investReplay.replayed === true && investReplay.investmentId === invest.investmentId, "invest replay must return the original receipt");
  assert((await cashOf(visitorId)) === visitorBeforeInvest - 100_000, "invest replay must not re-charge");

  // --- Yield at the host's settle = 25% of the building's gross revenue. ----
  const hostSettle1 = await postOk("/api/session/settle", { verb: "walk" }, hostId);
  const grossLines = (hostSettle1.receipt.revenue ?? []) as JsonObject[];
  const investedGross = grossLines.filter((line) => line.buildingId === cardId("inv1")).reduce((sum, line) => sum + line.amountMinor, 0);
  const expectedYield = Math.round((investedGross * 2_500) / 10_000);
  assert(hostSettle1.receipt.visitEconomy?.yieldsChargedMinor === expectedYield,
    `yield must be 25% of building gross (gross=${investedGross}, expected=${expectedYield}, got=${hostSettle1.receipt.visitEconomy?.yieldsChargedMinor})`);
  const yieldRow = await prisma.plotgoInvestment.findUnique({ where: { id: invest.investmentId } });
  assert(Number(yieldRow?.yieldPaidMinor) === expectedYield && yieldRow?.lastPaidDay === today, "yield must be recorded on the investment row");
  const visitorWeekly = await prisma.weeklyPerformance.findUnique({ where: { playerId_week: { playerId: visitorId, week: isoWeekLabel } } });
  assert(Number(visitorWeekly?.investYieldMinor) === expectedYield, "visitor investYieldMinor must accumulate the yield");

  // --- Maturity: principal repaid at the host's settle once maturesDay hits. -
  await prisma.plotgoInvestment.update({ where: { id: invest.investmentId }, data: { startedDay: yesterday, maturesDay: yesterday } });
  const visitorBeforeMaturity = await cashOf(visitorId);
  await allowResettle(hostId, today);
  const hostSettle2 = await postOk("/api/session/settle", { verb: "walk" }, hostId);
  assert(hostSettle2.receipt.visitEconomy?.repaidMinor === 100_000, `maturity must repay the 100_000 principal: ${JSON.stringify(hostSettle2.receipt.visitEconomy)}`);
  assert((await cashOf(visitorId)) === visitorBeforeMaturity + 100_000, "visitor must receive the matured principal");
  const maturedRow = await prisma.plotgoInvestment.findUnique({ where: { id: invest.investmentId } });
  assert(maturedRow?.status === "matured" && Number(maturedRow.owedMinor) === 0 && maturedRow.maturedAt != null, "matured investment must close out");

  // --- Partial repayment carry: cap the host's cash so only part can repay. ---
  const carryInvest = await postOk("/api/invest", { hostId, buildingId: cardId("inv2"), amountMinor: 200_000, idempotencyKey: `visits-carry-${randomUUID()}` }, visitorId);
  await prisma.plotgoInvestment.update({ where: { id: carryInvest.investmentId }, data: { startedDay: yesterday, maturesDay: yesterday } });
  // cashAfterMinor + repaidMinor reconstructs the host's post-settle balance
  // before the hook, whatever the settle delta drifted to across re-settles.
  await prisma.player.update({ where: { id: hostId }, data: { cashMinor: 100_000, conditionBps: 0 } });
  await allowResettle(hostId, today);
  const hostSettle3 = await postOk("/api/session/settle", { verb: "walk" }, hostId);
  const repaid3 = hostSettle3.receipt.visitEconomy?.repaidMinor as number;
  const settledBeforeHook = (hostSettle3.receipt.cashAfterMinor as number) + repaid3;
  assert(repaid3 === Math.min(200_000, Math.max(0, settledBeforeHook)), `host must repay exactly what the settled balance covers (repaid=${repaid3} settledBeforeHook=${settledBeforeHook} cashAfter=${hostSettle3.receipt.cashAfterMinor})`);
  assert(repaid3 > 0 && repaid3 < 200_000, `partial repayment expected (got ${repaid3}, settledBeforeHook=${settledBeforeHook})`);
  const carriedRow = await prisma.plotgoInvestment.findUnique({ where: { id: carryInvest.investmentId } });
  const carriedOwed = 200_000 - repaid3;
  assert(carriedRow?.status === "active" && Number(carriedRow.owedMinor) === carriedOwed && carriedOwed > 0,
    "unpaid principal must carry on the active row");

  // --- Carried debt retries at every host settle. ---------------------------
  await prisma.player.update({ where: { id: hostId }, data: { cashMinor: 500_000 } });
  await allowResettle(hostId, today);
  const hostSettle4 = await postOk("/api/session/settle", { verb: "walk" }, hostId);
  assert(hostSettle4.receipt.visitEconomy?.repaidMinor === carriedOwed, `carry retry must repay the remaining ${carriedOwed}`);
  const closedRow = await prisma.plotgoInvestment.findUnique({ where: { id: carryInvest.investmentId } });
  assert(closedRow?.status === "matured" && Number(closedRow.owedMinor) === 0, "carried debt must settle once the host can cover it");

  // --- Building-gone refund: remaining principal auto-refunds. --------------
  const refundInvest = await postOk("/api/invest", { hostId, buildingId: cardId("inv3"), amountMinor: 50_000, idempotencyKey: `visits-refund-${randomUUID()}` }, visitorId);
  await prisma.card.deleteMany({ where: { id: cardId("inv3") } });
  await prisma.plotgoInvestment.update({ where: { id: refundInvest.investmentId }, data: { startedDay: yesterday, maturesDay: yesterday } });
  await allowResettle(hostId, today);
  const hostSettle5 = await postOk("/api/session/settle", { verb: "walk" }, hostId);
  assert(hostSettle5.receipt.visitEconomy?.repaidMinor === 50_000, `building-gone refund must repay 50_000: ${JSON.stringify(hostSettle5.receipt.visitEconomy)}`);
  const refundRow = await prisma.plotgoInvestment.findUnique({ where: { id: refundInvest.investmentId } });
  assert(refundRow?.status === "refunded" && Number(refundRow.owedMinor) === 0, "building-gone investment must be refunded");

  // --- Investments view: both sides visible. --------------------------------
  const view = await request("/api/investments", {}, visitorId);
  assert(Array.isArray(view.asVisitor) && Array.isArray(view.asHost), "investments view malformed");
  assert(view.asVisitor.length === 3 && view.asVisitor.every((row: JsonObject) => row.hostName), "visitor must see all three investments with host names");
  const hostView = await request("/api/investments", {}, hostId);
  assert(hostView.asHost.length === 3 && hostView.asHost.every((row: JsonObject) => row.visitorName), "host must see investor liabilities");

  console.log("visits acceptance passed: fee split + same-tx host credit, replay, 0-cash/self/one-per-day guards, invest bounds + transfer, 25% yield at host settle, maturity repayment, partial-repayment carry + retry, building-gone refund, privacy-filtered board read model");
}

async function main(): Promise<void> {
  let server: ChildProcess | undefined;
  try {
    // One pre-quoted command string: cmd.exe /c does not re-quote concatenated
    // args, and process.execPath lives under "C:\Program Files".
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
