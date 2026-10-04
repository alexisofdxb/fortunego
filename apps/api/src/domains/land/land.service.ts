import {
  CASH_SCALE,
  CARDS,
  HEXES,
  LAND_ACQUISITION_ORDER,
  MAX_EMPIRE_LEVEL,
  PLACEMENT_FIT_MAX,
  PLACEMENT_FIT_MIN,
  XP_FOR_LEVEL,
  canAcquire,
  clampLevel,
  frontierHexIds,
  hexAttribute,
  hexForParcel,
  landPrice,
  maxHexesForLevel,
  parcelForHex,
  placementFitMultiplier,
  resolveType,
  utcDay,
  type HexAttribute,
  type LandPrice,
} from "@plotgo/game";
import type { PlotgoLand } from "@prisma/client";
import { prisma } from "../../infrastructure/postgres/client";
import { newId, num } from "../../shared/types";
import { recordLedger } from "../economy/ledger.service";
import { awardLand } from "../player/empire.service";

// ---------------------------------------------------------------------------
// Land service (v0.2 Land Acquisition + Hex Balance sheets, Phase 2).
// Ownership lives in plotgo_land; acquisition rules and prices come from the
// canonical game package (canAcquire / landPrice / frontierHexIds).
// ---------------------------------------------------------------------------

export type LandOwnership = {
  hexId: string;
  parcelId: string | null;
  method: string;
  priceMinor: number;
  acquiredAt: number;
};

export async function ownedLandRows(playerId: string): Promise<PlotgoLand[]> {
  return prisma.plotgoLand.findMany({ where: { playerId } });
}

export function ownershipView(row: PlotgoLand): LandOwnership {
  return {
    hexId: row.hexId,
    parcelId: parcelForHex(row.hexId) ?? null,
    method: row.method,
    priceMinor: num(row.priceMinor),
    acquiredAt: num(row.acquiredAt),
  };
}

export type LandHexView = {
  hexId: string;
  parcelId: string | null;
  cx: number;
  cy: number;
  /** Ring band letter from the parcel id (A/B/C/D). */
  ring: string | null;
  grade: string | null;
  lvi: number;
  attributes: HexAttribute | null;
  owned: boolean;
  frontier: boolean;
  acquiredMethod: string | null;
  price: { cost: number; requiredLevel: number; method: LandPrice["method"] } | null;
};

export type LandView = {
  hexes: LandHexView[];
  ownedCount: number;
  capacityForLevel: number;
  empireLevel: number;
};

function priceForHex(hexId: string) {
  const parcelId = parcelForHex(hexId);
  return parcelId ? landPrice(parcelId) : undefined;
}

/** Full land board for the acquisition UI, in canonical acquisition order. */
export function landView(playerLevel: number, rows: PlotgoLand[]): LandView {
  const owned = new Map(rows.map((row) => [row.hexId, row]));
  const frontier = new Set(frontierHexIds(rows.map((row) => row.hexId), playerLevel));
  const positions = new Map(HEXES.map((hex) => [hex.id, hex]));
  const hexes: LandHexView[] = LAND_ACQUISITION_ORDER.map((parcelId) => {
    const hexId = hexForParcel(parcelId) ?? "";
    const attr = hexAttribute(hexId);
    const price = priceForHex(hexId);
    const position = positions.get(hexId);
    const row = owned.get(hexId);
    return {
      hexId,
      parcelId,
      cx: position?.cx ?? 0,
      cy: position?.cy ?? 0,
      ring: parcelId.charAt(0),
      grade: attr?.grade ?? null,
      lvi: attr?.lvi ?? 0,
      attributes: attr ?? null,
      owned: row != null,
      frontier: row == null && frontier.has(hexId),
      acquiredMethod: row?.method ?? null,
      priceMinor: price ? Math.round(price.cost * 100) : 0,
      price: price ? { cost: price.cost, requiredLevel: price.requiredLevel, method: price.method } : null,
    };
  });
  const level = clampLevel(playerLevel);
  return { hexes, ownedCount: rows.length, capacityForLevel: maxHexesForLevel(level), empireLevel: level };
}

/**
 * Snapshot hex-board rows (v2): flat price fields, no attribute blob. Ordered
 * by the layout for stable rendering (cx/cy carry the geometry).
 */
export function hexBoardRows(rows: PlotgoLand[], playerLevel: number) {
  const owned = new Map(rows.map((row) => [row.hexId, row]));
  const frontier = new Set(frontierHexIds(rows.map((row) => row.hexId), playerLevel));
  return HEXES.map((hex) => {
    const attr = hexAttribute(hex.id);
    const parcelId = parcelForHex(hex.id) ?? null;
    const price = priceForHex(hex.id);
    const row = owned.get(hex.id);
    return {
      hexId: hex.id,
      parcelId,
      cx: hex.cx,
      cy: hex.cy,
      ring: parcelId ? parcelId.charAt(0) : null,
      grade: attr?.grade ?? null,
      lvi: attr?.lvi ?? 0,
      owned: row != null,
      frontier: row == null && frontier.has(hex.id),
      priceMinor: price ? Math.round(price.cost * 100) : 0,
      requiredLevel: price?.requiredLevel ?? 1,
      acquisitionMethod: price?.method ?? null,
    };
  });
}

// --- Acquisition -------------------------------------------------------------

const METHOD_KEY: Record<LandPrice["method"], string> = {
  "Starter Grant": "starter_grant",
  "Frontier Deed": "frontier_deed",
  "Cash Purchase": "cash_purchase",
};

export type AcquireOutcome =
  | { status: 200; replayed: boolean; ownership: LandOwnership }
  | { status: 400 | 403 | 404 | 409; error: string };

function acquireReasonMessage(reason: string): string {
  switch (reason) {
    case "unknown_hex": return "Unknown hex";
    case "capacity": return "Empire level is too low to hold more parcels";
    case "level": return "Empire level is too low for this parcel";
    case "starter_parcel": return "Your first parcel must be the starter parcel";
    case "frontier": return "This parcel is not on your frontier";
    default: return reason;
  }
}

/**
 * Acquire a parcel: validates canAcquire (403 with the reason), debits the
 * Cash price conditionally (grants/deeds cost 0), records the plotgo_land row
 * and a "land_purchase" ledger entry, and awards empire XP. Idempotent: an
 * already-owned hex returns the existing ownership as a 200 replay.
 */
export async function acquireLand(playerId: string, hexId: string): Promise<AcquireOutcome> {
  const player = await prisma.player.findUnique({ where: { id: playerId } });
  if (!player) return { status: 404, error: "no plot" };
  const attr = hexAttribute(hexId);
  if (!attr) return { status: 400, error: "unknown_hex" };
  const existing = await prisma.plotgoLand.findUnique({ where: { playerId_hexId: { playerId, hexId } } });
  if (existing) return { status: 200, replayed: true, ownership: ownershipView(existing) };
  const rows = await ownedLandRows(playerId);
  const level = clampLevel(player.empireLevel);
  // Level gate first (rare trophies also gate on hexBalance.rareRequiredLevel)
  // so an under-leveled attempt always reports the level reason, matching the
  // acquisition UI; capacity/starter/frontier come from canAcquire below.
  const schedule = priceForHex(hexId);
  const requiredLevel = Math.max(schedule?.requiredLevel ?? 1, attr.rareRequiredLevel);
  if (level < requiredLevel) return { status: 403, error: acquireReasonMessage("level") };
  const check = canAcquire(level, rows.length, rows.map((row) => row.hexId), hexId);
  if (!check.ok) return { status: 403, error: acquireReasonMessage(check.reason ?? "cannot_acquire") };
  const price = schedule;
  if (!price) return { status: 400, error: "unknown_hex" };
  const priceMinor = Math.round(price.cost * CASH_SCALE);
  const method = METHOD_KEY[price.method];
  const now = Date.now();
  let created: PlotgoLand;
  try {
    created = await prisma.$transaction(async (tx) => {
      if (priceMinor > 0) {
        const paid = await tx.player.updateMany({
          where: { id: playerId, cashMinor: { gte: priceMinor } },
          data: { cashMinor: { decrement: priceMinor } },
        });
        if (paid.count !== 1) throw new Error("insufficient_cash");
      }
      return tx.plotgoLand.create({
        data: { id: newId(), playerId, hexId, method, priceMinor, acquiredAt: now },
      });
    });
  } catch (error) {
    if (error instanceof Error && error.message === "insufficient_cash") {
      return { status: 409, error: "Not enough Cash" };
    }
    // Unique (playerId, hexId) race: the winner's row now exists.
    const winner = await prisma.plotgoLand.findUnique({ where: { playerId_hexId: { playerId, hexId } } });
    if (winner) return { status: 409, error: "Parcel already owned" };
    throw error;
  }
  if (priceMinor > 0) {
    const balance = await prisma.player.findUnique({ where: { id: playerId }, select: { cashMinor: true } });
    await recordLedger(prisma, playerId, utcDay(now), "land_purchase", -priceMinor, num(balance?.cashMinor), { hexId, parcelId: attr.parcelId, priceCash: price.cost });
  }
  // v1.0: land acquisition XP (75 × land-grade multiplier), once per parcel.
  await awardLand(playerId, attr.parcelId);
  return { status: 200, replayed: false, ownership: ownershipView(created) };
}

// --- Placement fit preview ----------------------------------------------------

/**
 * Category sensitivity mirror of v02/affinities.json (the game package owns
 * the canonical copy; the API mirrors only the four fit sensitivities so the
 * preview can decompose the multiplier into per-factor deltas).
 */
const CATEGORY_FIT_SENSITIVITY: Record<string, { acquisition: number; premium: number; efficiency: number; risk: number }> = {
  "Retail Finance": { acquisition: 0.55, premium: 0.1, efficiency: 0.2, risk: 0.15 },
  "Banking & Savings": { acquisition: 0.3, premium: 0.25, efficiency: 0.2, risk: 0.25 },
  "Brokerage": { acquisition: 0.4, premium: 0.25, efficiency: 0.25, risk: 0.1 },
  "Trading & Markets": { acquisition: 0.25, premium: 0.3, efficiency: 0.35, risk: 0.1 },
  "Lending & Credit": { acquisition: 0.5, premium: 0.1, efficiency: 0.15, risk: 0.25 },
  "Insurance & Risk": { acquisition: 0.3, premium: 0.15, efficiency: 0.15, risk: 0.4 },
  "Funds & Asset Management": { acquisition: 0.1, premium: 0.45, efficiency: 0.3, risk: 0.15 },
  "Wealth & Advisory": { acquisition: 0.15, premium: 0.5, efficiency: 0.15, risk: 0.2 },
  "Treasury, Vault & Custody": { acquisition: 0, premium: 0.1, efficiency: 0.25, risk: 0.65 },
  "Research, Data & Fintech": { acquisition: 0.2, premium: 0.1, efficiency: 0.55, risk: 0.15 },
  "Institutional Finance": { acquisition: 0.1, premium: 0.5, efficiency: 0.25, risk: 0.15 },
};

export type FitBreakdownEntry = {
  factor: "acquisition" | "premium" | "efficiency" | "risk";
  sensitivity: number;
  mod: number;
  delta: number;
};

export type LandFit = {
  hexId: string;
  type: string;
  category: string;
  multiplier: number;
  grade: string | null;
  clamped: boolean;
  breakdown: FitBreakdownEntry[];
};

/** Placement-fit preview for the UI: multiplier plus per-factor decomposition. */
export function landFit(hexId: string, type: string): LandFit | null {
  const spec = CARDS[resolveType(type)];
  const attr = hexAttribute(hexId);
  if (!spec || !attr) return null;
  const sensitivity = CATEGORY_FIT_SENSITIVITY[spec.category];
  if (!sensitivity) {
    return { hexId, type: spec.id, category: spec.category, multiplier: 1, grade: attr.grade, clamped: false, breakdown: [] };
  }
  const factors = [
    { factor: "acquisition" as const, sensitivity: sensitivity.acquisition, mod: attr.acquisitionMod },
    { factor: "premium" as const, sensitivity: sensitivity.premium, mod: attr.premiumMixMod },
    { factor: "efficiency" as const, sensitivity: sensitivity.efficiency, mod: attr.efficiencyMod },
    { factor: "risk" as const, sensitivity: sensitivity.risk, mod: attr.riskMod },
  ];
  const breakdown: FitBreakdownEntry[] = factors.map((entry) => ({
    factor: entry.factor,
    sensitivity: entry.sensitivity,
    mod: entry.mod,
    delta: Math.round(entry.sensitivity * (entry.mod - 1) * 100_000) / 100_000,
  }));
  const multiplier = placementFitMultiplier(spec.category, hexId);
  const raw = 1 + breakdown.reduce((sum, entry) => sum + entry.delta, 0);
  const clamped = raw < PLACEMENT_FIT_MIN || raw > PLACEMENT_FIT_MAX;
  return { hexId, type: spec.id, category: spec.category, multiplier, grade: attr.grade, clamped, breakdown };
}

/** XP progress row for the snapshot hex board. */
export function empireProgress(empireLevel: number, empireXp: number) {
  const level = clampLevel(empireLevel);
  return {
    empireLevel: level,
    empireXp,
    xpForNextLevel: level >= MAX_EMPIRE_LEVEL ? 0 : Math.max(0, XP_FOR_LEVEL[level]! - empireXp),
  };
}
