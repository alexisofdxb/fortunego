import {
  CARDS,
  canonicalModuleCatalog,
  empireLevel,
  marketStageForEmpireLevel,
  moduleBuildingFamily,
  moduleDefinition,
  moduleEquippable,
  moduleLockForEvent,
  moduleSlotsForRuntimeStage,
  resolveModuleEffects,
  resolveType,
  buildingModuleProfile,
  buildingFamily,
  type ModuleEffectVector,
  type ModuleReward,
  type PlacedCard,
} from "@plotgo/game";
import type { Prisma } from "@prisma/client";
import { prisma } from "../../infrastructure/postgres/client";
import { newId, num, parseDays } from "../../shared/types";
import { eventState } from "../events/events.service";

type Db = Prisma.TransactionClient | typeof prisma;

export const MODULE_CONFIG_VERSION = "catalog-v1.0";

/** Seed the module_config table from the game catalog at boot (INSERT OR IGNORE semantics). */
export async function ensureModuleConfig() {
  const now = Date.now();
  await prisma.$transaction(async (tx) => {
    for (const entry of canonicalModuleCatalog()) {
      const definition = moduleDefinition(entry.id);
      await tx.moduleConfig.createMany({
        data: [{
          moduleId: entry.id,
          configVersion: MODULE_CONFIG_VERSION,
          rarity: entry.rarity.toLowerCase(),
          category: entry.category,
          compatibleFamilies: entry.families,
          configJson: JSON.parse(JSON.stringify(definition ?? entry)) as object,
          isActive: true,
          effectiveFrom: now,
        }],
        skipDuplicates: true,
      });
    }
  });
}

export function moduleEntry(moduleId: string) {
  return canonicalModuleCatalog().find((entry) => entry.id === moduleId) ?? null;
}

export async function moduleInventoryRows(playerId: string) {
  const rows = await prisma.playerModuleInventory.findMany({ where: { playerId }, orderBy: { moduleId: "asc" } });
  const byId = new Map(rows.map((row) => [row.moduleId, row]));
  return canonicalModuleCatalog().map((entry) => {
    const row = byId.get(entry.id);
    const definition = moduleDefinition(entry.id);
    return {
      moduleId: entry.id,
      name: entry.name,
      rarity: entry.rarity.toLowerCase(),
      category: entry.category,
      families: entry.families.split(",").map((family) => family.trim()).filter(Boolean),
      role: entry.role,
      primaryPower: entry.primaryPower,
      secondaryPower: entry.secondaryPower,
      condition: entry.condition,
      craftParts: entry.craftParts,
      craftCost: entry.craftCost,
      craftTimeMin: entry.craftTimeMin,
      dismantleParts: entry.dismantleParts,
      effects: definition?.effects ?? [],
      quantityOwned: row?.quantityOwned ?? 0,
      quantityEquipped: row?.quantityEquipped ?? 0,
      quantityAvailable: Math.max(0, (row?.quantityOwned ?? 0) - (row?.quantityEquipped ?? 0)),
      firstAcquiredAt: row?.firstAcquiredAt == null ? null : num(row.firstAcquiredAt),
      lastAcquiredAt: row?.lastAcquiredAt == null ? null : num(row.lastAcquiredAt),
      rowVersion: row?.rowVersion ?? 0,
      configVersion: MODULE_CONFIG_VERSION,
    };
  });
}

export async function modulePartsRows(playerId: string) {
  const rows = await prisma.modulePartsBalance.findMany({ where: { playerId }, orderBy: { rarity: "asc" } });
  const byRarity = new Map(rows.map((row) => [row.rarity, row]));
  return (["common", "uncommon", "rare", "epic", "legendary"] as const).map((rarity) => ({
    rarity,
    balance: num(byRarity.get(rarity)?.balance ?? 0),
    rowVersion: byRarity.get(rarity)?.rowVersion ?? 0,
  }));
}

export async function grantModuleInventory(db: Db, playerId: string, moduleId: string, quantity: number, now = Date.now()): Promise<boolean> {
  if (quantity <= 0 || !moduleEntry(moduleId)) return false;
  const result = await db.playerModuleInventory.upsert({
    where: { playerId_moduleId: { playerId, moduleId } },
    create: { playerId, moduleId, quantityOwned: quantity, quantityEquipped: 0, firstAcquiredAt: now, lastAcquiredAt: now, rowVersion: 1 },
    update: { quantityOwned: { increment: quantity }, lastAcquiredAt: now, rowVersion: { increment: 1 } },
  });
  return result != null;
}

export async function grantModuleParts(db: Db, playerId: string, rarity: string, amount: number, source: string, sourceEventId: string, now = Date.now()): Promise<boolean> {
  if (amount <= 0) return false;
  const ledger = await db.modulePartsLedger.createMany({
    data: [{ entryId: newId(), playerId, rarity, delta: amount, source, sourceEventId, createdAt: now }],
    skipDuplicates: true,
  });
  if (ledger.count !== 1) return false;
  await db.modulePartsBalance.upsert({
    where: { playerId_rarity: { playerId, rarity } },
    create: { playerId, rarity, balance: amount, rowVersion: 1 },
    update: { balance: { increment: amount }, rowVersion: { increment: 1 } },
  });
  return true;
}

export async function moduleEffectsForBoard(playerId: string, board: PlacedCard[], activeEvents: readonly string[] = [], marketState = "Neutral"): Promise<Record<string, ModuleEffectVector>> {
  const player = await prisma.player.findUnique({
    where: { id: playerId },
    select: { reputationBps: true, satisfactionBps: true, riskBps: true, conditionBps: true },
  });
  const loadouts = await prisma.buildingModuleLoadout.findMany({
    where: { playerId, effectiveAt: { lte: Date.now() } },
    orderBy: [{ buildingId: "asc" }, { slotIndex: "asc" }],
  });
  const byBuilding = new Map<string, string[]>();
  for (const row of loadouts) {
    const modules = byBuilding.get(row.buildingId) ?? [];
    modules.push(row.moduleId);
    byBuilding.set(row.buildingId, modules);
  }
  const context = {
    reputation: (player?.reputationBps ?? 5000) / 100,
    serviceQuality: (player?.satisfactionBps ?? 5000) / 100,
    risk: {
      operational: (player?.riskBps ?? 700) / 100,
      market: (player?.riskBps ?? 700) / 100,
      liquidity: (player?.riskBps ?? 700) / 100,
      credit: (player?.riskBps ?? 700) / 100,
      reputation: Math.max(0, 100 - (player?.reputationBps ?? 5000) / 100),
      concentration: (player?.riskBps ?? 700) / 100,
      composite: (player?.riskBps ?? 700) / 100,
    },
    activeEvents,
    marketState,
    empireStage: marketStageForEmpireLevel(empireLevel(board)),
  } as const;
  const result: Record<string, ModuleEffectVector> = {};
  for (const card of board) {
    const active = (byBuilding.get(card.id) ?? []).filter((moduleId) => !activeEvents.some((eventId) => moduleLockForEvent(eventId, buildingFamily(card.type))));
    result[card.id] = resolveModuleEffects(card.type, active, context);
  }
  return result;
}

export function effectiveAtBoundary(now = Date.now()) {
  return Math.ceil(now / (5 * 60_000)) * 5 * 60_000;
}

function vectorHasEffects(vector: ModuleEffectVector): boolean {
  return vector.customerAcquisitionBps !== 0
    || vector.retentionBps !== 0
    || vector.capacityBps !== 0
    || vector.activityEfficiencyBps !== 0
    || vector.operatingCostReductionBps !== 0
    || vector.serviceQualityPoints !== 0
    || vector.eventResilienceBps !== 0
    || Object.values(vector.riskDeltas).some((value) => value !== 0);
}

/**
 * Module lineage refs for economic output (spec sheets 10/13/32): when any
 * equipped module affected the settlement, the plotgo_ledger entry retains the
 * loadout/config versions so contested module-influenced outcomes can be
 * replayed. Returns null when no module affected the board, so ledgers without
 * modules stay unchanged. Additive metadata only.
 */
export async function moduleLineageRefs(
  playerId: string,
  board: PlacedCard[],
  moduleEffects: Record<string, ModuleEffectVector>,
): Promise<{ moduleLoadoutVersions: number[]; moduleConfigVersion: string } | null> {
  const affected = board.filter((card) => {
    const vector = moduleEffects[card.id];
    return vector != null && (vector.appliedModules.length > 0 || vectorHasEffects(vector));
  });
  if (!affected.length) return null;
  const versions = new Set<number>();
  for (const card of affected) versions.add(await moduleLoadoutVersion(playerId, card.id));
  return { moduleLoadoutVersions: [...versions].sort((a, b) => a - b), moduleConfigVersion: MODULE_CONFIG_VERSION };
}

export async function pendingModuleRewards(playerId: string) {
  const rows = await prisma.plotgoModuleRewardEvent.findMany({
    where: { playerId, status: "pending" },
    orderBy: { createdAt: "asc" },
  });
  return rows.map((row) => ({
    rewardId: row.rewardId,
    source: row.source,
    sourceEventId: row.sourceEventId,
    kind: row.rewardKind,
    rarity: row.rarity,
    moduleId: row.moduleId,
    moduleName: row.moduleId == null ? null : moduleEntry(row.moduleId)?.name ?? null,
    quantity: row.quantity,
    partsAmount: row.partsAmount,
    metadata: row.metadataJson as Record<string, unknown>,
    createdAt: num(row.createdAt),
  }));
}

export async function grantPendingModuleReward(db: Db, playerId: string, source: string, sourceEventId: string, reward: ModuleReward | null, metadata: Record<string, unknown> = {}): Promise<string | null> {
  if (!reward) return null;
  const created = await db.plotgoModuleRewardEvent.createMany({
    data: [{
      rewardId: newId(),
      playerId,
      source,
      sourceEventId,
      rewardKind: reward.kind,
      rarity: reward.rarity,
      moduleId: reward.moduleId,
      configVersion: MODULE_CONFIG_VERSION,
      quantity: reward.quantity,
      partsAmount: reward.partsAmount,
      metadataJson: { ...metadata, compatibleFamily: reward.compatibleFamily, moduleName: reward.moduleName },
      createdAt: Date.now(),
    }],
    skipDuplicates: true,
  });
  if (created.count === 1) {
    if (reward.kind === "module" && reward.moduleId) await grantModuleInventory(db, playerId, reward.moduleId, reward.quantity);
    if (reward.kind === "parts") await grantModuleParts(db, playerId, reward.rarity, reward.partsAmount, source, sourceEventId);
  }
  const row = await db.plotgoModuleRewardEvent.findFirst({ where: { playerId, source, sourceEventId }, select: { rewardId: true } });
  return row?.rewardId ?? null;
}

export async function moduleLoadoutVersion(playerId: string, buildingId: string): Promise<number> {
  const [loadoutMax, auditMax] = await Promise.all([
    prisma.buildingModuleLoadout.aggregate({ where: { playerId, buildingId }, _max: { loadoutVersion: true } }),
    prisma.moduleLoadoutAudit.aggregate({ where: { playerId, buildingId }, _max: { loadoutVersion: true } }),
  ]);
  return Math.max(loadoutMax._max.loadoutVersion ?? 0, auditMax._max.loadoutVersion ?? 0);
}

export async function moduleLoadoutView(playerId: string, card: PlacedCard) {
  const profile = buildingModuleProfile(card.type);
  const unlockedSlots = moduleSlotsForRuntimeStage(card.type, card.stage);
  const rows = await prisma.buildingModuleLoadout.findMany({
    where: { playerId, buildingId: card.id },
    orderBy: { slotIndex: "asc" },
  });
  const bySlot = new Map(rows.map((row) => [row.slotIndex, row]));
  const version = await moduleLoadoutVersion(playerId, card.id);
  const slots = Array.from({ length: profile.maxModuleSlots }, (_, slotIndex) => {
    const row = bySlot.get(slotIndex);
    const entry = row ? moduleEntry(row.moduleId) : null;
    return {
      slotIndex,
      unlocked: slotIndex < unlockedSlots,
      unlockLevel: profile.slotUnlockLevels[slotIndex] ?? null,
      module: entry ? { moduleId: entry.id, name: entry.name, rarity: entry.rarity.toLowerCase(), category: entry.category, primaryPower: entry.primaryPower, secondaryPower: entry.secondaryPower, condition: entry.condition } : null,
      effectiveAt: row == null ? null : num(row.effectiveAt),
      loadoutVersion: row?.loadoutVersion ?? version,
    };
  });
  const events = (await eventState(playerId, [card], marketStageForEmpireLevel(empireLevel([card])), Date.now())).moduleLocks.filter((lock) => lock.buildingId === card.id);
  const effects = await moduleEffectsForBoard(playerId, [card], events.map((lock) => lock.eventId));
  return {
    buildingId: card.id,
    buildingType: card.type,
    buildingFamily: moduleBuildingFamily(card.type),
    buildingStage: card.stage,
    profile,
    loadoutVersion: version,
    slots,
    effectiveAt: effectiveAtBoundary(),
    effects: effects[card.id],
    locks: events,
  };
}

export async function moduleLoadoutSummaries(playerId: string, board: PlacedCard[]) {
  const summaries = [];
  for (const card of board) {
    const profile = buildingModuleProfile(card.type);
    const unlockedSlots = moduleSlotsForRuntimeStage(card.type, card.stage);
    const rows = await prisma.buildingModuleLoadout.findMany({
      where: { playerId, buildingId: card.id },
      orderBy: { slotIndex: "asc" },
    });
    summaries.push({
      buildingId: card.id,
      buildingType: card.type,
      buildingStage: card.stage,
      loadoutVersion: await moduleLoadoutVersion(playerId, card.id),
      maxModuleSlots: profile.maxModuleSlots,
      unlockedSlots,
      slots: rows.map((row) => ({
        slotIndex: row.slotIndex,
        moduleId: row.moduleId,
        module: moduleEntry(row.moduleId)?.name ?? row.moduleId,
        rarity: moduleEntry(row.moduleId)?.rarity.toLowerCase() ?? "common",
        effectiveAt: num(row.effectiveAt),
      })),
    });
  }
  return summaries;
}

export async function moduleLockForBuilding(playerId: string, card: PlacedCard): Promise<string | null> {
  const stage = marketStageForEmpireLevel(empireLevel([card]));
  const locks = (await eventState(playerId, [card], stage, Date.now())).moduleLocks.filter((lock) => lock.buildingId === card.id);
  return locks[0]?.reason ?? null;
}

export async function masteryTierRows(playerId: string, buildingType: string) {
  const type = resolveType(buildingType);
  const player = await prisma.player.findUnique({
    where: { id: playerId },
    select: { activeDays: true, reputationBps: true, transactions: true, volumeMinor: true },
  });
  const activeDays = parseDays(player?.activeDays);
  const board = await prisma.card.findMany({ where: { playerId, type }, select: { stage: true } });
  const maxStage = Math.max(0, ...board.map((row) => row.stage));
  const metrics = { activeDays: activeDays.length, buildingCount: board.length, maxStage, reputation: (player?.reputationBps ?? 0) / 100, transactions: player?.transactions ?? 0, volume: num(player?.volumeMinor) };
  const objectives = [
    { tier: 1, text: "Place the building and complete one active day.", complete: metrics.buildingCount > 0 && metrics.activeDays >= 1 },
    { tier: 2, text: "Operate the building at Stage 2 with 10 transactions.", complete: metrics.maxStage >= 2 && metrics.transactions >= 10 },
    { tier: 3, text: "Operate for 3 active days with 60 reputation.", complete: metrics.buildingCount > 0 && metrics.activeDays >= 3 && metrics.reputation >= 60 },
    { tier: 4, text: "Reach Stage 3 and 50 transactions.", complete: metrics.maxStage >= 3 && metrics.transactions >= 50 },
    { tier: 5, text: "Operate for 7 active days and reach 100 transactions.", complete: metrics.buildingCount > 0 && metrics.activeDays >= 7 && metrics.transactions >= 100 },
  ];
  const existing = await prisma.buildingMasteryProgress.findMany({ where: { playerId, buildingType: type }, orderBy: { tier: "asc" } });
  const byTier = new Map(existing.map((row) => [row.tier, row]));
  const maxRarityByTier = ["common", "uncommon", "rare", "epic", "legendary"] as const;
  const rarityRank: Record<string, number> = { common: 0, uncommon: 1, rare: 2, epic: 3, legendary: 4 };
  const rows = [];
  for (const objective of objectives) {
    const row = byTier.get(objective.tier);
    const complete = objective.complete;
    const status = row?.claimedAt != null ? "claimed" : complete ? "complete" : "active";
    const completedAt = complete ? (row?.completedAt != null && num(row.completedAt) !== 0 ? num(row.completedAt) : Date.now()) : null;
    await prisma.buildingMasteryProgress.upsert({
      where: { playerId_buildingType_tier: { playerId, buildingType: type, tier: objective.tier } },
      create: { playerId, buildingType: type, tier: objective.tier, progressJson: { ...metrics, objective: objective.text }, status, completedAt, claimedAt: row?.claimedAt ?? null },
      update: {
        progressJson: { ...metrics, objective: objective.text },
        status: row?.claimedAt != null ? "claimed" : status,
        completedAt: row?.completedAt != null ? row.completedAt : completedAt,
      },
    });
    const compatible = canonicalModuleCatalog().filter((entry) => moduleEquippable(type, entry.id) && rarityRank[entry.rarity.toLowerCase()] <= rarityRank[maxRarityByTier[objective.tier - 1]!]);
    const choices = compatible.slice(0, objective.tier >= 4 ? 2 : 3).map((entry) => ({ moduleId: entry.id, name: entry.name, rarity: entry.rarity.toLowerCase(), category: entry.category, primaryPower: entry.primaryPower, secondaryPower: entry.secondaryPower }));
    rows.push({ tier: objective.tier, objective: objective.text, progress: metrics, status, complete, claimedAt: row?.claimedAt == null ? null : num(row.claimedAt), choices });
  }
  return rows;
}

export async function resolveCraftJobs(playerId: string) {
  const now = Date.now();
  const rows = await prisma.moduleCraftJob.findMany({
    where: { playerId, status: "pending", completesAt: { lte: now } },
    orderBy: { completesAt: "asc" },
  });
  await prisma.$transaction(async (tx) => {
    for (const row of rows) {
      const updated = await tx.moduleCraftJob.updateMany({ where: { craftId: row.craftId, status: "pending" }, data: { status: "completed", completedAt: now } });
      if (updated.count === 1) await grantModuleInventory(tx, playerId, row.moduleId, 1, now);
    }
  });
}

export async function craftRows(playerId: string) {
  await resolveCraftJobs(playerId);
  const rows = await prisma.moduleCraftJob.findMany({
    where: { playerId },
    orderBy: { createdAt: "desc" },
    take: 50,
  });
  return rows.map((row) => ({
    craftId: row.craftId,
    moduleId: row.moduleId,
    rarity: row.rarity,
    partsCost: num(row.partsCost),
    startedAt: num(row.startedAt),
    completesAt: num(row.completesAt),
    status: row.status,
    completedAt: row.completedAt == null ? null : num(row.completedAt),
    name: moduleEntry(row.moduleId)?.name ?? row.moduleId,
  }));
}

export async function stageGateSatisfied(playerId: string, gate: string): Promise<boolean> {
  const cardsForStage = await prisma.card.findMany({ where: { playerId }, select: { stage: true } });
  const stage = marketStageForEmpireLevel(empireLevel(cardsForStage));
  const normalized = gate.toLowerCase();
  const required = normalized.includes("tycoon") ? "tycoon" : normalized.includes("elite") ? "elite" : normalized.includes("established") ? "established" : normalized.includes("growing") ? "growing" : normalized.includes("starter") ? "starter" : "humble";
  const rank: Record<string, number> = { humble: 0, starter: 1, growing: 2, established: 3, elite: 4, tycoon: 5 };
  return rank[stage] >= rank[required];
}
