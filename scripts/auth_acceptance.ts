import { execFileSync, spawn, type ChildProcess } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import { randomUUID } from "node:crypto";
import dotenv from "dotenv";
import { PrismaClient } from "@prisma/client";

// Auth acceptance: dev mode keeps working unchanged, privy mode rejects bad
// tokens with 401, fails fast without credentials, and the privyUserId
// mapping is unique. True token verification is Privy SDK territory and is
// covered manually with real dashboard credentials (README checklist).

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const require = createRequire(path.join(scriptDir, "package.json"));
dotenv.config({ path: path.resolve(scriptDir, "../.env") });

const repoRoot = path.resolve(scriptDir, "..");
const apiCwd = path.join(repoRoot, "apps", "api");
const tsxCli = path.join(path.dirname(require.resolve("tsx/package.json", { paths: [apiCwd] })), "dist", "cli.mjs");
const devPort = 8799;
const privyPort = 8795;
const prisma = new PrismaClient();

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

async function waitForPort(port: number, timeoutMs = 20_000): Promise<boolean> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(`http://127.0.0.1:${port}/health`);
      if (response.ok) return true;
    } catch {
      // not up yet
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  return false;
}

function spawnApi(port: number, extraEnv: NodeJS.ProcessEnv): ChildProcess {
  const command = `"${process.execPath}" "${tsxCli}" src/index.ts`;
  return spawn(command, {
    cwd: apiCwd,
    env: { ...process.env, PORT: String(port), ...extraEnv },
    stdio: "ignore",
    shell: true,
    windowsHide: true,
  });
}

function stop(server: ChildProcess | undefined) {
  if (server && !server.killed) {
    try {
      if (process.platform === "win32" && server.pid) execFileSync("taskkill", ["/PID", String(server.pid), "/T", "/F"], { stdio: "ignore" });
      else server.kill();
    } catch {
      // already gone
    }
  }
}

async function runAcceptance(): Promise<void> {
  // 1. privy mode fails fast without credentials.
  {
    const probe = spawn(`"${process.execPath}" -e "process.exit(0)"`, { shell: true, stdio: "ignore" });
    stop(probe);
    const envCheck = spawn(
      `"${process.execPath}" "${tsxCli}" src/index.ts`,
      {
        cwd: apiCwd,
        env: { ...process.env, PORT: "8794", PLOTGO_AUTH_MODE: "privy", PRIVY_APP_ID: "", PRIVY_APP_SECRET: "" },
        shell: true,
        windowsHide: true,
      },
    );
    const exitCode: number = await new Promise((resolve) => {
      const timer = setTimeout(() => resolve(-1), 15_000);
      envCheck.on("exit", (code) => {
        clearTimeout(timer);
        resolve(code ?? -1);
      });
    });
    stop(envCheck);
    assert(exitCode !== 0 && exitCode !== -1, `privy mode without credentials must fail fast (exit ${exitCode})`);
  }

  // 2. privy mode with (fake) credentials: garbage bearer token -> 401.
  let privyServer: ChildProcess | undefined;
  try {
    privyServer = spawnApi(privyPort, { PLOTGO_AUTH_MODE: "privy", PRIVY_APP_ID: "fake-app-id", PRIVY_APP_SECRET: "fake-secret" });
    assert(await waitForPort(privyPort), "privy-mode API with fake credentials must still boot");
    const denied = await fetch(`http://127.0.0.1:${privyPort}/api/plot`, {
      headers: { Authorization: "Bearer garbage-token", "Content-Type": "application/json" },
    });
    assert(denied.status === 401, `garbage bearer token must be rejected with 401 (got ${denied.status})`);
    const missing = await fetch(`http://127.0.0.1:${privyPort}/api/plot`);
    assert(missing.status === 401, `missing bearer token must be rejected with 401 (got ${missing.status})`);
  } finally {
    stop(privyServer);
  }

  // 3. privyUserId unique mapping.
  const privyUserId = `did:privy:test-${randomUUID()}`;
  const created = await prisma.player.create({
    data: {
      id: `auth-test-${randomUUID()}`,
      privyUserId,
      createdAt: Date.now(),
      founder: true,
      cashMinor: 250_000,
      earnedMinor: 0,
      lastSettleAt: Date.now(),
      exchangeActionsToday: 0,
      huntDay: "2000-01-01",
      huntId: "upgrade_any",
      huntClaimed: false,
      weeklyScore: 0,
      riskBps: 700,
      reputationBps: 5000,
      conditionBps: 10000,
      population: 0,
      capacity: 0,
      satisfactionBps: 5000,
      transactions: 0,
      volumeMinor: 0,
    },
  });
  let duplicateRejected = false;
  try {
    await prisma.player.create({
      data: { ...created, id: `auth-test-${randomUUID()}`, createdAt: Date.now(), lastSettleAt: Date.now() },
    });
  } catch {
    duplicateRejected = true;
  }
  assert(duplicateRejected, "privyUserId must be unique across accounts");
  const found = await prisma.player.findUnique({ where: { privyUserId } });
  assert(found?.id === created.id, "player must resolve by privyUserId");
  await prisma.player.deleteMany({ where: { id: created.id } });

  // 4. dev mode unchanged: session create + plot read by x-player-id.
  let devServer: ChildProcess | undefined;
  try {
    devServer = spawnApi(devPort, { PLOTGO_AUTH_MODE: "dev" });
    assert(await waitForPort(devPort), "dev-mode API must boot");
    const playerId = `auth-dev-${randomUUID()}`;
    const session = await fetch(`http://127.0.0.1:${devPort}/api/session`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ playerId }),
    });
    assert(session.status === 200, `dev-mode session create must work (got ${session.status})`);
    const plot = await fetch(`http://127.0.0.1:${devPort}/api/plot`, { headers: { "x-player-id": playerId } });
    assert(plot.status === 200, `dev-mode plot read must work (got ${plot.status})`);
    await prisma.player.deleteMany({ where: { id: playerId } });
  } finally {
    stop(devServer);
  }

  console.log("auth acceptance passed: privy fail-fast without credentials, 401 on garbage/missing tokens, privyUserId unique mapping, dev mode unchanged");
}

async function main(): Promise<void> {
  try {
    await runAcceptance();
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
