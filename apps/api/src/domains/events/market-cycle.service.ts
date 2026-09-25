import {
  EVENT_CATALOG,
  EVENT_REWARD_RULES,
  MARKET_CYCLE_RULES,
  MARKET_CYCLE_TRANSITIONS,
  eventEligible,
  type CatalogEvent,
  type MarketCycleState,
  type MarketStage,
} from "@plotgo/game";
import { prisma } from "../../infrastructure/postgres/client";
import { num } from "../../shared/types";
import { auditEvent } from "../plot/audit.service";
// ---------------------------------------------------------------------------
// Market cycle
// ---------------------------------------------------------------------------

export type PersistedCycle = { state: MarketCycleState; startedAt: number; endsAt: number; seed: number; cycleVersion: number };

export function stableEventSeed(value: string): number {
  let seed = 2_166_136_261;
  for (const char of value) {
    seed ^= char.charCodeAt(0);
    seed = Math.imul(seed, 16_777_619);
  }
  return seed >>> 0;
}

/** Seeds are uint32 at the game layer but stored in INT4 columns: lossless signed round-trip. */
function seedToInt(seed: number): number {
  return seed | 0;
}

function seedFromInt(seed: number): number {
  return seed >>> 0;
}

export function cycleFromRow(row: { state: string; startedAt: bigint; endsAt: bigint; seed: number; cycleVersion: number }): PersistedCycle {
  return { state: row.state as MarketCycleState, startedAt: num(row.startedAt), endsAt: num(row.endsAt), seed: seedFromInt(row.seed), cycleVersion: row.cycleVersion };
}

export function weightedCycleNext(state: MarketCycleState, seed: number): MarketCycleState {
  const entries = Object.entries(MARKET_CYCLE_TRANSITIONS[state]) as [MarketCycleState, number][];
  let cursor = (seed % 1_000_000) / 1_000_000;
  for (const [next, weight] of entries) {
    cursor -= weight;
    if (cursor <= 0) return next;
  }
  return entries[entries.length - 1]![0];
}

export async function ensureMarketCycle(now = Date.now()): Promise<PersistedCycle> {
  let row = await prisma.plotgoMarketCycle.findUnique({ where: { id: 1 } });
  if (!row) {
    const seed = stableEventSeed(`cycle:${Math.floor(now / 604_800_000)}`);
    const startedAt = now;
    const endsAt = now + 72 * 3_600_000;
    row = await prisma.plotgoMarketCycle.create({
      data: { id: 1, state: "Neutral", startedAt, endsAt, seed: seedToInt(seed), cycleVersion: 1, updatedAt: now },
    });
  }
  let cycle = cycleFromRow(row);
  while (now >= cycle.endsAt) {
    const nextSeed = stableEventSeed(`${cycle.seed}:${cycle.cycleVersion}:${cycle.endsAt}`);
    let nextState = weightedCycleNext(cycle.state, nextSeed);
    if (nextState === "Crisis") {
      const recentCrisis = await prisma.plotgoEventAudit.findFirst({
        where: { auditType: "cycle_transition", createdAt: { gt: now - EVENT_REWARD_RULES.crisisCooldownHours * 3_600_000 } },
        orderBy: { createdAt: "desc" },
      });
      const payload = recentCrisis?.payloadJson as { state?: unknown } | null | undefined;
      if (payload && typeof payload === "object" && payload.state === "Crisis") nextState = "Recovery";
    }
    const rule = MARKET_CYCLE_RULES.find((candidate) => candidate.state === nextState)!;
    const span = rule.typicalDurationHours[1] - rule.typicalDurationHours[0];
    const durationHours = rule.typicalDurationHours[0] + (nextSeed % Math.max(1, span + 1));
    const startedAt = cycle.endsAt;
    const endsAt = startedAt + durationHours * 3_600_000;
    await prisma.plotgoMarketCycle.update({
      where: { id: 1 },
      data: { state: nextState, startedAt, endsAt, seed: seedToInt(nextSeed), cycleVersion: cycle.cycleVersion + 1, updatedAt: now },
    });
    await auditEvent(prisma, null, null, "cycle_transition", { from: cycle.state, state: nextState, cycleVersion: cycle.cycleVersion + 1, startedAt, endsAt });
    cycle = { state: nextState, startedAt, endsAt, seed: nextSeed, cycleVersion: cycle.cycleVersion + 1 };
  }
  return cycle;
}

export function cycleGlobalEvent(cycle: PersistedCycle, stage: MarketStage, day: string): CatalogEvent {
  const candidates = EVENT_CATALOG.filter((event) => event.scope === "Global" && eventEligible(event, stage));
  const cycleRule = MARKET_CYCLE_RULES.find((rule) => rule.state === cycle.state)!;
  const weighted = candidates.map((event) => event.baseSpawnWeight * (event.category === "Risk/Crisis" && cycle.state === "Crisis" ? 2 : 1) * (event.stockBias === cycleRule.stockBias ? 1.25 : 1));
  const total = weighted.reduce((sum, value) => sum + value, 0);
  let cursor = (stableEventSeed(`${day}:${cycle.state}:${cycle.seed}`) % 1_000_000) / 1_000_000 * total;
  for (let i = 0; i < candidates.length; i++) { cursor -= weighted[i]!; if (cursor <= 0) return candidates[i]!; }
  return candidates[0] ?? EVENT_CATALOG[0]!;
}
