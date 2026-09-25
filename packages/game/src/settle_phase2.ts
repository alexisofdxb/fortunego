import { CARDS, type Lineage } from "./buildings.ts";
import { CASH_SCALE } from "./constants.ts";
import { type DistrictEvent, type SessionVerb } from "./economic_events.ts";
import type { PlacedCard } from "./index.ts";
import { resolvePlacement, type PlacementResolution } from "./placement.ts";
import type { ModuleEffectVector } from "./modules.ts";
import { moduleBuildingFamily } from "./modules.ts";
import type { ArchetypeEffects } from "./archetypes.ts";
import { marketStageForEmpireLevel, type MarketStage } from "./market_phase3.ts";
import {
  CUSTOMER_SEGMENT_KEYS,
  CUSTOMER_SEGMENTS,
  NEW_PLAYER_ACQUISITION_BOOST,
  SERVICE_AFFINITY,
  STAGE_DEMAND,
  addressableDemand,
  applyMaturation,
  competitionModifier,
  emptyCustomerState,
  reputationModifier,
  serviceModifier,
  stepCustomers,
  totalCustomers,
  type BuildingCategory,
  type CustomerState,
  type CustomerStepResult,
  type MaturationContext,
} from "./customer_model.ts";

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
// Phase 2 — persistent customer dynamics (PLOT_Customer_Economic_Simulation_v0.1).
//
// The settlement no longer recomputes an instantaneous equilibrium population.
// Instead it carries per-segment customer counts (persisted by the API):
//   targets  = Σ_buildings affinity × stage-pool × capture × attraction ×
//              rep/service/synergy/marketing/competition × event segment demand
//   capacity = Σ lv1Capacity × stageMul × module capacity bps × placement
//   counts   = stepCustomers(one UTC day, 15-min sub-steps) → maturation flows
//   revenue  = grossCashPerHour × stageMul × 24 × served share × weighted
//              customer value × operational efficiency × congestion band
//              revenue efficiency × event revenue mod × module activity
//              efficiency (doc Stage Scenarios: gross/h = base × util × wValue
//              × opEff; net = gross × (1 − opCostBps)); activity pts/h = base
//              × util × weighted activity intensity (doc, no opEff).
// volumeMinor carries activity points × CASH_SCALE (the weekly "activity"
// component consumed by the performance score); transactions ≈ activity points.
// ---------------------------------------------------------------------------

export type PlannedBuilding = {
  card: PlacedCard;
  capacity: number;
  target: CustomerSegments;
  weightedValue: number;
  weightedActivity: number;
  moduleEffect?: ModuleEffectVector;
};

export type CustomerPlan = {
  stage: MarketStage;
  empireLevel: number;
  reputation: number;
  serviceQuality: number;
  /** Effective district capacity (doc capacity × placement capacity effect). */
  capacity: number;
  /** Per-segment summed acquisition targets across all buildings. */
  targets: CustomerSegments;
  /** Per-segment base acquisition rates (doc Customer Segments sheet). */
  acquisitionPerDay: CustomerSegments;
  /** Per-segment base churn rates after module retention. */
  churnPerDay: CustomerSegments;
  /** Per-segment acquisition multiplier (module customerAcquisition). */
  demandModifiers: Record<keyof CustomerSegments, number>;
  operationalEfficiency: number;
  buildings: PlannedBuilding[];
};

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

/** Lazy first-settle seed: distribute a small starting population by board affinity. */
export function bootstrapCustomerSegments(cards: PlacedCard[], total = 20): CustomerSegments {
  const weights = emptySegments();
  for (const card of cards) {
    const family = moduleBuildingFamily(card.type) as BuildingCategory;
    const affinity = SERVICE_AFFINITY[family] ?? SERVICE_AFFINITY["Multi-Service"]!;
    for (const key of CUSTOMER_SEGMENT_KEYS) weights[key] += affinity[key];
  }
  const weightTotal = totalCustomers(weights);
  const segments = emptySegments();
  if (weightTotal <= 0) {
    segments.generalConsumers = Math.max(0, Math.round(total));
    return segments;
  }
  let assigned = 0;
  const keys = [...CUSTOMER_SEGMENT_KEYS].sort((a, b) => weights[b] - weights[a]);
  keys.forEach((key, index) => {
    const amount = index === keys.length - 1 ? total - assigned : Math.floor(total * weights[key] / weightTotal);
    segments[key] = Math.max(0, amount);
    assigned += segments[key];
  });
  return segments;
}

export function computeCustomerPlan(
  cards: PlacedCard[],
  event: DistrictEvent,
  state: DistrictState,
  moduleEffects: Record<string, ModuleEffectVector> = {},
  extraAcquisitionBps = 0,
): CustomerPlan {
  const empireLevel = Math.max(1, Math.min(50, cards.reduce((sum, card) => sum + 1 + Math.max(0, card.stage - 1), 0)));
  const stage = marketStageForEmpireLevel(empireLevel);
  const profile = STAGE_DEMAND[stage];
  const reputation = Math.max(0, Math.min(100, state.reputationBps / 100));
  const moduleWeight = cards.reduce((sum, card) => sum + Math.max(1, specOf(card.type).customersBase), 0);
  const averageModuleEffect = (key: keyof Pick<ModuleEffectVector, "customerAcquisitionBps" | "retentionBps" | "serviceQualityPoints">) => moduleWeight
    ? cards.reduce((sum, card) => sum + (moduleEffects[card.id]?.[key] ?? 0) * Math.max(1, specOf(card.type).customersBase), 0) / moduleWeight
    : 0;
  const acquisitionBps = Math.round(averageModuleEffect("customerAcquisitionBps"));
  const retentionBps = Math.round(averageModuleEffect("retentionBps"));
  const serviceQuality = Math.max(0, Math.min(100, Math.round(profile.serviceQuality + averageModuleEffect("serviceQualityPoints"))));
  const repMod = reputationModifier(reputation);
  const serviceMod = serviceModifier(serviceQuality);
  const eventSegmentMod = (key: keyof CustomerSegments) => event.segmentDemand?.[key] ?? event.populationBps / 10_000;
  const familyCounts = new Map<string, number>();
  for (const card of cards) {
    const family = moduleBuildingFamily(card.type);
    familyCounts.set(family, (familyCounts.get(family) ?? 0) + 1);
  }
  const targets = emptySegments();
  const buildings: PlannedBuilding[] = [];
  for (const card of cards) {
    const spec = specOf(card.type);
    const moduleEffect = moduleEffects[card.id];
    const family = moduleBuildingFamily(spec.id) as BuildingCategory;
    const category: BuildingCategory = SERVICE_AFFINITY[family] ? family : "Multi-Service";
    const demand = addressableDemand(category, stage, empireLevel);
    const demandTotal = CUSTOMER_SEGMENT_KEYS.reduce((sum, key) => sum + demand[key], 0);
    const competition = competitionModifier(familyCounts.get(moduleBuildingFamily(spec.id)) ?? 1);
    // Doc Stage Scenarios: target = Σ affinity × pool × capture × attraction ×
    // rep × service × synergy × marketing × competition (event multiplies per segment).
    const modifier = profile.captureCoeff * spec.attractionMult * repMod * serviceMod * profile.synergyMod * profile.marketingMod * competition;
    const target = emptySegments();
    for (const key of CUSTOMER_SEGMENT_KEYS) target[key] = demand[key] * modifier * eventSegmentMod(key);
    for (const key of CUSTOMER_SEGMENT_KEYS) targets[key] += target[key];
    const capacity = Math.max(0, Math.round(spec.lv1Capacity * stageMul(card.stage) * (10_000 + (moduleEffect?.capacityBps ?? 0)) / 10_000));
    buildings.push({
      card,
      capacity,
      target,
      // Weighted customer value / activity intensity (doc Building Economics columns).
      weightedValue: demandTotal > 0 ? CUSTOMER_SEGMENT_KEYS.reduce((sum, key) => sum + demand[key] * CUSTOMER_SEGMENTS.find((def) => def.key === key)!.valueMod, 0) / demandTotal : 1,
      weightedActivity: demandTotal > 0 ? CUSTOMER_SEGMENT_KEYS.reduce((sum, key) => sum + demand[key] * CUSTOMER_SEGMENTS.find((def) => def.key === key)!.activityIntensity, 0) / demandTotal : 1,
      moduleEffect,
    });
  }
  const acquisitionPerDay = emptySegments();
  const churnPerDay = emptySegments();
  const demandModifiers = {} as Record<keyof CustomerSegments, number>;
  const retentionChurnMult = Math.max(0, 1 - retentionBps / 10_000);
  const acquisitionMult = Math.max(0, (10_000 + acquisitionBps + extraAcquisitionBps) / 10_000);
  for (const key of CUSTOMER_SEGMENT_KEYS) {
    const def = CUSTOMER_SEGMENTS.find((segment) => segment.key === key)!;
    acquisitionPerDay[key] = def.acquisitionPerDay;
    churnPerDay[key] = def.churnPerDay * retentionChurnMult;
    demandModifiers[key] = acquisitionMult;
  }
  return {
    stage,
    empireLevel,
    reputation,
    serviceQuality,
    capacity: buildings.reduce((sum, building) => sum + building.capacity, 0),
    targets,
    acquisitionPerDay,
    churnPerDay,
    demandModifiers,
    operationalEfficiency: profile.operationalEfficiency,
    buildings,
  };
}

export type CustomerAdvanceOptions = {
  /** Scales the acquisition modifier (offline catch-up: doc 0.5 efficiency). */
  acquisitionScale?: number;
  /** New-player boost: 3× acquisition (doc Model Assumptions). */
  boost?: boolean;
};

/** Advance carried segments by `dayFraction` of a UTC day through the doc dynamics. */
export function advanceCustomers(plan: CustomerPlan, segments: CustomerSegments, dayFraction: number, options: CustomerAdvanceOptions = {}): { state: CustomerSegments; step: CustomerStepResult } {
  const fraction = Math.max(0.001, Math.min(1, dayFraction));
  const scale = options.acquisitionScale ?? 1;
  const demandModifiers = {} as Record<keyof CustomerSegments, number>;
  for (const key of CUSTOMER_SEGMENT_KEYS) demandModifiers[key] = Math.max(0, plan.demandModifiers[key] * scale);
  const step = stepCustomers(normalizeCustomerSegments(segments), {
    targets: plan.targets,
    acquisitionPerDay: plan.acquisitionPerDay,
    churnPerDay: plan.churnPerDay,
    demandModifiers,
    capacity: plan.capacity > 0 ? plan.capacity : undefined,
    boostMultiplier: options.boost ? NEW_PLAYER_ACQUISITION_BOOST : 1,
    subSteps: Math.max(1, Math.round(96 * fraction)),
  });
  return { state: step.state as CustomerSegments, step };
}

function maturationContextFor(cards: PlacedCard[], event: DistrictEvent, verb: SessionVerb, plan: CustomerPlan, satisfactionBps: number): MaturationContext {
  const lineages = new Set(cards.map((card) => specOf(card.type).lineage));
  const has = (...candidates: Lineage[]) => candidates.some((lineage) => lineages.has(lineage));
  return {
    hasBrokerageOrFund: has("broker", "fund"),
    hasTradingOrExchange: has("trade", "exchange"),
    hasWealthOrFund: has("wealth", "fund"),
    hasTreasuryOrInvestmentBank: has("treasury", "ib"),
    hasAssetManagerOrExchange: has("fund", "exchange"),
    hasLendingOrBanking: has("lend", "bank"),
    satisfactionPositive: satisfactionBps > 5_000,
    reputation: plan.reputation,
    // Doc: "High Empire Value" — v0.1 cutoff: empire level reached the stage cap.
    highEmpireValue: plan.empireLevel >= STAGE_DEMAND[plan.stage].endLevel,
    // Entrepreneurship conversion: credit-boom event or an active campaign.
    entrepreneurshipActive: event.id === "credit_boom" || verb === "campaign",
  };
}

export function settleDistrict(cards: PlacedCard[], event: DistrictEvent, verb: SessionVerb, state: DistrictState, seed: number, moduleEffects: Record<string, ModuleEffectVector> = {}, archetypeEffects: Partial<ArchetypeEffects> = {}, customerState?: CustomerSegments, acquisitionBoost = false): SettlementResult {
  const placement = resolvePlacement(cards);
  const activityEffectBps = placement.effects.activityBps + (archetypeEffects.activityBps ?? 0);
  const operatingEffectBps = placement.effects.operatingBps + (archetypeEffects.operatingBps ?? 0);
  const capacityEffectBps = placement.effects.capacityBps;
  const customerEffectBps = placement.effects.customerBps;
  const riskReliefEffectBps = placement.effects.riskReliefBps + (archetypeEffects.riskReliefBps ?? 0);
  // --- Customer dynamics: carry persisted counts (bootstrap from empty when the
  // caller has no state, e.g. pure tests and preview consumers) ---
  const plan = computeCustomerPlan(cards, event, state, moduleEffects, customerEffectBps);
  const capacity = Math.max(0, Math.round(plan.capacity * (10_000 + capacityEffectBps) / 10_000));
  const effectivePlan: CustomerPlan = capacityEffectBps === 0 ? plan : { ...plan, capacity };
  const carried = customerState ? normalizeCustomerSegments(customerState) : emptySegments();
  const advanced = advanceCustomers(effectivePlan, carried, 1, { boost: acquisitionBoost });
  const servicePoints = cards.reduce((sum, card) => sum + (moduleEffects[card.id]?.serviceQualityPoints ?? 0), 0);
  const satisfactionBps = capacity === 0
    ? 5_000
    : clamp(8_000 + Math.round(state.reputationBps / 25) + servicePoints * 100 + advanced.step.band.satisfactionPenaltyBps, 0, 10_000);
  const matured = applyMaturation(advanced.state, maturationContextFor(cards, event, verb, effectivePlan, satisfactionBps));
  const segments = roundCustomerSegments(matured.state as CustomerSegments);
  const population = Math.round(totalCustomers(segments));
  const band = advanced.step.band;
  // --- Per-building revenue/activity from doc Building Economics ---
  const revenue: RevenueBreakdown[] = [];
  let baseRevenue = 0;
  let opCostTotal = 0;
  let transactions = 0;
  let volumeMinor = 0;
  const eventRevenueMod = Math.max(0, (10_000 + (event.revenueBps ?? 0)) / 10_000);
  const eventActivityMod = Math.max(0, event.activityBps / 10_000);
  const conditionMod = Math.max(0, state.conditionBps / 10_000);
  for (const building of effectivePlan.buildings) {
    const { card, moduleEffect } = building;
    const spec = specOf(card.type);
    let served = 0;
    for (const key of CUSTOMER_SEGMENT_KEYS) {
      const target = effectivePlan.targets[key];
      if (target > 0) served += segments[key] * (building.target[key] / target);
    }
    served = Math.min(served, building.capacity);
    const utilization = building.capacity > 0 ? served / building.capacity : 0;
    const moduleEff = Math.max(0, (10_000 + (moduleEffect?.activityEfficiencyBps ?? 0)) / 10_000);
    const grossMinor = Math.round(
      spec.grossCashPerHour * stageMul(card.stage) * 24 * utilization * building.weightedValue
      * effectivePlan.operationalEfficiency * band.revenueEfficiency * eventRevenueMod * moduleEff * conditionMod * CASH_SCALE,
    );
    const activityPts = spec.activityPtsPerHour * stageMul(card.stage) * 24 * utilization * building.weightedActivity * eventActivityMod * moduleEff;
    baseRevenue += grossMinor;
    opCostTotal += Math.round(grossMinor * Math.max(0, spec.opCostBps - Math.min(12_000, Math.max(-12_000, moduleEffect?.operatingCostReductionBps ?? 0))) / 10_000);
    transactions += Math.max(0, Math.round(activityPts));
    volumeMinor += Math.max(0, Math.round(activityPts * CASH_SCALE));
    revenue.push({ buildingId: card.id, buildingName: spec.name, model: revenueModel(spec.lineage), amountMinor: grossMinor });
  }
  // --- Ledger (load-bearing semantics preserved from v1) ---
  const moduleWeight = cards.reduce((sum, card) => sum + Math.max(1, specOf(card.type).customersBase), 0);
  const resilienceBps = Math.min(2_000, Math.max(0, Math.round(moduleWeight
    ? cards.reduce((sum, card) => sum + (moduleEffects[card.id]?.eventResilienceBps ?? 0) * Math.max(1, specOf(card.type).customersBase), 0) / moduleWeight
    : 0)));
  const synergyBps = Math.max(-2_500, Math.min(2_500, operatingEffectBps));
  const synergyCount = placement.links.length;
  const synergyMinor = Math.round(baseRevenue * synergyBps / 10_000);
  const noiseMod = seedNoiseBps(seed) / 10_000;
  const activityMultiplierBps = Math.max(0, 10_000 + activityEffectBps);
  const grossActivityMinor = Math.round((baseRevenue + synergyMinor) * noiseMod * activityMultiplierBps / 10_000);
  const operatingMinor = grossActivityMinor - Math.round(opCostTotal * noiseMod * activityMultiplierBps / 10_000);
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
  const highRiskEvent = event.id === "bank_run" || event.id === "liquidity_crunch" || event.id === "market_correction";
  const lossMinor = highRiskEvent && riskBps >= 2_600 ? -Math.min(Math.round(Math.max(0, grossActivityMinor) * (riskBps - 2_000) / 20_000), Math.max(0, state.cashMinor)) : 0;
  // Humble buildings are the Phase 1 teaching economy; the first board must
  // show a real customer-driven Cash delta before upkeep becomes a sink.
  const upkeepMinor = cards.some((card) => specOf(card.type).era !== "humble") ? -cards.reduce((sum, card) => {
    const effect = moduleEffects[card.id];
    const base = Math.max(1, Math.round(specOf(card.type).placeCostMinor * card.stage / 100));
    return sum + Math.max(1, Math.round(base * (10_000 - (effect?.operatingCostReductionBps ?? 0)) / 10_000));
  }, 0) : 0;
  const lines = ([
    { reason: "operating", label: "Building revenue", amountMinor: operatingMinor },
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
