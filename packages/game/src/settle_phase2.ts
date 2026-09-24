import { CARDS, type Lineage } from "./buildings.ts";
import { CASH_SCALE } from "./constants.ts";
import { type DistrictEvent, type SessionVerb } from "./events.ts";
import type { PlacedCard } from "./index.ts";
import { resolvePlacement, type PlacementResolution } from "./placement.ts";
import type { ModuleEffectVector } from "./modules.ts";
import type { ArchetypeEffects } from "./archetypes.ts";

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

function addSegments(target: CustomerSegments, source: CustomerSegments) {
  target.generalConsumers += source.generalConsumers;
  target.retailInvestors += source.retailInvestors;
  target.activeTraders += source.activeTraders;
  target.smallBusinesses += source.smallBusinesses;
  target.corporateClients += source.corporateClients;
  target.highNetWorth += source.highNetWorth;
  target.institutional += source.institutional;
}

function rectanglesTouch(a: PlacedCard, b: PlacedCard): boolean {
  const [aw, ah] = specOf(a.type).footprint;
  const [bw, bh] = specOf(b.type).footprint;
  const horizontal = (a.x + aw === b.x || b.x + bw === a.x) && a.y < b.y + bh && a.y + ah > b.y;
  const vertical = (a.y + ah === b.y || b.y + bh === a.y) && a.x < b.x + bw && a.x + aw > b.x;
  return horizontal || vertical;
}

type SynergyRule = {
  label: string;
  left: { lineage: Lineage; ids?: string[] };
  right: { lineage: Lineage; ids?: string[] };
  bonusBps: number;
  riskReliefBps: number;
};

const SYNERGIES: readonly SynergyRule[] = [
  { label: "Exchange + Market Maker", left: { lineage: "exchange" }, right: { lineage: "trade", ids: ["market_maker"] }, bonusBps: 1_400, riskReliefBps: 180 },
  { label: "Brokerage + Exchange", left: { lineage: "broker" }, right: { lineage: "exchange" }, bonusBps: 900, riskReliefBps: 80 },
  { label: "Fund + Research Center", left: { lineage: "fund" }, right: { lineage: "research", ids: ["research_center"] }, bonusBps: 800, riskReliefBps: 100 },
  { label: "Bank + Insurance", left: { lineage: "bank" }, right: { lineage: "insure" }, bonusBps: 700, riskReliefBps: 300 },
  { label: "Vault + Treasury", left: { lineage: "vault" }, right: { lineage: "treasury" }, bonusBps: 700, riskReliefBps: 220 },
  { label: "Data Center + Exchange", left: { lineage: "research", ids: ["data_center"] }, right: { lineage: "exchange" }, bonusBps: 600, riskReliefBps: 80 },
  { label: "Wealth + Private Bank", left: { lineage: "wealth", ids: ["wealth_office"] }, right: { lineage: "wealth", ids: ["private_bank"] }, bonusBps: 900, riskReliefBps: 120 },
  { label: "Investment Bank + Treasury", left: { lineage: "ib" }, right: { lineage: "treasury", ids: ["corp_treasury"] }, bonusBps: 800, riskReliefBps: 120 },
];

function matches(card: PlacedCard, side: SynergyRule["left"]): boolean {
  const spec = specOf(card.type);
  return spec.lineage === side.lineage && (!side.ids || side.ids.includes(card.type));
}

function hasSynergy(cards: PlacedCard[], rule: SynergyRule): boolean {
  return cards.some((a, i) => cards.slice(i + 1).some((b) => rectanglesTouch(a, b)
    && ((matches(a, rule.left) && matches(b, rule.right)) || (matches(a, rule.right) && matches(b, rule.left)))));
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

function segmentMix(lineage: Lineage): CustomerSegments {
  const segments = emptySegments();
  if (lineage === "bank" || lineage === "lend" || lineage === "insure") {
    segments.generalConsumers = 55; segments.smallBusinesses = 25; segments.retailInvestors = 10; segments.highNetWorth = 10;
  } else if (lineage === "trade" || lineage === "exchange" || lineage === "broker") {
    segments.retailInvestors = 40; segments.activeTraders = 35; segments.institutional = 25;
  } else if (lineage === "fund" || lineage === "wealth") {
    segments.retailInvestors = 25; segments.highNetWorth = 50; segments.institutional = 25;
  } else if (lineage === "ib" || lineage === "treasury" || lineage === "vault") {
    segments.corporateClients = 50; segments.institutional = 30; segments.highNetWorth = 20;
  } else {
    segments.generalConsumers = 20; segments.retailInvestors = 30; segments.activeTraders = 25; segments.corporateClients = 15; segments.institutional = 10;
  }
  return segments;
}

function scaledSegments(mix: CustomerSegments, total: number): CustomerSegments {
  const result = emptySegments();
  const entries = Object.entries(mix) as [keyof CustomerSegments, number][];
  let assigned = 0;
  entries.forEach(([key], index) => {
    const amount = index === entries.length - 1 ? total - assigned : Math.floor(total * (mix[key] / 100));
    result[key] = Math.max(0, amount);
    assigned += result[key];
  });
  return result;
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

function eventLineageBps(event: DistrictEvent, lineage: Lineage): number {
  if (event.id === "market_rally" && (lineage === "trade" || lineage === "exchange" || lineage === "broker")) return 12_000;
  if (event.id === "tech_boom" && (lineage === "research" || lineage === "digital")) return 12_000;
  if (event.id === "credit_squeeze" && (lineage === "bank" || lineage === "lend")) return 8_000;
  if (event.id === "bank_run" && lineage === "bank") return 7_500;
  if (event.id === "research_week" && (lineage === "research" || lineage === "fund")) return 11_500;
  return 10_000;
}

function revenueFor(card: PlacedCard, customers: CustomerSegments, event: DistrictEvent, verb: SessionVerb, conditionBps: number, moduleEffect?: ModuleEffectVector) {
  const lineage = specOf(card.type).lineage;
  const c = customers;
  let amountMinor = 0;
  let transactions = 0;
  let volumeMinor = 0;
  if (lineage === "bank") {
    amountMinor = c.generalConsumers * 3 + c.smallBusinesses * 8 + c.highNetWorth * 7 + c.institutional * 9;
    transactions = Math.round((c.generalConsumers + c.smallBusinesses + c.highNetWorth) * 0.45);
    volumeMinor = (c.generalConsumers + c.smallBusinesses * 4 + c.highNetWorth * 8) * 120;
  } else if (lineage === "lend") {
    amountMinor = c.generalConsumers * 4 + c.smallBusinesses * 10 + c.corporateClients * 14;
    transactions = Math.round((c.generalConsumers + c.smallBusinesses + c.corporateClients) * 0.35);
    volumeMinor = (c.generalConsumers * 2 + c.smallBusinesses * 8 + c.corporateClients * 15) * 100;
  } else if (lineage === "trade" || lineage === "exchange") {
    amountMinor = c.retailInvestors * 3 + c.activeTraders * 6 + c.institutional * 8;
    transactions = (c.retailInvestors * 2) + (c.activeTraders * 5) + (c.institutional * 4);
    volumeMinor = transactions * 180;
  } else if (lineage === "broker") {
    amountMinor = c.retailInvestors * 4 + c.activeTraders * 7 + c.institutional * 6;
    transactions = (c.retailInvestors * 2) + (c.activeTraders * 4) + (c.institutional * 3);
    volumeMinor = transactions * 150;
  } else if (lineage === "fund" || lineage === "wealth") {
    amountMinor = c.retailInvestors * 4 + c.highNetWorth * 10 + c.institutional * 9;
    transactions = Math.max(1, Math.round((c.retailInvestors + c.highNetWorth + c.institutional) * 0.2));
    volumeMinor = (c.retailInvestors * 4 + c.highNetWorth * 12 + c.institutional * 15) * 100;
  } else if (lineage === "insure") {
    amountMinor = c.generalConsumers * 3 + c.smallBusinesses * 6 + c.corporateClients * 8 + c.highNetWorth * 5;
    transactions = Math.round((c.generalConsumers + c.smallBusinesses + c.corporateClients) * 0.25);
    volumeMinor = (c.generalConsumers + c.smallBusinesses * 3 + c.corporateClients * 6) * 90;
  } else if (lineage === "ib") {
    amountMinor = c.corporateClients * 12 + c.institutional * 14 + c.highNetWorth * 6;
    transactions = Math.max(1, Math.round((c.corporateClients + c.institutional) * 0.12));
    volumeMinor = (c.corporateClients * 20 + c.institutional * 25) * 100;
  } else if (lineage === "vault" || lineage === "treasury") {
    amountMinor = c.corporateClients * 5 + c.institutional * 5 + c.highNetWorth * 3;
    transactions = Math.max(1, Math.round((c.corporateClients + c.institutional + c.highNetWorth) * 0.1));
    volumeMinor = (c.corporateClients * 10 + c.institutional * 14) * 100;
  } else {
    amountMinor = (c.generalConsumers + c.retailInvestors + c.activeTraders + c.corporateClients) * 2;
    transactions = Math.max(1, Math.round((c.generalConsumers + c.retailInvestors + c.activeTraders) * 0.35));
    volumeMinor = transactions * 80;
  }
  const multiplier = event.activityBps * eventLineageBps(event, lineage) * (10_000 + (event.revenueBps ?? 0)) * verbBps(verb, [card]) * conditionBps;
  const activityBps = Math.max(0, 10_000 + (moduleEffect?.activityEfficiencyBps ?? 0));
  return {
    model: revenueModel(lineage),
    amountMinor: Math.round(amountMinor * stageMul(card.stage) * multiplier / 10_000 / 10_000 / 10_000 / 10_000 / 10_000 * activityBps / 10_000),
    transactions: Math.round(transactions * event.activityBps / 10_000 * activityBps / 10_000),
    volumeMinor: Math.round(volumeMinor * event.activityBps / 10_000 * activityBps / 10_000),
  };
}

export function settleDistrict(cards: PlacedCard[], event: DistrictEvent, verb: SessionVerb, state: DistrictState, seed: number, moduleEffects: Record<string, ModuleEffectVector> = {}, archetypeEffects: Partial<ArchetypeEffects> = {}): SettlementResult {
  const placement = resolvePlacement(cards);
  const activityEffectBps = placement.effects.activityBps + (archetypeEffects.activityBps ?? 0);
  const operatingEffectBps = placement.effects.operatingBps + (archetypeEffects.operatingBps ?? 0);
  const capacityEffectBps = placement.effects.capacityBps;
  const customerEffectBps = placement.effects.customerBps;
  const riskReliefEffectBps = placement.effects.riskReliefBps + (archetypeEffects.riskReliefBps ?? 0);
  const capacityBase = cards.reduce((sum, card) => {
    const effect = moduleEffects[card.id];
    return sum + Math.round(specOf(card.type).customersBase * stageMul(card.stage) * (10_000 + (effect?.capacityBps ?? 0)) / 10_000);
  }, 0);
  const moduleWeight = cards.reduce((sum, card) => sum + Math.max(1, specOf(card.type).customersBase), 0);
  const averageModuleEffect = (key: keyof Pick<ModuleEffectVector, "customerAcquisitionBps" | "retentionBps" | "eventResilienceBps">) => moduleWeight ? cards.reduce((sum, card) => sum + (moduleEffects[card.id]?.[key] ?? 0) * Math.max(1, specOf(card.type).customersBase), 0) / moduleWeight : 0;
  const acquisitionBps = Math.round(averageModuleEffect("customerAcquisitionBps") + averageModuleEffect("retentionBps"));
  const resilienceBps = Math.min(2_000, Math.max(0, Math.round(averageModuleEffect("eventResilienceBps"))));
  const capacity = Math.max(0, Math.round(capacityBase * (10_000 + capacityEffectBps) / 10_000));
  const demand = Math.round(capacity * (0.72 + state.reputationBps / 40_000) * event.populationBps / 10_000 * (10_000 + customerEffectBps + acquisitionBps) / 10_000);
  const population = Math.min(capacity, Math.max(0, demand));
  const overflowBps = capacity === 0 ? 0 : Math.max(0, Math.round((demand - capacity) * 10_000 / capacity));
  const servicePoints = cards.reduce((sum, card) => sum + (moduleEffects[card.id]?.serviceQualityPoints ?? 0), 0);
  const satisfactionBps = capacity === 0 ? 5_000 : clamp(8_400 + Math.round(state.reputationBps / 12) + servicePoints * 100 - Math.round(overflowBps * 0.35), 0, 10_000);
  const segments = emptySegments();
  const revenue: RevenueBreakdown[] = [];
  let baseRevenue = 0;
  let transactions = 0;
  let volumeMinor = 0;
  for (const card of cards) {
    const moduleEffect = moduleEffects[card.id];
    const cardCapacity = Math.round(specOf(card.type).customersBase * stageMul(card.stage) * (10_000 + (moduleEffect?.capacityBps ?? 0)) / 10_000);
    const cardCustomers = capacity === 0 ? 0 : Math.round(cardCapacity * population / capacity);
    const cardSegments = scaledSegments(segmentMix(specOf(card.type).lineage), cardCustomers);
    addSegments(segments, cardSegments);
    const result = revenueFor(card, cardSegments, event, verb, state.conditionBps, moduleEffect);
    baseRevenue += result.amountMinor;
    transactions += result.transactions;
    volumeMinor += result.volumeMinor;
    revenue.push({ buildingId: card.id, buildingName: specOf(card.type).name, model: result.model, amountMinor: result.amountMinor });
  }
  const synergyBps = Math.max(-2_500, Math.min(2_500, operatingEffectBps));
  const synergyCount = placement.links.length;
  const synergyMinor = Math.round(baseRevenue * synergyBps / 10_000);
  const activityMultiplierBps = Math.max(0, 10_000 + activityEffectBps);
  const activityMinor = Math.round((baseRevenue + synergyMinor) * seedNoiseBps(seed) / 10_000 * activityMultiplierBps / 10_000);
  const campaignCost = verb === "campaign" && cards.length > 0 ? -150 * CASH_SCALE : 0;
  const verbMinor = Math.round((baseRevenue + synergyMinor) * (verbBps(verb, cards) - 10_000) / 10_000) + campaignCost;
  const riskRelief = riskReliefEffectBps;
  const moduleRiskPoints = cards.reduce((sum, card) => Object.values(moduleEffects[card.id]?.riskDeltas ?? {}).reduce((inner, value) => inner + value, 0), 0);
  const rawRiskBps = 700 + Math.round(event.riskDeltaBps * (10_000 - resilienceBps) / 10_000) + cards.reduce((sum, card) => {
    const lineage = specOf(card.type).lineage;
    const risk = lineage === "bank" || lineage === "lend" ? 550 : lineage === "trade" || lineage === "exchange" ? 400 : lineage === "broker" ? 250 : 100;
    return sum + risk * card.stage;
  }, 0) + Math.max(0, 7_000 - state.reputationBps) + placement.effects.riskIncreaseBps - riskRelief + Math.round(moduleRiskPoints * 100);
  const riskBps = clamp(Math.round(rawRiskBps * (10_000 + (event.riskBps ?? 0)) / 10_000), 0, 9_500);
  const highRiskEvent = event.id === "bank_run" || event.id === "credit_squeeze" || event.id === "storm_warning";
  const lossMinor = highRiskEvent && riskBps >= 2_600 ? -Math.min(Math.round(Math.max(0, activityMinor) * (riskBps - 2_000) / 20_000), Math.max(0, state.cashMinor)) : 0;
  // Humble buildings are the Phase 1 teaching economy; the first board must
  // show a real customer-driven Cash delta before upkeep becomes a sink.
  const upkeepMinor = cards.some((card) => specOf(card.type).era !== "humble") ? -cards.reduce((sum, card) => {
    const effect = moduleEffects[card.id];
    const base = Math.max(1, Math.round(specOf(card.type).placeCostMinor * card.stage / 100));
    return sum + Math.max(1, Math.round(base * (10_000 - (effect?.operatingCostReductionBps ?? 0)) / 10_000));
  }, 0) : 0;
  const lines = ([
    { reason: "operating", label: "Building revenue", amountMinor: activityMinor },
    { reason: "adjacency", label: synergyCount ? `Synergies ×${synergyCount}` : "Synergies", amountMinor: synergyMinor },
    { reason: "verb", label: verb === "campaign" ? "Campaign spend and lift" : "Business action", amountMinor: verbMinor },
    { reason: "loss", label: "Risk loss", amountMinor: lossMinor },
    { reason: "upkeep", label: "Upkeep", amountMinor: upkeepMinor },
  ] as LedgerLine[]).filter((line) => line.amountMinor !== 0);
  const requestedDelta = lines.reduce((sum, line) => sum + line.amountMinor, 0);
  const cashAfter = Math.max(0, state.cashMinor + requestedDelta);
  const cashDeltaMinor = cashAfter - state.cashMinor;
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
