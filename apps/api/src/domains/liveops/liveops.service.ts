import { randomInt } from "node:crypto";
import {
  CASH_SCALE,
  DUPLICATE_SHARD_YIELD,
  LIVEOPS_BOOST_POOL,
  LIVEOPS_ITEMS,
  LIVEOPS_LOOT_TABLE_VERSION,
  canonicalModuleCatalog,
  LIVEOPS_FAUCET_PLOT,
  LIVEOPS_PASS_PLOT,
  LIVEOPS_PASS_TRACK,
  LIVEOPS_PLOT_REF_USD,
  liveopsBracket,
  liveopsPack,
  liveopsCampaign,
  liveopsCase,
  liveopsItem,
  liveopsLootTotal,
  liveopsMilestoneLabel,
  liveopsPassLevelForXp,
  liveopsPityForceEntry,
  liveopsPlotPriceFromUsd,
  liveopsPurchasePeriod,
  liveopsPointsForRepeat,
  liveopsQuoteWindow,
  liveopsSeasonAt,
  liveopsShopSlots,
  liveopsShouldReprice,
  liveopsWindowsAt,
  pickLiveopsLoot,
  requireLiveopsItem,
  utcDay,
  type LiveopsLootEntry,
  type LiveopsPackContent,
  type LiveopsPassReward,
  type LiveopsVerb,
} from "@plotgo/game";
import { env } from "../../shared/config";
import type { Prisma } from "@prisma/client";
import { prisma } from "../../infrastructure/postgres/client";
import { newId, num } from "../../shared/types";
import { recordLedger } from "../economy/ledger.service";
import { grantModuleInventory } from "../modules/modules.service";
import { produceLiveopsCaseReady, produceLiveopsMilestone } from "../notifications/notifications.service";

type Db = Prisma.TransactionClient | typeof prisma;

export type LiveopsInventoryRow = {
  itemId: string;
  name: string;
  category: string;
  rarity: string;
  icon: string;
  quantity: number;
};

export class LiveopsError extends Error {
  constructor(
    message: string,
    readonly status: 400 | 404 | 409 = 400,
  ) {
    super(message);
    this.name = "LiveopsError";
  }
}

export async function liveopsInventoryRows(playerId: string): Promise<LiveopsInventoryRow[]> {
  const rows = await prisma.playerLiveopsItem.findMany({ where: { playerId } });
  const byId = new Map(rows.map((row) => [row.itemId, row.quantity]));
  return LIVEOPS_ITEMS.map((item) => ({
    itemId: item.id,
    name: item.name,
    category: item.category,
    rarity: item.rarity,
    icon: item.icon,
    quantity: byId.get(item.id) ?? 0,
  }));
}

export async function grantItem(
  db: Db,
  playerId: string,
  itemId: string,
  quantity: number,
  source: string,
  sourceEventId: string,
): Promise<{ granted: boolean; quantity: number }> {
  requireLiveopsItem(itemId);
  if (quantity <= 0) throw new LiveopsError("Grant quantity must be positive");
  const existing = await db.liveopsGrantEvent.findUnique({
    where: { idx_liveops_grant_source: { playerId, source, sourceEventId, itemId } },
  });
  if (existing) return { granted: false, quantity: existing.quantity };

  const now = Date.now();
  await db.liveopsGrantEvent.create({
    data: {
      grantId: newId(),
      playerId,
      source,
      sourceEventId,
      itemId,
      quantity,
      createdAt: now,
    },
  });
  await db.playerLiveopsItem.upsert({
    where: { playerId_itemId: { playerId, itemId } },
    create: { playerId, itemId, quantity, updatedAt: now },
    update: { quantity: { increment: quantity }, updatedAt: now },
  });
  return { granted: true, quantity };
}

export async function spendItem(db: Db, playerId: string, itemId: string, quantity: number): Promise<void> {
  requireLiveopsItem(itemId);
  if (quantity <= 0) throw new LiveopsError("Spend quantity must be positive");
  const now = Date.now();
  const changed = await db.playerLiveopsItem.updateMany({
    where: { playerId, itemId, quantity: { gte: quantity } },
    data: { quantity: { decrement: quantity }, updatedAt: now },
  });
  if (changed.count !== 1) throw new LiveopsError("Not enough items", 409);
}

export type LiveopsCampaignView = {
  id: string;
  name: string;
  tone: string;
  seasonId: string;
  startsAt: number;
  endsAt: number;
  remainingMs: number;
  points: number;
  nextMilestonePoints: number | null;
  qualifying: string[];
  qualifyingCopy: string;
  rewardsCopy: string;
  durationLabel: string;
  milestones: { id: string; points: number; claimed: boolean; label: string }[];
  rank: number;
  fieldSize: number;
};

function parseDailyMap(value: unknown): Record<string, number> {
  if (!value || typeof value !== "object") return {};
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>).map(([key, item]) => [key, Number(item) || 0]),
  );
}

/** Award points to every overlapping campaign that accepts this verb. Milestones grant Cash/items immediately. */
export async function scoreAction(playerId: string, verb: LiveopsVerb, now = Date.now()): Promise<void> {
  const windows = liveopsWindowsAt(now);
  if (!windows.length) return;
  const day = utcDay(now);
  let passXp = 0;
  for (const window of windows) {
    const def = liveopsCampaign(window.campaignId);
    if (!def || !def.qualifying.includes(verb)) continue;
    try {
      const granted = await prisma.$transaction(async (tx) => {
        const row = await tx.liveopsCampaignScore.upsert({
          where: { playerId_eventId_seasonId: { playerId, eventId: def.id, seasonId: window.seasonId } },
          create: { playerId, eventId: def.id, seasonId: window.seasonId, points: 0, lastActionAt: now, dailyJson: {} },
          update: {},
        });
        const daily = parseDailyMap(row.dailyJson);
        const key = `${verb}:${day}`;
        const prior = daily[key] ?? 0;
        const awarded = liveopsPointsForRepeat(def.pointsPerAction, prior);
        daily[key] = prior + 1;
        const nextPoints = row.points + awarded;
        await tx.liveopsCampaignScore.update({
          where: { playerId_eventId_seasonId: { playerId, eventId: def.id, seasonId: window.seasonId } },
          data: { points: nextPoints, dailyJson: daily, lastActionAt: now },
        });
        if (awarded > 0) passXp += awarded;
        if (awarded <= 0) return [];
        const hits: { id: string; label: string; items: { itemId: string; quantity: number }[] }[] = [];
        for (const milestone of def.milestones) {
          if (nextPoints < milestone.points) continue;
          const inserted = await tx.liveopsMilestoneClaim.createMany({
            data: [{ playerId, eventId: def.id, seasonId: window.seasonId, milestoneId: milestone.id, claimedAt: now }],
            skipDuplicates: true,
          });
          if (inserted.count !== 1) continue;
          if (milestone.cashMinor) {
            const paid = await tx.player.update({
              where: { id: playerId },
              data: { cashMinor: { increment: milestone.cashMinor } },
              select: { cashMinor: true },
            });
            await recordLedger(tx, playerId, day, "liveops_milestone", milestone.cashMinor, num(paid.cashMinor), {
              eventId: def.id,
              milestoneId: milestone.id,
            });
          }
          for (const item of milestone.items ?? []) {
            await grantItem(tx, playerId, item.itemId, item.quantity, "liveops_milestone", `${def.id}:${window.seasonId}:${milestone.id}`);
          }
          hits.push({ id: milestone.id, label: liveopsMilestoneLabel(milestone), items: [...(milestone.items ?? [])] });
        }
        return hits;
      });
      for (const hit of granted ?? []) {
        await produceLiveopsMilestone(playerId, {
          eventId: def.id,
          eventName: def.name,
          seasonId: window.seasonId,
          milestoneId: hit.id,
          label: hit.label,
        });
        for (const item of hit.items) {
          if (item.itemId === "business_key") {
            await produceLiveopsCaseReady(
              playerId,
              "Business Case",
              `liveops_case_ready:business:${window.seasonId}:${hit.id}`,
            );
          }
          if (item.itemId === "market_key") {
            await produceLiveopsCaseReady(
              playerId,
              "Market Case",
              `liveops_case_ready:market:${window.seasonId}:${hit.id}`,
            );
          }
          if (item.itemId === "event_key") {
            await produceLiveopsCaseReady(playerId, "Event Case", `liveops_case_ready:event:${window.seasonId}:${hit.id}`);
          }
          if (item.itemId === "executive_key") {
            await produceLiveopsCaseReady(
              playerId,
              "Executive Case",
              `liveops_case_ready:executive:${window.seasonId}:${hit.id}`,
            );
          }
        }
      }
    } catch (error) {
      console.error(`[liveops] scoreAction ${verb} ${window.campaignId} failed`, error);
    }
  }
  if (passXp > 0) await addSeasonPassXp(playerId, passXp, now);
}

export async function liveopsCampaignRows(playerId: string, now = Date.now()): Promise<LiveopsCampaignView[]> {
  const windows = liveopsWindowsAt(now);
  if (!windows.length) return [];
  const or = windows.map((window) => ({ eventId: window.campaignId, seasonId: window.seasonId }));
  const [scores, claims, field] = await Promise.all([
    prisma.liveopsCampaignScore.findMany({ where: { playerId, OR: or } }),
    prisma.liveopsMilestoneClaim.findMany({ where: { playerId, OR: or } }),
    prisma.liveopsCampaignScore.findMany({ where: { OR: or }, select: { eventId: true, seasonId: true, points: true } }),
  ]);
  const scoreKey = (eventId: string, seasonId: string) => `${eventId}:${seasonId}`;
  const scoreMap = new Map(scores.map((row) => [scoreKey(row.eventId, row.seasonId), row.points]));
  const claimed = new Set(claims.map((row) => `${row.eventId}:${row.seasonId}:${row.milestoneId}`));
  return windows.flatMap((window) => {
    const def = liveopsCampaign(window.campaignId);
    if (!def) return [];
    const points = scoreMap.get(scoreKey(def.id, window.seasonId)) ?? 0;
    const milestones = def.milestones.map((milestone) => ({
      id: milestone.id,
      points: milestone.points,
      claimed: claimed.has(`${def.id}:${window.seasonId}:${milestone.id}`),
      label: liveopsMilestoneLabel(milestone),
    }));
    const next = milestones.find((milestone) => !milestone.claimed) ?? null;
    const peers = field.filter((row) => row.eventId === def.id && row.seasonId === window.seasonId);
    const rank = 1 + peers.filter((row) => row.points > points).length;
    return [
      {
        id: def.id,
        name: def.name,
        tone: def.tone,
        seasonId: window.seasonId,
        startsAt: window.startsAt,
        endsAt: window.endsAt,
        remainingMs: Math.max(0, window.endsAt - now),
        points,
        nextMilestonePoints: next?.points ?? null,
        qualifying: [...def.qualifying],
        qualifyingCopy: def.qualifyingCopy,
        rewardsCopy: def.rewardsCopy,
        durationLabel: def.durationLabel,
        milestones,
        rank,
        fieldSize: Math.max(1, peers.length),
      },
    ];
  });
}

export type LiveopsCaseResult = {
  kind: "cash" | "item" | "module";
  label: string;
  caseType: string;
  cashMinor?: number;
  itemId?: string;
  quantity?: number;
  moduleId?: string;
  moduleName?: string;
  convertedToShards?: number;
};

export type LiveopsCasesView = {
  dailyAvailable: boolean;
  businessKeys: number;
  marketKeys: number;
  eventKeys: number;
  executiveKeys: number;
  tycoonKeys: number;
  pity: { business: number; market: number; event: number; executive: number; tycoon: number };
  lastOpen: { caseType: string; label: string; openedAt: number } | null;
};

function isUniqueViolation(error: unknown): boolean {
  return typeof error === "object" && error !== null && (error as { code?: string }).code === "P2002";
}

async function grantCaseModule(
  db: Db,
  playerId: string,
  caseId: string,
  rarity: "rare" | "epic" | "legendary",
): Promise<LiveopsCaseResult> {
  const pool = canonicalModuleCatalog().filter((entry) => entry.rarity.toLowerCase() === rarity);
  const pick = pool.length ? pool[randomInt(pool.length)]! : null;
  if (!pick) {
    const shards = DUPLICATE_SHARD_YIELD[rarity];
    await grantItem(db, playerId, "module_shard", shards, "liveops_case", `${caseId}:shards`);
    return { kind: "item", caseType: "", label: `${shards}× Module Shards`, itemId: "module_shard", quantity: shards };
  }
  const owned = await db.playerModuleInventory.findUnique({
    where: { playerId_moduleId: { playerId, moduleId: pick.id } },
  });
  if (owned && owned.quantityOwned > 0) {
    const shards = DUPLICATE_SHARD_YIELD[rarity];
    await grantItem(db, playerId, "module_shard", shards, "liveops_case", `${caseId}:dup`);
    return {
      kind: "module",
      caseType: "",
      label: `${pick.name} duplicate → ${shards} shards`,
      moduleId: pick.id,
      moduleName: pick.name,
      convertedToShards: shards,
    };
  }
  await grantModuleInventory(db, playerId, pick.id, 1);
  return { kind: "module", caseType: "", label: pick.name, moduleId: pick.id, moduleName: pick.name, convertedToShards: 0 };
}

async function resolveLoot(
  db: Db,
  playerId: string,
  caseId: string,
  entry: LiveopsLootEntry,
  day: string,
): Promise<Omit<LiveopsCaseResult, "caseType">> {
  const qty = entry.minQty + (entry.maxQty > entry.minQty ? randomInt(entry.maxQty - entry.minQty + 1) : 0);
  const jackpotModule = entry.kind === "jackpot" && randomInt(2) === 1;
  if (entry.kind === "module" || jackpotModule) {
    return grantCaseModule(db, playerId, caseId, entry.moduleRarity ?? "rare");
  }
  if (entry.kind === "cash" || entry.kind === "jackpot") {
    const span = (entry.cashMax ?? entry.cashMin ?? 0) - (entry.cashMin ?? 0);
    const dollars = (entry.cashMin ?? 0) + (span > 0 ? randomInt(span + 1) : 0);
    const cashMinor = dollars * CASH_SCALE;
    const paid = await db.player.update({
      where: { id: playerId },
      data: { cashMinor: { increment: cashMinor } },
      select: { cashMinor: true },
    });
    await recordLedger(db, playerId, day, "liveops_case", cashMinor, num(paid.cashMinor), { caseId, entryId: entry.id });
    return { kind: "cash", label: `$${dollars.toLocaleString()} Cash`, cashMinor, quantity: 1 };
  }
  const itemId =
    entry.kind === "boost" ? LIVEOPS_BOOST_POOL[randomInt(LIVEOPS_BOOST_POOL.length)]! : entry.itemId;
  if (!itemId) throw new LiveopsError("Invalid loot entry");
  await grantItem(db, playerId, itemId, qty, "liveops_case", caseId);
  const spec = liveopsItem(itemId);
  return { kind: "item", label: `${qty}× ${spec?.name ?? itemId}`, itemId, quantity: qty };
}

export async function openLiveopsCase(playerId: string, caseType: string): Promise<LiveopsCaseResult> {
  const def = liveopsCase(caseType);
  if (!def) throw new LiveopsError("Unknown case", 400);
  const now = Date.now();
  const day = utcDay(now);
  const sourceEventId = def.access === "daily_free" ? day : newId();
  const caseId = newId();

  try {
    return await prisma.$transaction(async (tx) => {
      const inserted = await tx.liveopsCase.createMany({
        data: [
          {
            id: caseId,
            playerId,
            caseType: def.id,
            sourceEventId,
            openedAt: now,
            lootTableVersion: LIVEOPS_LOOT_TABLE_VERSION,
            resultJson: {},
            pityAfter: 0,
          },
        ],
        skipDuplicates: true,
      });
      if (inserted.count !== 1) {
        throw new LiveopsError(def.access === "daily_free" ? "Daily Case already opened today" : "Could not open case", 409);
      }
      if (def.keyItemId) await spendItem(tx, playerId, def.keyItemId, 1);

      const usesPity = Boolean(def.pityRarePlusEvery || def.pityLegendaryEvery);
      let pityCounter = 0;
      if (usesPity) {
        const pity = await tx.liveopsPity.upsert({
          where: { playerId_caseFamily: { playerId, caseFamily: def.id } },
          create: { playerId, caseFamily: def.id, counter: 0, updatedAt: now },
          update: {},
        });
        pityCounter = pity.counter;
      }

      const total = liveopsLootTotal(def.loot);
      let entry = pickLiveopsLoot(def.loot, randomInt(total));
      if (def.pityLegendaryEvery && pityCounter + 1 >= def.pityLegendaryEvery && !entry.legendary) {
        entry = liveopsPityForceEntry(def) ?? entry;
      } else if (def.pityRarePlusEvery && pityCounter + 1 >= def.pityRarePlusEvery && !entry.rarePlus) {
        entry = liveopsPityForceEntry(def) ?? entry;
      }
      const nextPity = entry.legendary || entry.rarePlus ? 0 : pityCounter + 1;
      if (usesPity) {
        await tx.liveopsPity.upsert({
          where: { playerId_caseFamily: { playerId, caseFamily: def.id } },
          create: { playerId, caseFamily: def.id, counter: nextPity, updatedAt: now },
          update: { counter: nextPity, updatedAt: now },
        });
      }

      const resolved = await resolveLoot(tx, playerId, caseId, entry, day);
      const result: LiveopsCaseResult = { ...resolved, caseType: def.id };
      await tx.liveopsCase.update({
        where: { id: caseId },
        data: { resultJson: result as object, pityAfter: nextPity },
      });
      return result;
    });
  } catch (error) {
    if (error instanceof LiveopsError) throw error;
    if (isUniqueViolation(error) && def.access === "daily_free") {
      throw new LiveopsError("Daily Case already opened today", 409);
    }
    throw error;
  }
}

export async function liveopsCasesView(playerId: string): Promise<LiveopsCasesView> {
  const day = utcDay();
  const [daily, inventory, pityRows, last] = await Promise.all([
    prisma.liveopsCase.findUnique({
      where: { idx_liveops_case_open: { playerId, caseType: "daily", sourceEventId: day } },
      select: { id: true },
    }),
    liveopsInventoryRows(playerId),
    prisma.liveopsPity.findMany({
      where: { playerId, caseFamily: { in: ["business", "market", "event", "executive", "tycoon"] } },
    }),
    prisma.liveopsCase.findFirst({
      where: { playerId },
      orderBy: { openedAt: "desc" },
      select: { caseType: true, openedAt: true, resultJson: true },
    }),
  ]);
  const qty = (id: string) => inventory.find((row) => row.itemId === id)?.quantity ?? 0;
  const pity = Object.fromEntries(pityRows.map((row) => [row.caseFamily, row.counter]));
  const lastJson = last?.resultJson as { label?: string } | null;
  const view: LiveopsCasesView = {
    dailyAvailable: !daily,
    businessKeys: qty("business_key"),
    marketKeys: qty("market_key"),
    eventKeys: qty("event_key"),
    executiveKeys: qty("executive_key"),
    tycoonKeys: qty("tycoon_key"),
    pity: {
      business: Number(pity.business ?? 0),
      market: Number(pity.market ?? 0),
      event: Number(pity.event ?? 0),
      executive: Number(pity.executive ?? 0),
      tycoon: Number(pity.tycoon ?? 0),
    },
    lastOpen: last
      ? { caseType: last.caseType, label: lastJson?.label ?? "Opened", openedAt: num(last.openedAt) }
      : null,
  };
  if (view.dailyAvailable) {
    await produceLiveopsCaseReady(playerId, "Daily Case", `liveops_case_ready:daily:${day}`);
  }
  return view;
}

export type LiveopsPassView = {
  seasonId: string;
  xp: number;
  level: number;
  nextCumulativeXp: number | null;
  premium: boolean;
  remainingMs: number;
  passPlot: number;
  levels: {
    level: number;
    cumulativeXp: number;
    major: boolean;
    free: { label: string; claimed: boolean };
    premium: { label: string; claimed: boolean };
  }[];
};

async function addSeasonPassXp(playerId: string, amount: number, now = Date.now()): Promise<void> {
  if (amount <= 0) return;
  const season = liveopsSeasonAt(now);
  await prisma.liveopsSeasonPass.upsert({
    where: { playerId_seasonId: { playerId, seasonId: season.id } },
    create: { playerId, seasonId: season.id, xp: amount, premium: false, updatedAt: now },
    update: { xp: { increment: amount }, updatedAt: now },
  });
}

export async function liveopsPassView(playerId: string, now = Date.now()): Promise<LiveopsPassView> {
  const season = liveopsSeasonAt(now);
  const [row, claims] = await Promise.all([
    prisma.liveopsSeasonPass.findUnique({ where: { playerId_seasonId: { playerId, seasonId: season.id } } }),
    prisma.liveopsPassClaim.findMany({ where: { playerId, seasonId: season.id } }),
  ]);
  const xp = row?.xp ?? 0;
  const claimed = new Set(claims.map((item) => `${item.track}:${item.level}`));
  const level = liveopsPassLevelForXp(xp);
  const next = LIVEOPS_PASS_TRACK.find((item) => item.cumulativeXp > xp) ?? null;
  return {
    seasonId: season.id,
    xp,
    level,
    nextCumulativeXp: next?.cumulativeXp ?? null,
    premium: row?.premium ?? false,
    remainingMs: Math.max(0, season.endsAt - now),
    passPlot: LIVEOPS_PASS_PLOT,
    levels: LIVEOPS_PASS_TRACK.map((item) => ({
      level: item.level,
      cumulativeXp: item.cumulativeXp,
      major: item.major,
      free: { label: item.free.label, claimed: claimed.has(`free:${item.level}`) },
      premium: { label: item.premium.label, claimed: claimed.has(`premium:${item.level}`) },
    })),
  };
}

export async function unlockSeasonPass(playerId: string): Promise<void> {
  const now = Date.now();
  const season = liveopsSeasonAt(now);
  const existing = await prisma.liveopsSeasonPass.findUnique({
    where: { playerId_seasonId: { playerId, seasonId: season.id } },
  });
  if (existing?.premium) throw new LiveopsError("Premium is already unlocked", 409);
  const price = LIVEOPS_PASS_PLOT;
  await prisma.$transaction(async (tx) => {
    const paid = await tx.player.updateMany({
      where: { id: playerId, plotBalance: { gte: price } },
      data: { plotBalance: { decrement: price } },
    });
    if (paid.count !== 1) throw new LiveopsError(`Need ${price} $PLOT for the premium pass`, 409);
    await tx.liveopsSeasonPass.upsert({
      where: { playerId_seasonId: { playerId, seasonId: season.id } },
      create: { playerId, seasonId: season.id, xp: 0, premium: true, updatedAt: now },
      update: { premium: true, updatedAt: now },
    });
    await tx.liveopsShopPurchase.create({
      data: {
        id: newId(),
        playerId,
        sku: "season_pass",
        period: season.id,
        plotPaid: price,
        cashMinor: 0,
        createdAt: now,
      },
    });
  });
}

async function grantPassReward(db: Db, playerId: string, reward: LiveopsPassReward, sourceEventId: string, day: string): Promise<void> {
  if (reward.kind === "cash" && reward.cashMinor) {
    const paid = await db.player.update({
      where: { id: playerId },
      data: { cashMinor: { increment: reward.cashMinor } },
      select: { cashMinor: true },
    });
    await recordLedger(db, playerId, day, "liveops_pass", reward.cashMinor, num(paid.cashMinor), { sourceEventId });
    return;
  }
  if (reward.itemId && reward.quantity) {
    await grantItem(db, playerId, reward.itemId, reward.quantity, "liveops_pass", sourceEventId);
  }
}

export async function claimSeasonPass(playerId: string, level: number, track: "free" | "premium"): Promise<string> {
  const row = LIVEOPS_PASS_TRACK.find((item) => item.level === level);
  if (!row) throw new LiveopsError("Unknown pass level", 400);
  const now = Date.now();
  const season = liveopsSeasonAt(now);
  const pass = await prisma.liveopsSeasonPass.findUnique({
    where: { playerId_seasonId: { playerId, seasonId: season.id } },
  });
  if ((pass?.xp ?? 0) < row.cumulativeXp) throw new LiveopsError("Not enough Season XP", 409);
  if (track === "premium" && !pass?.premium) throw new LiveopsError("Premium track is locked", 409);
  const reward = track === "free" ? row.free : row.premium;
  await prisma.$transaction(async (tx) => {
    const inserted = await tx.liveopsPassClaim.createMany({
      data: [{ playerId, seasonId: season.id, level, track, claimedAt: now }],
      skipDuplicates: true,
    });
    if (inserted.count !== 1) throw new LiveopsError("Already claimed", 409);
    await grantPassReward(tx, playerId, reward, `${season.id}:${track}:${level}`, utcDay(now));
  });
  if (reward.itemId === "executive_key") {
    await produceLiveopsCaseReady(playerId, "Executive Case", `liveops_case_ready:executive:${season.id}:${level}`);
  }
  if (reward.itemId === "event_key") {
    await produceLiveopsCaseReady(playerId, "Event Case", `liveops_case_ready:event:${season.id}:${level}`);
  }
  return reward.label;
}

export async function liveopsLeaderboard(playerId: string, eventId: string, now = Date.now()) {
  const def = liveopsCampaign(eventId);
  if (!def) throw new LiveopsError("Unknown campaign", 400);
  const window = liveopsWindowsAt(now).find((item) => item.campaignId === eventId);
  const seasonId = window?.seasonId ?? liveopsSeasonAt(now).id;
  const you = await prisma.player.findUnique({ where: { id: playerId }, select: { empireLevel: true } });
  const bracket = liveopsBracket(you?.empireLevel ?? 1);
  const scores = await prisma.liveopsCampaignScore.findMany({
    where: { eventId, seasonId },
    orderBy: { points: "desc" },
    take: 50,
  });
  const players = await prisma.player.findMany({
    where: { id: { in: scores.map((row) => row.playerId) } },
    select: { id: true, empireLevel: true },
  });
  const levelById = new Map(players.map((row) => [row.id, row.empireLevel]));
  const ranked = scores
    .filter((row) => liveopsBracket(levelById.get(row.playerId) ?? 1) === bracket)
    .map((row, index) => ({
      rank: index + 1,
      playerId: row.playerId === playerId ? playerId : `${row.playerId.slice(0, 8)}…`,
      you: row.playerId === playerId,
      points: row.points,
    }));
  const youRow = ranked.find((row) => row.you) ?? null;
  return {
    eventId,
    name: def.name,
    seasonId,
    bracket,
    frozen: !window,
    you: youRow,
    top: ranked.slice(0, 10),
  };
}

export type LiveopsShopOffer = {
  sku: string;
  name: string;
  blurb: string;
  slot: string;
  payment: "plot" | "cash";
  plotPrice: number;
  cashMinor: number;
  usd: number;
  quoteId: string;
  expiresAt: number;
  remaining: number;
  contents: string[];
};

async function quoteForSku(playerId: string, sku: string, now = Date.now()) {
  const pack = liveopsPack(sku);
  if (!pack) throw new LiveopsError("Unknown SKU", 400);
  const plotPrice = pack.payment === "plot" ? liveopsPlotPriceFromUsd(pack.usd) : 0;
  const latest = await prisma.liveopsShopQuote.findFirst({
    where: { playerId, sku },
    orderBy: { createdAt: "desc" },
  });
  const fresh =
    latest &&
    num(latest.expiresAt) > now &&
    !liveopsShouldReprice(latest.refPlotUsd, LIVEOPS_PLOT_REF_USD) &&
    latest.plotPrice === plotPrice;
  if (fresh) return latest;
  const window = liveopsQuoteWindow(now);
  return prisma.liveopsShopQuote.create({
    data: {
      id: newId(),
      playerId,
      sku,
      usdRef: pack.usd,
      plotPrice,
      refPlotUsd: LIVEOPS_PLOT_REF_USD,
      expiresAt: window.expiresAt,
      createdAt: window.issuedAt,
    },
  });
}

async function remainingForPack(playerId: string, pack: NonNullable<ReturnType<typeof liveopsPack>>, now = Date.now()): Promise<number> {
  const period = liveopsPurchasePeriod(pack.limit.kind, now);
  const bought = await prisma.liveopsShopPurchase.count({ where: { playerId, sku: pack.id, period } });
  return Math.max(0, pack.limit.count - bought);
}

async function grantPackContents(db: Db, playerId: string, contents: readonly LiveopsPackContent[], sourceEventId: string, day: string): Promise<void> {
  for (const entry of contents) {
    if (entry.kind === "cash") {
      const paid = await db.player.update({
        where: { id: playerId },
        data: { cashMinor: { increment: entry.cashMinor } },
        select: { cashMinor: true },
      });
      await recordLedger(db, playerId, day, "liveops_pack", entry.cashMinor, num(paid.cashMinor), { sourceEventId });
      continue;
    }
    if (entry.kind === "item") {
      await grantItem(db, playerId, entry.itemId, entry.quantity, "liveops_pack", `${sourceEventId}:${entry.itemId}`);
      continue;
    }
    for (let i = 0; i < entry.quantity; i++) {
      await grantCaseModule(db, playerId, `${sourceEventId}:mod:${i}`, entry.rarity);
    }
  }
}

export async function liveopsShopView(playerId: string, now = Date.now()): Promise<{ offers: LiveopsShopOffer[]; passPlot: number; faucet: boolean }> {
  const slots = liveopsShopSlots(now);
  const offers: LiveopsShopOffer[] = [];
  for (const slot of slots) {
    const pack = liveopsPack(slot.sku);
    if (!pack) continue;
    const quote = await quoteForSku(playerId, pack.id, now);
    const remaining = await remainingForPack(playerId, pack, now);
    offers.push({
      sku: pack.id,
      name: pack.name,
      blurb: pack.blurb,
      slot: slot.label,
      payment: pack.payment,
      plotPrice: quote.plotPrice,
      cashMinor: pack.cashMinor ?? 0,
      usd: pack.usd,
      quoteId: quote.id,
      expiresAt: num(quote.expiresAt),
      remaining,
      contents: pack.contents.map((entry) => entry.label),
    });
  }
  return { offers, passPlot: LIVEOPS_PASS_PLOT, faucet: env.authMode === "dev" };
}

export async function buyLiveopsSku(playerId: string, sku: string, quoteId: string): Promise<string> {
  const pack = liveopsPack(sku);
  if (!pack) throw new LiveopsError("Unknown SKU", 400);
  const now = Date.now();
  const quote = await prisma.liveopsShopQuote.findFirst({ where: { id: quoteId, playerId, sku } });
  if (!quote) throw new LiveopsError("Quote not found", 400);
  if (num(quote.expiresAt) <= now || liveopsShouldReprice(quote.refPlotUsd)) {
    throw new LiveopsError("Quote expired — refresh the shop", 409);
  }
  const remaining = await remainingForPack(playerId, pack, now);
  if (remaining <= 0) throw new LiveopsError("Purchase cap reached", 409);
  const period = liveopsPurchasePeriod(pack.limit.kind, now);
  const day = utcDay(now);
  await prisma.$transaction(async (tx) => {
    if (pack.payment === "plot") {
      const paid = await tx.player.updateMany({
        where: { id: playerId, plotBalance: { gte: quote.plotPrice } },
        data: { plotBalance: { decrement: quote.plotPrice } },
      });
      if (paid.count !== 1) throw new LiveopsError(`Need ${quote.plotPrice} $PLOT`, 409);
    } else {
      const cost = pack.cashMinor ?? 0;
      const paid = await tx.player.updateMany({
        where: { id: playerId, cashMinor: { gte: cost } },
        data: { cashMinor: { decrement: cost } },
      });
      if (paid.count !== 1) throw new LiveopsError("Not enough Cash", 409);
      const bal = await tx.player.findUnique({ where: { id: playerId }, select: { cashMinor: true } });
      await recordLedger(tx, playerId, day, "liveops_shop", -cost, num(bal?.cashMinor), { sku });
    }
    await tx.liveopsShopPurchase.create({
      data: {
        id: newId(),
        playerId,
        sku,
        period,
        plotPaid: pack.payment === "plot" ? quote.plotPrice : 0,
        cashMinor: pack.payment === "cash" ? (pack.cashMinor ?? 0) : 0,
        createdAt: now,
      },
    });
    await grantPackContents(tx, playerId, pack.contents, `${sku}:${now}`, day);
  });
  return pack.name;
}

export async function faucetPlot(playerId: string): Promise<number> {
  if (env.authMode !== "dev") throw new LiveopsError("Faucet is dev-only", 403);
  await prisma.player.update({
    where: { id: playerId },
    data: { plotBalance: { increment: LIVEOPS_FAUCET_PLOT } },
  });
  return LIVEOPS_FAUCET_PLOT;
}
