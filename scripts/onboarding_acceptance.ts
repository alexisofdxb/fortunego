import { execFileSync, spawn, type ChildProcess } from "node:child_process";
import path from "node:path";
import { randomUUID } from "node:crypto";
import Database from "better-sqlite3";

const repoRoot = path.resolve(process.cwd(), "../..");
const apiCwd = path.join(repoRoot, "apps", "api");
const apiPort = 8790;
const baseUrl = `http://127.0.0.1:${apiPort}`;
const playerIds = [`onboarding-acceptance-${randomUUID()}`, `onboarding-assist-${randomUUID()}`];

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
  if (!response.ok) throw new Error(`${init.method ?? "GET"} ${pathname} failed (${response.status}): ${JSON.stringify(body)}`);
  return body as JsonObject;
}

async function post(pathname: string, body: JsonObject, playerId?: string): Promise<JsonObject> {
  return request(pathname, { method: "POST", body: JSON.stringify(body) }, playerId);
}

async function waitForApi(): Promise<void> {
  for (let attempt = 0; attempt < 40; attempt++) {
    try {
      const response = await fetch(`${baseUrl}/health`);
      if (response.ok) return;
    } catch {
      // The API is still starting.
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error("Timed out waiting for the onboarding acceptance API");
}

function mutateAssistFixture(playerId: string): void {
  const sqlite = new Database(path.join(apiCwd, "data", "plotgo.db"));
  sqlite.prepare(`
    UPDATE players
    SET onboarding_started_at = ?, reputation_bps = -28200, last_meaningful_action_at = ?
    WHERE id = ?
  `).run(Date.now() - 3 * 60_000, Date.now(), playerId);
  sqlite.close();
}

function cleanupFixtures(): void {
  const sqlite = new Database(path.join(apiCwd, "data", "plotgo.db"));
  const tables = [
    "plotgo_onboarding_milestones", "plotgo_tutorial_recovery_ledger", "cards", "fragments",
    "plotgo_position", "market_hunt_slots", "market_oracle_prices", "weekly_performance",
    "plotgo_ledger", "plotgo_district_day", "plotgo_session", "plotgo_placement_audit",
    "plotgo_player_events", "plotgo_event_missions", "plotgo_event_audit", "plotgo_module_reward_events",
    "player_module_inventory", "building_module_loadout", "module_loadout_audit", "building_mastery_progress",
    "module_parts_balance", "module_parts_ledger", "module_craft_jobs", "plotgo_offline_sessions",
    "plotgo_offline_buckets", "plotgo_offline_summaries",
  ];
  sqlite.transaction(() => {
    for (const table of tables) {
      const columns = sqlite.prepare(`PRAGMA table_info(${table})`).all() as { name: string }[];
      if (columns.some((column) => column.name === "player_id")) {
        for (const playerId of playerIds) sqlite.prepare(`DELETE FROM ${table} WHERE player_id = ?`).run(playerId);
      }
    }
    for (const playerId of playerIds) sqlite.prepare("DELETE FROM players WHERE id = ?").run(playerId);
  })();
  sqlite.close();
}

async function runAcceptance(): Promise<void> {
  const playerId = playerIds[0]!;
  const started = await post("/api/session", { playerId });
  assert(started.plot.onboarding.guide.target === "build-cash-kiosk", "new players must start at the Cash Kiosk guide");
  assert(started.plot.onboarding.recovery.firstCustomerAssistUsed === false, "first-customer recovery must start unused");
  assert(started.plot.onboarding.recovery.freeTutorialRelocationUsed === false, "relocation recovery must start unused");

  const firstBuild = await post("/api/plot/place", { type: "cash_kiosk", x: 0, y: 0 }, playerId);
  assert(firstBuild.onboarding.step === "onboarding_first_customer", "Cash Kiosk placement must advance onboarding");
  const kioskId = firstBuild.cards.find((card: JsonObject) => card.type === "cash_kiosk")?.id;
  assert(typeof kioskId === "string", "Cash Kiosk card must be present after placement");

  const firstSession = await post("/api/session/settle", { verb: "walk" }, playerId);
  assert(firstSession.receipt.transactions > 0, "the first session must produce real customer transactions");
  assert(firstSession.onboarding.milestones.some((milestone: JsonObject) => milestone.id === "onboarding_first_customer"), "first customer milestone must be recorded");

  const secondBuild = await post("/api/plot/place", { type: "trading_booth", x: 2, y: 0 }, playerId);
  assert(secondBuild.onboarding.step === "onboarding_third_business", "Trading Booth placement must advance onboarding");
  const thirdBuild = await post("/api/plot/place", { type: "savings_stand", x: 4, y: 0 }, playerId);
  const savingsId = thirdBuild.cards.find((card: JsonObject) => card.type === "savings_stand")?.id;
  assert(typeof savingsId === "string", "Savings Stand card must be present after placement");
  assert(thirdBuild.onboarding.step === "onboarding_first_synergy", "Savings Stand placement must advance to synergy guidance");

  const corrected = await post("/api/plot/move", { cardId: savingsId, x: 1, y: 0 }, playerId);
  assert(corrected.onboarding.recovery.freeTutorialRelocationUsed === true, "the guided relocation correction must be consumed");
  assert(corrected.onboarding.step === "onboarding_first_upgrade", "Cash Kiosk/Savings Stand adjacency must record the first synergy and advance onboarding");
  assert(corrected.onboarding.milestones.some((milestone: JsonObject) => milestone.id === "onboarding_first_synergy"), "first synergy milestone must be recorded");

  const auditDb = new Database(path.join(apiCwd, "data", "plotgo.db"), { readonly: true });
  const recoveryRow = auditDb
    .prepare("SELECT kind, credited_minor AS creditedMinor FROM plotgo_tutorial_recovery_ledger WHERE player_id = ? AND kind = 'free_tutorial_relocation'")
    .get(playerId) as { kind: string; creditedMinor: number } | undefined;
  auditDb.close();
  assert(recoveryRow?.kind === "free_tutorial_relocation" && recoveryRow.creditedMinor >= 0, "relocation correction must be auditable");

  const assistPlayer = playerIds[1]!;
  await post("/api/session", { playerId: assistPlayer });
  const assistBuild = await post("/api/plot/place", { type: "cash_kiosk", x: 0, y: 0 }, assistPlayer);
  assert(assistBuild.cards.length === 1, "assist fixture must have one active building");
  mutateAssistFixture(assistPlayer);
  const assisted = await post("/api/session/settle", { verb: "walk" }, assistPlayer);
  assert(assisted.receipt.onboardingRecovery.includes("first_customer_assist"), "first-customer demand assist must be reported in the receipt");
  assert(assisted.attributes.population > 0, "demand assist must create real customer state");
  assert(assisted.onboarding.recovery.firstCustomerAssistUsed === true, "first-customer demand assist must be one-time");

  console.log("onboarding acceptance passed: first-5-minute flow, synergy correction, recovery audit, and first-customer demand assist");
}

async function main(): Promise<void> {
  let server: ChildProcess | undefined;
  try {
    server = spawn("pnpm.cmd", ["--filter", "@plotgo/api", "start"], {
      cwd: repoRoot,
      env: { ...process.env, PORT: String(apiPort) },
      stdio: "ignore",
      shell: true,
    });
    await waitForApi();
    await runAcceptance();
  } finally {
    if (server && !server.killed) {
      if (process.platform === "win32" && server.pid) execFileSync("taskkill", ["/PID", String(server.pid), "/T", "/F"], { stdio: "ignore" });
      else server.kill();
    }
    cleanupFixtures();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
