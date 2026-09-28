import { CARDS, type Lineage } from "./buildings.ts";
import { CASH_SCALE } from "./constants.ts";
import { type DistrictEvent, type SessionVerb } from "./economic_events.ts";
import type { PlacedCard } from "./index.ts";
import { resolvePlacement, type PlacementResolution } from "./placement_hex.ts";
import type { ModuleEffectVector } from "./modules.ts";
import type { ArchetypeEffects } from "./archetypes.ts";
import { hexAttribute, placementFitMultiplier } from "./land.ts";
import segmentsV02 from "./v02/segments.json";

function stageMul(stage: 1 | 2 | 3): number {
  return stage === 1 ? 1 : stage === 2 ? 1.35 : 1.8;
}

export type LedgerLine = {
  reason: "operating" | "adjacency" | "verb" | "loss" | "upkeep";
  label: string;
  amountMinor: number;
};

export type CustomerSegments = {
  generalConsumers: number;
  retailInvestors: number;
  activeTraders: number;
  smallBusinesses: number;
  corporateClients: number;
  highNetWorth: number;
  institutional: number;
};

export const CUSTOMER_SEGMENT_KEYS: readonly (keyof CustomerSegments)[] = [
  "generalConsumers",
  "retailInvestors",
  "activeTraders",
  "smallBusinesses",
  "corporateClients",
  "highNetWorth",
  "institutional",
];

export type RevenueModel = "spread" | "fee_volume" | "commission" | "aum_fee" | "premium" | "service" | "treasury" | "deal";

export type RevenueBreakdown = {
  buildingId: string;
  buildingName: string;
  model: RevenueModel;
  amountMinor: number;
};

export type DistrictState = {
  cashMinor: number;
  reputationBps: number;
  conditionBps: number;
};

export type SettlementResult = {
  lines: LedgerLine[];
  cashDeltaMinor: number;
  earnedDeltaMinor: number;
  riskBps: number;
  reputationBps: number;
  conditionBps: number;
  population: number;
  capacity: number;
  satisfactionBps: number;
  segments: CustomerSegments;
  transactions: number;
  volumeMinor: number;
  synergyCount: number;
  revenue: RevenueBreakdown[];
  placement: PlacementResolution;
};

function specOf(type: string) {
  const spec = CARDS[type];
  if (!spec) throw new Error(`Unknown building ${type}`);
  return spec;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, Math.round(value)));
}

function emptySegments(): CustomerSegments {
  return { generalConsumers: 0, retailInvestors: 0, activeTraders: 0, smallBusinesses: 0, corporateClients: 0, highNetWorth: 0, institutional: 0 };
}

function seedNoiseBps(seed: number): number {
  return 8_500 + (seed % 3_001);
}

function verbBps(verb: SessionVerb, cards: PlacedCard[]): number {
  const has = (lineage: Lineage) => cards.some((c) => specOf(c.type).lineage === lineage);
  if (verb === "price_loans") return has("bank") || has("lend") ? 12_000 : 9_000;
  if (verb === "open_floor") return has("trade") || has("exchange") || has("broker") ? 12_500 : 9_000;
  if (verb === "rebalance") return has("fund") || has("research") || has("vault") ? 11_000 : 9_500;
  if (verb === "campaign") return 12_500;
  return 10_000;
}

function revenueModel(lineage: Lineage): RevenueModel {
  if (lineage === "bank" || lineage === "lend") return "spread";
  if (lineage === "trade" || lineage === "exchange") return "fee_volume";
  if (lineage === "broker") return "commission";
  if (lineage === "fund" || lineage === "wealth") return "aum_fee";
  if (lineage === "insure") return "premium";
  if (lineage === "vault" || lineage === "treasury") return "treasury";
  if (lineage === "ib") return "deal";
  return "service";
}

// ---------------------------------------------------------------------------
// v0.2 customer segments (Segments sheet): 5 canonical segments. The mix is
// derived per hex from prestige/capital; revenue scales by the resulting
// segment value multiplier. The persisted 7-key CustomerSegments shape is kept
// for API/web compatibility with this documented mapping (total conserved):
//   Mass Retail    → generalConsumers
//   SMB            → smallBusinesses
//   Affluent       → retailInvestors
//   HNW            → 60% highNetWorth, 40% activeTraders
//   Institutional  → 50% corporateClients, 50% institutional
// ---------------------------------------------------------------------------

const V02_SEGMENTS = segmentsV02 as { name: string; baseMix: number; valueFactor: number; prestigeSens: number; capitalSens: number }[];

export const V02_SEGMENT_NAMES = V02_SEGMENTS.map((def) => def.name);

export type SegmentMix = Record<string, number>;

const BASE_SEGMENT_MIX: SegmentMix = Object.fromEntries(V02_SEGMENTS.map((def) => [def.name, def.baseMix]));

/**
 * mix_i ∝ baseMix_i × (1 + prestigeSens_i×(prestige−50)/50 + capitalSens_i×(capital−50)/50),
 * normalized; missing hex attributes fall back to neutral 50/50 (base mix).
 */
export function segmentMixForHex(hexId: string): SegmentMix {
  const attr = hexAttribute(hexId);
  const prestige = attr?.prestige ?? 50;
  const capital = attr?.capital ?? 50;
  const weights = V02_SEGMENTS.map((def) =>
    Math.max(0, def.baseMix * (1 + def.prestigeSens * (prestige - 50) / 50 + def.capitalSens * (capital - 50) / 50)),
  );
  const total = weights.reduce((sum, weight) => sum + weight, 0);
  const mix: SegmentMix = {};
  V02_SEGMENTS.forEach((def, index) => {
    mix[def.name] = total > 0 ? weights[index]! / total : def.baseMix;
  });
  return mix;
}

/** Σ mix_i×value_i / Σ baseMix_i×value_i — 1.0 on a neutral hex. */
export function segmentValueMultiplier(hexId: string): number {
  const mix = segmentMixForHex(hexId);
  let weighted = 0;
  let base = 0;
  for (const def of V02_SEGMENTS) {
    weighted += (mix[def.name] ?? 0) * def.valueFactor;
    base += def.baseMix * def.valueFactor;
  }
  return base > 0 ? weighted / base : 1;
}

// ---------------------------------------------------------------------------
// v0.2-derived display metrics. population/capacity/transactions/volume are
// derived from net Cash/day so downstream API/web consumers keep working until
// Phase 2/3 redesigns them (v0.2 has no independent customer simulation).
// ---------------------------------------------------------------------------

/** 1 customer per $0.5 of net Cash/day → population = round(net/day × 2). */
export const POPULATION_PER_CASH_DAY = 0.5;
/** Base occupancy/utilization (v02/assumptions.json) → capacity = round(population / 0.9). */
export const BASE_OCCUPANCY = 0.9;
export const TRANSACTIONS_PER_CASH_DAY = 0.8;
export const VOLUME_PER_CASH_DAY = 1.2;

export function normalizeCustomerSegments(value: Partial<CustomerSegments> | null | undefined): CustomerSegments {
  const segments = emptySegments();
  for (const key of CUSTOMER_SEGMENT_KEYS) segments[key] = Math.max(0, Number(value?.[key]) || 0);
  return segments;
}

/** Persisted-state-safe rounding for JSON persistence (counts stay fractional internally). */
export function roundCustomerSegments(value: CustomerSegments): CustomerSegments {
  const segments = emptySegments();
  for (const key of CUSTOMER_SEGMENT_KEYS) segments[key] = Math.round(value[key] * 10_000) / 10_000;
  return segments;
}

/** Map the v0.2 5-segment mix share of a population onto the persisted 7 keys. */
function segmentsFromMix(mix: SegmentMix, population: number): CustomerSegments {
  const mass = population * (mix["Mass Retail"] ?? 0);
  const smb = population * (mix.SMB ?? 0);
  const affluent = population * (mix.Affluent ?? 0);
  const hnw = population * (mix.HNW ?? 0);
  const institutional = population * (mix.Institutional ?? 0);
  return {
    generalConsumers: mass,
    smallBusinesses: smb,
    retailInvestors: affluent,
    highNetWorth: hnw * 0.6,
    activeTraders: hnw * 0.4,
    corporateClients: institutional * 0.5,
    institutional: institutional * 0.5,
  };
}

/**
 * Financial_Empire_Balancing_Model_v0.2 settlement.
 *
 * Per building: net = baseNetPerDay × stageMul × placementFitMultiplier ×
 * segmentValueMultiplier × event revenue bps × module activity efficiency ×
 * condition, then the retained engine multipliers apply on top as bps:
 * placement link/district operatingBps, archetype operatingBps/activityBps,
 * the ±15% seed noise band, and the business-verb bps. v0.2 buildings carry no
 * separate operating cost (the base is net) and there is no upkeep line.
 * The risk/loss path is carried over unchanged from the v0.1 engine.
 *
 * `customerState` / `acquisitionBoost` are legacy v0.1 carry-over parameters:
 * v0.2 derives segments from the board, so they are accepted for signature
 * compatibility and ignored (Phase 2 removes them from callers).
 */
export function settleDistrict(cards: PlacedCard[], event: DistrictEvent, verb: SessionVerb, state: DistrictState, seed: number, moduleEffects: Record<string, ModuleEffectVector> = {}, archetypeEffects: Partial<ArchetypeEffects> = {}, _customerState?: CustomerSegments, _acquisitionBoost = false): SettlementResult {
  const placement = resolvePlacement(cards);
  const activityEffectBps = placement.effects.activityBps + (archetypeEffects.activityBps ?? 0);
  const operatingEffectBps = placement.effects.operatingBps + (archetypeEffects.operatingBps ?? 0);
  const capacityEffectBps = placement.effects.capacityBps;
  const riskReliefEffectBps = placement.effects.riskReliefBps + (archetypeEffects.riskReliefBps ?? 0);
  const eventRevenueMod = Math.max(0, (10_000 + (event.revenueBps ?? 0)) / 10_000);
  const conditionMod = Math.max(0, state.conditionBps / 10_000);

  // --- Per-building v0.2 net revenue ---
  const revenue: RevenueBreakdown[] = [];
  const netCashByCard = new Map<string, { netCashDay: number; mix: SegmentMix }>();
  let baseNetMinor = 0;
  for (const card of cards) {
    const spec = specOf(card.type);
    const fit = placementFitMultiplier(spec.category, card.hexId);
    const segmentMult = segmentValueMultiplier(card.hexId);
    const moduleEff = Math.max(0, (10_000 + (moduleEffects[card.id]?.activityEfficiencyBps ?? 0)) / 10_000);
    const netCashDay = spec.baseNetPerDay * stageMul(card.stage) * fit * segmentMult * eventRevenueMod * moduleEff * conditionMod;
    const netMinor = Math.round(netCashDay * CASH_SCALE);
    baseNetMinor += netMinor;
    netCashByCard.set(card.id, { netCashDay, mix: segmentMixForHex(card.hexId) });
    revenue.push({ buildingId: card.id, buildingName: spec.name, model: revenueModel(spec.lineage), amountMinor: netMinor });
  }

  // --- Ledger (load-bearing semantics preserved from the v0.1 engine) ---
  const resilienceBps = Math.min(2_000, Math.max(0, Math.round(cards.length
    ? cards.reduce((sum, card) => sum + (moduleEffects[card.id]?.eventResilienceBps ?? 0), 0) / cards.length
    : 0)));
  const synergyBps = Math.max(-2_500, Math.min(2_500, operatingEffectBps));
  const synergyCount = placement.links.length;
  const synergyMinor = Math.round(baseNetMinor * synergyBps / 10_000);
  const noiseMod = seedNoiseBps(seed) / 10_000;
  const activityMultiplierBps = Math.max(0, 10_000 + activityEffectBps);
  const grossActivityMinor = Math.round((baseNetMinor + synergyMinor) * noiseMod * activityMultiplierBps / 10_000);
  // v0.2: the base is already net (no opCost/upkeep line).
  const operatingMinor = grossActivityMinor;
  const campaignCost = verb === "campaign" && cards.length > 0 ? -150 * CASH_SCALE : 0;
  const verbMinor = Math.round((baseNetMinor + synergyMinor) * (verbBps(verb, cards) - 10_000) / 10_000) + campaignCost;
  const moduleRiskPoints = cards.reduce((sum, card) => Object.values(moduleEffects[card.id]?.riskDeltas ?? {}).reduce((inner, value) => inner + value, 0), 0);
  const rawRiskBps = 700 + Math.round(event.riskDeltaBps * (10_000 - resilienceBps) / 10_000) + cards.reduce((sum, card) => {
    const lineage = specOf(card.type).lineage;
    const risk = lineage === "bank" || lineage === "lend" ? 550 : lineage === "trade" || lineage === "exchange" ? 400 : lineage === "broker" ? 250 : 100;
    return sum + risk * card.stage;
  }, 0) + Math.max(0, 7_000 - state.reputationBps) + placement.effects.riskIncreaseBps - riskReliefEffectBps + Math.round(moduleRiskPoints * 100);
  const riskBps = clamp(Math.round(rawRiskBps * (10_000 + (event.riskBps ?? 0)) / 10_000), 0, 9_500);
  const highRiskEvent = event.id === "bank_run" || event.id === "liquidity_crunch" || event.id === "market_correction";
  const lossMinor = highRiskEvent && riskBps >= 2_600 ? -Math.min(Math.round(Math.max(0, grossActivityMinor) * (riskBps - 2_000) / 20_000), Math.max(0, state.cashMinor)) : 0;
  const lines = ([
    { reason: "operating", label: "Building revenue", amountMinor: operatingMinor },
    { reason: "adjacency", label: synergyCount ? `Synergies ×${synergyCount}` : "Synergies", amountMinor: synergyMinor },
    { reason: "verb", label: verb === "campaign" ? "Campaign spend and lift" : "Business action", amountMinor: verbMinor },
    { reason: "loss", label: "Risk loss", amountMinor: lossMinor },
  ] as LedgerLine[]).filter((line) => line.amountMinor !== 0);
  const requestedDelta = lines.reduce((sum, line) => sum + line.amountMinor, 0);
  const cashAfter = Math.max(0, state.cashMinor + requestedDelta);
  const cashDeltaMinor = cashAfter - state.cashMinor;

  // --- v0.2-derived display metrics ---
  const totalNetCashDay = cards.reduce((sum, card) => sum + (netCashByCard.get(card.id)?.netCashDay ?? 0), 0);
  const population = Math.max(0, Math.round(totalNetCashDay / POPULATION_PER_CASH_DAY));
  const capacity = Math.round(population / BASE_OCCUPANCY * (10_000 + capacityEffectBps) / 10_000);
  const boardMix: SegmentMix = { ...BASE_SEGMENT_MIX };
  if (totalNetCashDay > 0) {
    for (const name of Object.keys(boardMix)) boardMix[name] = 0;
    for (const card of cards) {
      const entry = netCashByCard.get(card.id);
      if (!entry) continue;
      const share = entry.netCashDay / totalNetCashDay;
      for (const name of Object.keys(boardMix)) boardMix[name]! += share * (entry.mix[name] ?? 0);
    }
  }
  const segments = roundCustomerSegments(segmentsFromMix(boardMix, population));
  const transactions = Math.max(0, Math.round(totalNetCashDay * TRANSACTIONS_PER_CASH_DAY));
  const volumeMinor = Math.max(0, Math.round(totalNetCashDay * VOLUME_PER_CASH_DAY * CASH_SCALE));
  const servicePoints = cards.reduce((sum, card) => sum + (moduleEffects[card.id]?.serviceQualityPoints ?? 0), 0);
  const satisfactionBps = cards.length === 0
    ? 5_000
    : clamp(8_000 + Math.round(state.reputationBps / 25) + servicePoints * 100, 0, 10_000);
  const reputationDelta = Math.round((satisfactionBps - 6_500) / 20) + synergyCount * 12 + Math.round(placement.effects.reputationBps / 10) + Math.round((event.reputationDelta ?? 0) * 100) - (lossMinor < 0 ? 80 : 0);
  return {
    lines,
    cashDeltaMinor,
    earnedDeltaMinor: Math.max(0, cashDeltaMinor),
    riskBps,
    reputationBps: clamp(state.reputationBps + reputationDelta, 0, 10_000),
    conditionBps: clamp(state.conditionBps - (cards.length ? 35 : 0), 0, 10_000),
    population,
    capacity,
    satisfactionBps,
    segments,
    transactions,
    volumeMinor,
    synergyCount,
    revenue,
    placement,
  };
}

// ---------------------------------------------------------------------------
// Offline catch-up (v0.2): the v0.1 12h customer dynamics are replaced by a
// simple expected-net catch-up at 0.5 efficiency, capped at 12 hours. The API
// (apps/api/src/shared/offline.ts) wires this in Phase 2.
// ---------------------------------------------------------------------------

/** Expected net Cash (minor units) per hour for a board under v0.2 rules. */
export function offlineNetPerHour(cards: PlacedCard[]): number {
  const perDay = cards.reduce((sum, card) => {
    const spec = CARDS[card.type];
    if (!spec) return sum;
    return sum + spec.baseNetPerDay * stageMul(card.stage) * placementFitMultiplier(spec.category, card.hexId) * segmentValueMultiplier(card.hexId);
  }, 0);
  return Math.round(perDay * CASH_SCALE / 24);
}

/** Offline catch-up: expected net × offline hours × 0.5 efficiency, capped at 12h. */
export function offlineCatchUpMinor(cards: PlacedCard[], offlineHours: number): number {
  const hours = Math.min(12, Math.max(0, offlineHours));
  return Math.round(offlineNetPerHour(cards) * hours * 0.5);
}
