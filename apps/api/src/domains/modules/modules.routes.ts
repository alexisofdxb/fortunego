import { Hono } from "hono";
import { z } from "zod";
import {
  buildingModuleProfile,
  moduleBuildingFamily,
  moduleDefinition,
  moduleEquippable,
  moduleSlotsForRuntimeStage,
  moduleStageAllowedAtEmpireLevel,
  resolveType,
  type ModuleReward,
} from "@plotgo/game";
import type { AppEnv } from "../../shared/types";
import { requirePlayer } from "../../middleware/auth";
import { prisma } from "../../infrastructure/postgres/client";
import { loadCards } from "../plot/board.service";
import {
  MODULE_CONFIG_VERSION,
  craftRows,
  effectiveAtBoundary,
  grantModuleParts,
  grantPendingModuleReward,
  masteryTierRows,
  moduleEntry,
  moduleInventoryRows,
  moduleLoadoutVersion,
  moduleLoadoutView,
  moduleLockForBuilding,
  modulePartsRows,
  pendingModuleRewards,
  resolveCraftJobs,
  stageGateSatisfied,
} from "../modules/modules.service";
import { currentEmpireLevel } from "../player/onboarding.service";
import { recordMeaningfulAction } from "../../shared/offline";
import { idempotencyKey } from "../../middleware/idempotency";
import { newId } from "../../shared/types";

export const moduleRoutes = new Hono<AppEnv>();

moduleRoutes.get("/api/modules", requirePlayer, async (c) => {
  const id = c.get("player").id;
  return c.json({ configVersion: MODULE_CONFIG_VERSION, catalog: await moduleInventoryRows(id), inventory: (await moduleInventoryRows(id)).filter((module) => module.quantityOwned > 0), parts: await modulePartsRows(id), crafts: await craftRows(id) });
});

moduleRoutes.get("/api/buildings/:buildingId/modules", requirePlayer, async (c) => {
  const id = c.get("player").id;
  const board = await loadCards(id);
  const card = board.find((candidate) => candidate.id === c.req.param("buildingId"));
  if (!card) return c.json({ error: "building not found" }, 404);
  return c.json({ loadout: await moduleLoadoutView(id, card), inventory: (await moduleInventoryRows(id)).filter((module) => module.quantityAvailable > 0) });
});

const EquipModule = z.object({ slot: z.number().int().min(0).max(3), moduleId: z.string(), expectedLoadoutVersion: z.number().int().nonnegative().optional(), idempotencyKey: z.string().min(8).max(128).optional() });

moduleRoutes.post("/api/buildings/:buildingId/modules/equip", requirePlayer, async (c) => {
  const id = c.get("player").id;
  const board = await loadCards(id);
  const card = board.find((candidate) => candidate.id === c.req.param("buildingId"));
  if (!card) return c.json({ error: "building not found" }, 404);
  const body = EquipModule.parse(await c.req.json());
  const entry = moduleEntry(body.moduleId);
  const definition = body.moduleId ? moduleDefinition(body.moduleId) : null;
  if (!entry || !definition) return c.json({ error: "module not found" }, 404);
  const profile = buildingModuleProfile(card.type);
  const unlockedSlots = moduleSlotsForRuntimeStage(card.type, card.stage);
  if (body.slot >= profile.maxModuleSlots || body.slot >= unlockedSlots) return c.json({ error: "module slot is locked" }, 409);
  const empireLevelNow = await currentEmpireLevel(id, board);
  if (!moduleEquippable(card.type, entry.id, empireLevelNow) || !moduleStageAllowedAtEmpireLevel(entry.id, empireLevelNow)) return c.json({ error: "module is not compatible with this building's stage, rarity, family, category, or Empire Level" }, 400);
  const lock = await moduleLockForBuilding(id, card);
  if (lock) return c.json({ error: lock }, 409);
  const key = idempotencyKey(body);
  try {
    await prisma.$transaction(async (tx) => {
      const prior = await tx.moduleLoadoutAudit.findFirst({ where: { playerId: id, buildingId: card.id, idempotencyKey: key }, select: { loadoutVersion: true } });
      if (prior) return;
      const currentVersion = await moduleLoadoutVersion(id, card.id);
      if (body.expectedLoadoutVersion != null && body.expectedLoadoutVersion !== currentVersion) throw new Error("loadout version conflict");
      const old = await tx.buildingModuleLoadout.findUnique({ where: { playerId_buildingId_slotIndex: { playerId: id, buildingId: card.id, slotIndex: body.slot } } });
      if (old?.moduleId === body.moduleId) return;
      const inventory = await tx.playerModuleInventory.findUnique({ where: { playerId_moduleId: { playerId: id, moduleId: body.moduleId } } });
      const available = (inventory?.quantityOwned ?? 0) - (inventory?.quantityEquipped ?? 0);
      if (available <= 0) throw new Error("module is not available in inventory");
      const duplicate = await tx.buildingModuleLoadout.findFirst({ where: { playerId: id, buildingId: card.id, moduleId: body.moduleId, slotIndex: { not: body.slot } } });
      if (duplicate) throw new Error("a building cannot equip the same module twice");
      if (entry.rarity.toLowerCase() === "legendary") {
        const loadoutRows = await tx.buildingModuleLoadout.findMany({ where: { playerId: id, buildingId: card.id } });
        const legendaryCount = loadoutRows.filter((loadout) => moduleEntry(loadout.moduleId)?.rarity.toLowerCase() === "legendary").length;
        if (legendaryCount >= 1 && old?.moduleId !== body.moduleId) throw new Error("only one Legendary Module may be equipped on a building");
      }
      const nextVersion = currentVersion + 1;
      if (old) await tx.playerModuleInventory.updateMany({ where: { playerId: id, moduleId: old.moduleId, quantityEquipped: { gt: 0 } }, data: { quantityEquipped: { decrement: 1 }, rowVersion: { increment: 1 } } });
      await tx.buildingModuleLoadout.deleteMany({ where: { playerId: id, buildingId: card.id, slotIndex: body.slot } });
      await tx.buildingModuleLoadout.create({ data: { playerId: id, buildingId: card.id, slotIndex: body.slot, moduleId: body.moduleId, effectiveAt: effectiveAtBoundary(), loadoutVersion: nextVersion } });
      await tx.playerModuleInventory.update({
        where: { playerId_moduleId: { playerId: id, moduleId: body.moduleId } },
        data: { quantityEquipped: { increment: 1 }, rowVersion: { increment: 1 } },
      });
      await tx.moduleLoadoutAudit.create({ data: { eventId: newId(), playerId: id, buildingId: card.id, slotIndex: body.slot, moduleId: body.moduleId, action: "equip", effectiveAt: effectiveAtBoundary(), loadoutVersion: nextVersion, idempotencyKey: key, createdAt: Date.now() } });
    });
  } catch (error) {
    return c.json({ error: error instanceof Error ? error.message : "module equip failed" }, 409);
  }
  await recordMeaningfulAction(id, `module_equip:${card.id}:${body.slot}`);
  return c.json({ loadout: await moduleLoadoutView(id, card) });
});

const UnequipModule = z.object({ slot: z.number().int().min(0).max(3), expectedLoadoutVersion: z.number().int().nonnegative().optional(), idempotencyKey: z.string().min(8).max(128).optional() });

moduleRoutes.post("/api/buildings/:buildingId/modules/unequip", requirePlayer, async (c) => {
  const id = c.get("player").id;
  const board = await loadCards(id);
  const card = board.find((candidate) => candidate.id === c.req.param("buildingId"));
  if (!card) return c.json({ error: "building not found" }, 404);
  const body = UnequipModule.parse(await c.req.json());
  if (body.slot >= buildingModuleProfile(card.type).maxModuleSlots) return c.json({ error: "invalid module slot" }, 400);
  const lock = await moduleLockForBuilding(id, card);
  if (lock) return c.json({ error: lock }, 409);
  const key = idempotencyKey(body);
  try {
    await prisma.$transaction(async (tx) => {
      const prior = await tx.moduleLoadoutAudit.findFirst({ where: { playerId: id, buildingId: card.id, idempotencyKey: key } });
      if (prior) return;
      const currentVersion = await moduleLoadoutVersion(id, card.id);
      if (body.expectedLoadoutVersion != null && body.expectedLoadoutVersion !== currentVersion) throw new Error("loadout version conflict");
      const row = await tx.buildingModuleLoadout.findUnique({ where: { playerId_buildingId_slotIndex: { playerId: id, buildingId: card.id, slotIndex: body.slot } } });
      if (!row) return;
      const nextVersion = currentVersion + 1;
      await tx.buildingModuleLoadout.deleteMany({ where: { playerId: id, buildingId: card.id, slotIndex: body.slot } });
      await tx.playerModuleInventory.updateMany({ where: { playerId: id, moduleId: row.moduleId }, data: { quantityEquipped: { decrement: 1 }, rowVersion: { increment: 1 } } });
      await tx.moduleLoadoutAudit.create({ data: { eventId: newId(), playerId: id, buildingId: card.id, slotIndex: body.slot, moduleId: row.moduleId, action: "unequip", effectiveAt: effectiveAtBoundary(), loadoutVersion: nextVersion, idempotencyKey: key, createdAt: Date.now() } });
    });
  } catch (error) {
    return c.json({ error: error instanceof Error ? error.message : "module unequip failed" }, 409);
  }
  await recordMeaningfulAction(id, `module_unequip:${card.id}:${body.slot}`);
  return c.json({ loadout: await moduleLoadoutView(id, card) });
});

moduleRoutes.get("/api/building-mastery", requirePlayer, async (c) => {
  const id = c.get("player").id;
  const requested = c.req.query("buildingType");
  const types = requested ? [resolveType(requested)] : [...new Set((await loadCards(id)).map((card) => resolveType(card.type)))];
  return c.json({ mastery: await Promise.all(types.map(async (type) => ({ buildingType: type, tiers: await masteryTierRows(id, type) }))) });
});

moduleRoutes.post("/api/building-mastery/claim", requirePlayer, async (c) => {
  const id = c.get("player").id;
  const body = z.object({ buildingType: z.string(), tier: z.number().int().min(1).max(5), choiceIndex: z.number().int().min(0).max(2), idempotencyKey: z.string().min(8).max(128).optional() }).parse(await c.req.json());
  const type = resolveType(body.buildingType);
  const tiers = await masteryTierRows(id, type);
  const tier = tiers.find((candidate) => candidate.tier === body.tier);
  if (!tier || !tier.complete || tier.status === "claimed") return c.json({ error: "mastery tier is not claimable" }, 409);
  const choice = tier.choices[body.choiceIndex];
  if (!choice) return c.json({ error: "invalid mastery choice" }, 400);
  const key = idempotencyKey(body);
  const sourceEventId = `${type}:${body.tier}`;
  try {
    await prisma.$transaction(async (tx) => {
      const prior = await tx.buildingMasteryProgress.findUnique({ where: { playerId_buildingType_tier: { playerId: id, buildingType: type, tier: body.tier } }, select: { claimedAt: true } });
      if (prior?.claimedAt != null) return;
      const reward: ModuleReward = { kind: "module", rarity: choice.rarity as ModuleReward["rarity"], quantity: 1, partsAmount: 0, compatibleFamily: moduleBuildingFamily(type), moduleId: choice.moduleId, moduleName: choice.name };
      await grantPendingModuleReward(tx, id, "mastery", sourceEventId, reward, { buildingType: type, tier: body.tier, choiceIndex: body.choiceIndex, idempotencyKey: key });
      await tx.buildingMasteryProgress.updateMany({ where: { playerId: id, buildingType: type, tier: body.tier, claimedAt: null }, data: { status: "claimed", claimedAt: Date.now(), rowVersion: { increment: 1 } } });
    });
  } catch (error) {
    return c.json({ error: error instanceof Error ? error.message : "mastery claim failed" }, 409);
  }
  await recordMeaningfulAction(id, `mastery:${type}:${body.tier}`);
  return c.json({ module: choice, mastery: (await masteryTierRows(id, type)).find((candidate) => candidate.tier === body.tier) });
});

moduleRoutes.post("/api/modules/dismantle", requirePlayer, async (c) => {
  const id = c.get("player").id;
  const body = z.object({ moduleId: z.string(), quantity: z.number().int().min(1).max(100), idempotencyKey: z.string().min(8).max(128).optional() }).parse(await c.req.json());
  const entry = moduleEntry(body.moduleId);
  if (!entry) return c.json({ error: "module not found" }, 404);
  const key = idempotencyKey(body);
  const source = "dismantle";
  const sourceEventId = `${key}:${body.moduleId}`;
  try {
    await prisma.$transaction(async (tx) => {
      const inventory = await tx.playerModuleInventory.findUnique({ where: { playerId_moduleId: { playerId: id, moduleId: body.moduleId } } });
      const available = (inventory?.quantityOwned ?? 0) - (inventory?.quantityEquipped ?? 0);
      if (available < body.quantity) throw new Error("not enough un-equipped copies");
      // Conditional deduct: fails if a concurrent equip changed availability.
      const changed = await tx.playerModuleInventory.updateMany({
        where: { playerId: id, moduleId: body.moduleId, quantityOwned: { gte: (inventory?.quantityEquipped ?? 0) + body.quantity } },
        data: { quantityOwned: { decrement: body.quantity }, rowVersion: { increment: 1 } },
      });
      if (changed.count !== 1) throw new Error("inventory changed; retry");
      await grantModuleParts(tx, id, entry.rarity.toLowerCase(), entry.dismantleParts * body.quantity, source, sourceEventId);
    });
  } catch (error) {
    return c.json({ error: error instanceof Error ? error.message : "dismantle failed" }, 409);
  }
  await recordMeaningfulAction(id, `module_dismantle:${body.moduleId}`);
  return c.json({ moduleId: body.moduleId, dismantled: body.quantity, parts: entry.dismantleParts * body.quantity, partsBalance: await modulePartsRows(id) });
});

moduleRoutes.post("/api/modules/craft", requirePlayer, async (c) => {
  const id = c.get("player").id;
  const body = z.object({ moduleId: z.string(), idempotencyKey: z.string().min(8).max(128).optional() }).parse(await c.req.json());
  const entry = moduleEntry(body.moduleId);
  if (!entry) return c.json({ error: "module not found" }, 404);
  if (!(await stageGateSatisfied(id, entry.stageGate))) return c.json({ error: `Module requires ${entry.stageGate}` }, 409);
  const key = idempotencyKey(body);
  await resolveCraftJobs(id);
  const existing = await prisma.moduleCraftJob.findFirst({ where: { playerId: id, idempotencyKey: key }, select: { craftId: true } });
  if (existing) return c.json({ crafts: await craftRows(id) });
  const now = Date.now();
  const craftId = newId();
  try {
    await prisma.$transaction(async (tx) => {
      const balanceRow = await tx.modulePartsBalance.findUnique({ where: { playerId_rarity: { playerId: id, rarity: entry.rarity.toLowerCase() } } });
      if ((balanceRow?.balance ?? 0n) < BigInt(entry.craftCost)) throw new Error(`requires ${entry.craftCost} ${entry.rarity} Parts`);
      // Conditional deduct: fails if a concurrent credit/debit changed the balance.
      const deducted = await tx.modulePartsBalance.updateMany({
        where: { playerId: id, rarity: entry.rarity.toLowerCase(), balance: { gte: entry.craftCost } },
        data: { balance: { decrement: entry.craftCost }, rowVersion: { increment: 1 } },
      });
      if (deducted.count !== 1) throw new Error("Parts balance changed; retry");
      await tx.modulePartsLedger.create({ data: { entryId: newId(), playerId: id, rarity: entry.rarity.toLowerCase(), delta: -entry.craftCost, source: "craft", sourceEventId: craftId, createdAt: now } });
      await tx.moduleCraftJob.create({ data: { craftId, playerId: id, moduleId: entry.id, rarity: entry.rarity.toLowerCase(), partsCost: entry.craftCost, startedAt: now, completesAt: now + entry.craftTimeMin * 60_000, status: "pending", idempotencyKey: key, createdAt: now } });
    });
  } catch (error) {
    return c.json({ error: error instanceof Error ? error.message : "craft failed" }, 409);
  }
  await recordMeaningfulAction(id, `module_craft:${entry.id}`);
  return c.json({ craftId, moduleId: entry.id, name: entry.name, completesAt: now + entry.craftTimeMin * 60_000, crafts: await craftRows(id) });
});

moduleRoutes.get("/api/modules/crafts", requirePlayer, async (c) => {
  const id = c.get("player").id;
  return c.json({ crafts: await craftRows(id) });
});

const CancelCraft = z.object({ craftId: z.string().min(1) });

/**
 * Craft cancel (spec sheet 33, P2): pending, incomplete jobs only. Refunds the
 * frozen partsCost to module_parts_balance with a "craft_cancel" parts ledger entry
 * (distinct source string keeps the (playerId, source, sourceEventId) unique key).
 * Single transaction; cancelling an already-cancelled job is a 200 no-op returning
 * the same resulting state (idempotent).
 */
moduleRoutes.post("/api/modules/crafts/cancel", requirePlayer, async (c) => {
  const id = c.get("player").id;
  const body = CancelCraft.parse(await c.req.json());
  const job = await prisma.moduleCraftJob.findUnique({ where: { craftId: body.craftId } });
  if (!job || job.playerId !== id) return c.json({ error: "craft job not found" }, 404);
  if (job.status === "cancelled") return c.json({ crafts: await craftRows(id) });
  if (job.status !== "pending") return c.json({ error: "craft job is already complete" }, 409);
  const now = Date.now();
  try {
    await prisma.$transaction(async (tx) => {
      // Conditional flip: loses the race against a concurrent cancel/complete.
      const cancelled = await tx.moduleCraftJob.updateMany({
        where: { craftId: job.craftId, playerId: id, status: "pending" },
        data: { status: "cancelled", completedAt: now },
      });
      if (cancelled.count !== 1) throw new Error("craft job is no longer cancellable");
      await tx.modulePartsBalance.upsert({
        where: { playerId_rarity: { playerId: id, rarity: job.rarity } },
        create: { playerId: id, rarity: job.rarity, balance: job.partsCost, rowVersion: 1 },
        update: { balance: { increment: job.partsCost }, rowVersion: { increment: 1 } },
      });
      await tx.modulePartsLedger.create({
        data: { entryId: newId(), playerId: id, rarity: job.rarity, delta: job.partsCost, source: "craft_cancel", sourceEventId: job.craftId, createdAt: now },
      });
    });
  } catch (error) {
    return c.json({ error: error instanceof Error ? error.message : "craft cancel failed" }, 409);
  }
  await recordMeaningfulAction(id, `module_craft_cancel:${job.moduleId}`);
  return c.json({ crafts: await craftRows(id) });
});

moduleRoutes.get("/api/modules/rewards", requirePlayer, async (c) => {
  const id = c.get("player").id;
  return c.json({ rewards: await pendingModuleRewards(id) });
});
