// ---------------------------------------------------------------------------
// Customer & Economic Simulation model — PLOT_Customer_Economic_Simulation_v0.1
// (canonical customer/economic model, Phase 1). Pure and deterministic: no I/O,
// no clocks; callers pass `now` explicitly.
//
// Segment counts reuse the existing CustomerSegments shape (same 7 keys) so the
// API's persisted attributes.segments stays compatible.
// ---------------------------------------------------------------------------
import type { CustomerSegments } from "./settle_phase2.ts";
import type { MarketStage } from "./market_phase3.ts";

export type CustomerState = CustomerSegments;
export type CustomerStateKey = keyof CustomerState;

export const CUSTOMER_SEGMENT_KEYS: readonly CustomerStateKey[] = [
  "generalConsumers",
  "retailInvestors",
  "activeTraders",
  "smallBusinesses",
  "corporateClients",
  "highNetWorth",
  "institutional",
];

export type CustomerSegmentDef = {
  key: CustomerStateKey;
  label: string;
  /** Activity intensity (activity points per customer weight). */
  activityIntensity: number;
  /** Customer value modifier (revenue weight). */
  valueMod: number;
  /** Base acquisition rate: fraction of the gap to target acquired per day. */
  acquisitionPerDay: number;
  /** Base churn rate: fraction of current customers lost per day. */
  churnPerDay: number;
  satisfactionSensitivity: number;
  reputationSensitivity: number;
};

/** Customer Segments sheet, verbatim. */
export const CUSTOMER_SEGMENTS: readonly CustomerSegmentDef[] = [
  { key: "generalConsumers", label: "General Consumers", activityIntensity: 0.65, valueMod: 0.8, acquisitionPerDay: 0.35, churnPerDay: 0.018, satisfactionSensitivity: 1, reputationSensitivity: 1 },
  { key: "retailInvestors", label: "Retail Investors", activityIntensity: 1, valueMod: 1, acquisitionPerDay: 0.3, churnPerDay: 0.022, satisfactionSensitivity: 1.1, reputationSensitivity: 1.1 },
  { key: "activeTraders", label: "Active Traders", activityIntensity: 1.65, valueMod: 1.15, acquisitionPerDay: 0.28, churnPerDay: 0.035, satisfactionSensitivity: 1.3, reputationSensitivity: 1.15 },
  { key: "smallBusinesses", label: "Small Businesses", activityIntensity: 0.85, valueMod: 1.15, acquisitionPerDay: 0.22, churnPerDay: 0.015, satisfactionSensitivity: 0.9, reputationSensitivity: 1 },
  { key: "corporateClients", label: "Corporate Clients", activityIntensity: 1.25, valueMod: 1.45, acquisitionPerDay: 0.14, churnPerDay: 0.008, satisfactionSensitivity: 0.7, reputationSensitivity: 0.9 },
  { key: "highNetWorth", label: "HNW Customers", activityIntensity: 1.1, valueMod: 1.5, acquisitionPerDay: 0.18, churnPerDay: 0.01, satisfactionSensitivity: 0.8, reputationSensitivity: 1.1 },
  { key: "institutional", label: "Institutional Clients", activityIntensity: 1.7, valueMod: 1.7, acquisitionPerDay: 0.1, churnPerDay: 0.005, satisfactionSensitivity: 0.6, reputationSensitivity: 0.85 },
];

// ---------------------------------------------------------------------------
// Building Category → Segment affinity (Service Affinity sheet, 18 × 7).
// Row order matches CUSTOMER_SEGMENT_KEYS.
// ---------------------------------------------------------------------------
export type BuildingCategory =
  | "Cash Services" | "Trading" | "Banking" | "Brokerage" | "Research" | "Lending"
  | "FX" | "Insurance" | "Advisory" | "Treasury" | "Asset Management" | "Multi-Service"
  | "Wealth" | "Fintech" | "Data" | "Market Making" | "Private Banking" | "Exchange"
  | "Investment Banking";

export const BUILDING_CATEGORIES: readonly BuildingCategory[] = [
  "Cash Services", "Trading", "Banking", "Brokerage", "Research", "Lending",
  "FX", "Insurance", "Advisory", "Treasury", "Asset Management", "Multi-Service",
  "Wealth", "Fintech", "Data", "Market Making", "Private Banking", "Exchange",
  "Investment Banking",
];

export const SERVICE_AFFINITY: Record<BuildingCategory, Record<CustomerStateKey, number>> = {
  "Cash Services": { generalConsumers: 1, retailInvestors: 0.2, activeTraders: 0.05, smallBusinesses: 0.25, corporateClients: 0, highNetWorth: 0.1, institutional: 0 },
  Trading: { generalConsumers: 0.1, retailInvestors: 0.7, activeTraders: 1, smallBusinesses: 0.1, corporateClients: 0.1, highNetWorth: 0.4, institutional: 0.6 },
  Banking: { generalConsumers: 1, retailInvestors: 0.4, activeTraders: 0.1, smallBusinesses: 0.7, corporateClients: 0.5, highNetWorth: 0.6, institutional: 0.1 },
  Brokerage: { generalConsumers: 0.1, retailInvestors: 1, activeTraders: 0.9, smallBusinesses: 0.1, corporateClients: 0.1, highNetWorth: 0.7, institutional: 0.5 },
  Research: { generalConsumers: 0, retailInvestors: 0.7, activeTraders: 0.7, smallBusinesses: 0.1, corporateClients: 0.4, highNetWorth: 0.6, institutional: 0.8 },
  Lending: { generalConsumers: 0.8, retailInvestors: 0.2, activeTraders: 0.05, smallBusinesses: 1, corporateClients: 0.7, highNetWorth: 0.3, institutional: 0.1 },
  FX: { generalConsumers: 0.7, retailInvestors: 0.3, activeTraders: 0.5, smallBusinesses: 0.6, corporateClients: 0.5, highNetWorth: 0.4, institutional: 0.3 },
  Insurance: { generalConsumers: 1, retailInvestors: 0.2, activeTraders: 0.05, smallBusinesses: 0.9, corporateClients: 0.7, highNetWorth: 0.7, institutional: 0.2 },
  Advisory: { generalConsumers: 0.1, retailInvestors: 0.8, activeTraders: 0.2, smallBusinesses: 0.4, corporateClients: 0.5, highNetWorth: 1, institutional: 0.4 },
  Treasury: { generalConsumers: 0.1, retailInvestors: 0.1, activeTraders: 0.05, smallBusinesses: 0.5, corporateClients: 1, highNetWorth: 0.7, institutional: 0.8 },
  "Asset Management": { generalConsumers: 0.05, retailInvestors: 0.8, activeTraders: 0.2, smallBusinesses: 0.1, corporateClients: 0.3, highNetWorth: 1, institutional: 1 },
  "Multi-Service": { generalConsumers: 0.8, retailInvestors: 0.8, activeTraders: 0.5, smallBusinesses: 0.7, corporateClients: 0.6, highNetWorth: 0.7, institutional: 0.5 },
  Wealth: { generalConsumers: 0.05, retailInvestors: 0.4, activeTraders: 0.1, smallBusinesses: 0.2, corporateClients: 0.4, highNetWorth: 1, institutional: 0.7 },
  Fintech: { generalConsumers: 0.7, retailInvestors: 0.7, activeTraders: 0.7, smallBusinesses: 0.6, corporateClients: 0.4, highNetWorth: 0.4, institutional: 0.3 },
  Data: { generalConsumers: 0, retailInvestors: 0.1, activeTraders: 0.4, smallBusinesses: 0.2, corporateClients: 0.6, highNetWorth: 0.2, institutional: 1 },
  "Market Making": { generalConsumers: 0, retailInvestors: 0.3, activeTraders: 0.9, smallBusinesses: 0, corporateClients: 0.2, highNetWorth: 0.3, institutional: 1 },
  "Private Banking": { generalConsumers: 0.05, retailInvestors: 0.2, activeTraders: 0.05, smallBusinesses: 0.2, corporateClients: 0.5, highNetWorth: 1, institutional: 0.6 },
  Exchange: { generalConsumers: 0.05, retailInvestors: 0.6, activeTraders: 1, smallBusinesses: 0.1, corporateClients: 0.3, highNetWorth: 0.4, institutional: 1 },
  "Investment Banking": { generalConsumers: 0, retailInvestors: 0.05, activeTraders: 0.05, smallBusinesses: 0.3, corporateClients: 1, highNetWorth: 0.6, institutional: 1 },
};

// ---------------------------------------------------------------------------
// Stage demand + calibration (Stage Demand + Model Assumptions sheets).
// ---------------------------------------------------------------------------
export type StageDemandProfile = {
  startLevel: number;
  endLevel: number;
  /** Addressable per-segment pools at the stage's start level. */
  demand: Record<CustomerStateKey, number>;
  /** Demand growth per empire level (compounding). */
  growthPerLevel: number;
  captureCoeff: number;
  baselineReputation: number;
  serviceQuality: number;
  synergyMod: number;
  marketingMod: number;
  operationalEfficiency: number;
};

export const STAGE_DEMAND: Record<MarketStage, StageDemandProfile> = {
  humble: { startLevel: 1, endLevel: 10, demand: { generalConsumers: 1000, retailInvestors: 700, activeTraders: 400, smallBusinesses: 250, corporateClients: 40, highNetWorth: 150, institutional: 20 }, growthPerLevel: 0.06, captureCoeff: 0.04, baselineReputation: 55, serviceQuality: 58, synergyMod: 1, marketingMod: 1, operationalEfficiency: 0.96 },
  starter: { startLevel: 11, endLevel: 20, demand: { generalConsumers: 5000, retailInvestors: 3200, activeTraders: 2000, smallBusinesses: 1200, corporateClients: 250, highNetWorth: 700, institutional: 120 }, growthPerLevel: 0.07, captureCoeff: 0.06, baselineReputation: 62, serviceQuality: 64, synergyMod: 1.02, marketingMod: 1, operationalEfficiency: 1 },
  growing: { startLevel: 21, endLevel: 30, demand: { generalConsumers: 25000, retailInvestors: 16000, activeTraders: 10000, smallBusinesses: 6000, corporateClients: 1500, highNetWorth: 4000, institutional: 1000 }, growthPerLevel: 0.08, captureCoeff: 0.08, baselineReputation: 70, serviceQuality: 71, synergyMod: 1.04, marketingMod: 1.01, operationalEfficiency: 1.03 },
  established: { startLevel: 31, endLevel: 40, demand: { generalConsumers: 125000, retailInvestors: 80000, activeTraders: 50000, smallBusinesses: 30000, corporateClients: 10000, highNetWorth: 22000, institutional: 8000 }, growthPerLevel: 0.09, captureCoeff: 0.13, baselineReputation: 78, serviceQuality: 78, synergyMod: 1.06, marketingMod: 1.02, operationalEfficiency: 1.06 },
  elite: { startLevel: 41, endLevel: 45, demand: { generalConsumers: 600000, retailInvestors: 400000, activeTraders: 250000, smallBusinesses: 150000, corporateClients: 60000, highNetWorth: 120000, institutional: 50000 }, growthPerLevel: 0.1, captureCoeff: 0.08, baselineReputation: 86, serviceQuality: 85, synergyMod: 1.08, marketingMod: 1.03, operationalEfficiency: 1.1 },
  tycoon: { startLevel: 46, endLevel: 50, demand: { generalConsumers: 3000000, retailInvestors: 2000000, activeTraders: 1200000, smallBusinesses: 800000, corporateClients: 350000, highNetWorth: 600000, institutional: 300000 }, growthPerLevel: 0.12, captureCoeff: 0.04, baselineReputation: 92, serviceQuality: 92, synergyMod: 1.1, marketingMod: 1.04, operationalEfficiency: 1.14 },
};

export const DEFAULT_COMPETITION_COUNT = 1;
export const COMPETITION_PENALTY_PER_EXTRA = 0.15;
export const COMFORTABLE_CAPACITY_THRESHOLD = 0.8;
export const HIGH_CAPACITY_THRESHOLD = 0.95;

/** Acquisition & Retention sheet: Modifier = 0.65 + reputation × 0.007. */
export function reputationModifier(reputation0to100: number): number {
  return 0.65 + reputation0to100 * 0.007;
}

/** Acquisition & Retention sheet: Modifier = 0.70 + service quality × 0.006. */
export function serviceModifier(serviceQuality0to100: number): number {
  return 0.7 + serviceQuality0to100 * 0.006;
}

/** Acquisition & Retention sheet: 1 / (1 + 0.15 × (count − 1)). */
export function competitionModifier(sameCategoryCount: number): number {
  const count = Math.max(1, sameCategoryCount);
  return 1 / (1 + COMPETITION_PENALTY_PER_EXTRA * (count - 1));
}

// ---------------------------------------------------------------------------
// Capacity / congestion bands (Acquisition & Retention sheet, exact).
// ---------------------------------------------------------------------------
export type CongestionBand = {
  id: "healthy" | "busy" | "overloaded" | "rejected";
  /** Max utilization covered by this band. */
  upTo: number;
  acquisitionMod: number;
  churnMod: number;
  /** Satisfaction penalty in bps. */
  satisfactionPenaltyBps: number;
  revenueEfficiency: number;
};

export const CONGESTION_BANDS: readonly CongestionBand[] = [
  { id: "healthy", upTo: COMFORTABLE_CAPACITY_THRESHOLD, acquisitionMod: 1, churnMod: 1, satisfactionPenaltyBps: 0, revenueEfficiency: 1 },
  { id: "busy", upTo: HIGH_CAPACITY_THRESHOLD, acquisitionMod: 0.9, churnMod: 1.1, satisfactionPenaltyBps: -500, revenueEfficiency: 1 },
  { id: "overloaded", upTo: 1, acquisitionMod: 0.7, churnMod: 1.35, satisfactionPenaltyBps: -1_200, revenueEfficiency: 0.97 },
  { id: "rejected", upTo: Number.POSITIVE_INFINITY, acquisitionMod: 0.4, churnMod: 1.75, satisfactionPenaltyBps: -2_000, revenueEfficiency: 0.9 },
];

/** Band for a utilization ratio (customers / capacity); 0–0.8 healthy, 0.8–0.95 busy, 0.95–1.0 overloaded, >1.0 rejected. */
export function congestionBand(utilization: number): CongestionBand {
  const value = Math.max(0, utilization);
  return CONGESTION_BANDS.find((band) => value <= band.upTo) ?? CONGESTION_BANDS[CONGESTION_BANDS.length - 1]!;
}

// ---------------------------------------------------------------------------
// Demand pooling + per-building targets.
// ---------------------------------------------------------------------------

/** Σ_segment affinity × stage pool, grown to the empire level (Stage Demand sheet). */
export function addressableDemand(category: BuildingCategory, stage: MarketStage, empireLevel?: number): Record<CustomerStateKey, number> {
  const profile = STAGE_DEMAND[stage];
  const level = Math.max(profile.startLevel, Math.min(profile.endLevel, Math.floor(empireLevel ?? profile.startLevel)));
  const growth = Math.pow(1 + profile.growthPerLevel, level - profile.startLevel);
  const affinity = SERVICE_AFFINITY[category];
  const result = {} as Record<CustomerStateKey, number>;
  for (const key of CUSTOMER_SEGMENT_KEYS) result[key] = profile.demand[key] * affinity[key] * growth;
  return result;
}

/** Weighted addressable demand for one building (doc "Weighted Stage Demand" column). */
export function weightedStageDemand(category: BuildingCategory, stage: MarketStage, empireLevel?: number): number {
  const demand = addressableDemand(category, stage, empireLevel);
  return CUSTOMER_SEGMENT_KEYS.reduce((sum, key) => sum + demand[key], 0);
}

export type BuildingTargetInput = {
  category: BuildingCategory;
  stage: MarketStage;
  /** Defaults to the stage's doc capture coefficient. */
  captureCoeff?: number;
  /** Building doc field `attractionMult`. */
  attractionMult?: number;
  /** 0–100; defaults to the stage's baseline reputation. */
  reputation?: number;
  /** 0–100; defaults to the stage's baseline service quality. */
  serviceQuality?: number;
  synergyMult?: number;
  marketingMult?: number;
  /** Same-category business count on the board (competition). */
  competitionCount?: number;
  empireLevel?: number;
};

/**
 * Expected customers for one building (Stage Scenarios sheet):
 * weightedDemand × capture × attraction × rep × service × synergy × marketing × competition.
 */
export function buildingTargetCustomers(input: BuildingTargetInput): number {
  const profile = STAGE_DEMAND[input.stage];
  const demand = weightedStageDemand(input.category, input.stage, input.empireLevel);
  const capture = input.captureCoeff ?? profile.captureCoeff;
  const attraction = input.attractionMult ?? 1;
  const reputation = input.reputation ?? profile.baselineReputation;
  const service = input.serviceQuality ?? profile.serviceQuality;
  const synergy = input.synergyMult ?? profile.synergyMod;
  const marketing = input.marketingMult ?? profile.marketingMod;
  const competition = competitionModifier(input.competitionCount ?? DEFAULT_COMPETITION_COUNT);
  return demand * capture * attraction * reputationModifier(reputation) * serviceModifier(service) * synergy * marketing * competition;
}

// ---------------------------------------------------------------------------
// Day stepper (Acquisition & Retention sheet):
//   acquisition = gap to target × weighted acquisition × modifiers
//   churn       = current × weighted churn × congestion
// The published 30-day Cash Kiosk table is a once-per-day recursion; the
// `subSteps` option slices the day for intra-day smoothing (96 = 15-min
// sub-steps per the doc's 15-minute customer refresh). Both are deterministic.
// ---------------------------------------------------------------------------
export const CUSTOMER_SUB_STEPS = 96; // 15-minute economic sub-steps per UTC day.

export type CustomerStepInput = {
  targets: CustomerState;
  /** Weighted per-segment acquisition rates (fraction of the gap per day). */
  acquisitionPerDay: CustomerState;
  /** Weighted per-segment churn rates (fraction of current customers per day). */
  churnPerDay: CustomerState;
  /** Per-segment demand modifiers on top of rates (rep × service × synergy × marketing × competition × event). */
  demandModifiers?: Partial<Record<CustomerStateKey, number>>;
  /** Total physical capacity; omitted = unbounded (healthy band). */
  capacity?: number;
  /** Whole-step acquisition multiplier (new-player boost = 3). */
  boostMultiplier?: number;
  /** Intra-day slices; 1 reproduces the doc's published daily tables exactly. */
  subSteps?: number;
};

export type CustomerStepResult = {
  state: CustomerState;
  acquired: CustomerState;
  churned: CustomerState;
  utilization: number;
  band: CongestionBand;
};

export function emptyCustomerState(): CustomerState {
  return { generalConsumers: 0, retailInvestors: 0, activeTraders: 0, smallBusinesses: 0, corporateClients: 0, highNetWorth: 0, institutional: 0 };
}

export function totalCustomers(state: CustomerState): number {
  return CUSTOMER_SEGMENT_KEYS.reduce((sum, key) => sum + state[key], 0);
}

export function stepCustomers(state: CustomerState, input: CustomerStepInput): CustomerStepResult {
  const next = { ...state };
  const acquired = emptyCustomerState();
  const churned = emptyCustomerState();
  const steps = Math.max(1, Math.floor(input.subSteps ?? CUSTOMER_SUB_STEPS));
  const dt = 1 / steps;
  const boost = input.boostMultiplier ?? 1;
  let band = CONGESTION_BANDS[0]!;
  let utilization = 0;
  for (let step = 0; step < steps; step++) {
    const capacity = input.capacity ?? 0;
    utilization = capacity > 0 ? totalCustomers(next) / capacity : 0;
    band = congestionBand(utilization);
    for (const key of CUSTOMER_SEGMENT_KEYS) {
      const target = Math.max(0, input.targets[key]);
      const modifier = input.demandModifiers?.[key] ?? 1;
      const gap = Math.max(0, target - next[key]);
      const gain = gap * Math.max(0, input.acquisitionPerDay[key]) * modifier * band.acquisitionMod * boost * dt;
      const loss = next[key] * Math.max(0, input.churnPerDay[key]) * band.churnMod * dt;
      next[key] = Math.min(target, Math.max(0, next[key] + gain - loss));
      acquired[key] += gain;
      churned[key] += loss;
    }
  }
  return { state: next, acquired, churned, utilization, band };
}

// ---------------------------------------------------------------------------
// Maturation flows (Customer Flow sheet): small cumulative reclassifications;
// they never create customers from nothing.
// ---------------------------------------------------------------------------
export type MaturationFlow = {
  id: string;
  from: CustomerStateKey;
  to: CustomerStateKey;
  /** Base conversion per day (fraction of the source segment). */
  ratePerDay: number;
  requiredBuilding: string;
};

export const MATURATION_FLOWS: readonly MaturationFlow[] = [
  { id: "saver_to_investor", from: "generalConsumers", to: "retailInvestors", ratePerDay: 0.004, requiredBuilding: "Brokerage / Fund" },
  { id: "investor_to_active_trader", from: "retailInvestors", to: "activeTraders", ratePerDay: 0.008, requiredBuilding: "Trading / Exchange" },
  { id: "investor_to_hnw", from: "retailInvestors", to: "highNetWorth", ratePerDay: 0.0015, requiredBuilding: "Wealth / Fund" },
  { id: "smb_to_corporate", from: "smallBusinesses", to: "corporateClients", ratePerDay: 0.0008, requiredBuilding: "Treasury / Investment Bank" },
  { id: "hnw_to_institutional", from: "highNetWorth", to: "institutional", ratePerDay: 0.0004, requiredBuilding: "Asset Manager / Exchange" },
  { id: "consumer_to_smb", from: "generalConsumers", to: "smallBusinesses", ratePerDay: 0.001, requiredBuilding: "Lending / Banking" },
];

// Doc gives the thresholds qualitatively ("reputation threshold", "high
// reputation"); these are the v0.1 cutoffs used to evaluate them.
export const MATURATION_REPUTATION_THRESHOLD = 75; // Investor → HNW ("high Empire Value + reputation threshold")
export const MATURATION_HIGH_REPUTATION_THRESHOLD = 80; // HNW → Institutional ("high reputation")

export type MaturationContext = {
  hasBrokerageOrFund?: boolean;
  hasTradingOrExchange?: boolean;
  hasWealthOrFund?: boolean;
  hasTreasuryOrInvestmentBank?: boolean;
  hasAssetManagerOrExchange?: boolean;
  hasLendingOrBanking?: boolean;
  /** Saver→Investor requires positive customer satisfaction (default true). */
  satisfactionPositive?: boolean;
  /** Empire reputation 0–100 (default 0). */
  reputation?: number;
  /** "High Empire Value" precondition for Investor → HNW (default false). */
  highEmpireValue?: boolean;
  /** Entrepreneurship event/mission active for Consumer → SMB (default false). */
  entrepreneurshipActive?: boolean;
};

export function applyMaturation(state: CustomerState, context: MaturationContext): { state: CustomerState; moved: CustomerState } {
  const next = { ...state };
  const moved = emptyCustomerState();
  const satisfied = context.satisfactionPositive ?? true;
  const reputation = context.reputation ?? 0;
  const eligible: Record<string, boolean> = {
    saver_to_investor: Boolean(context.hasBrokerageOrFund) && satisfied,
    investor_to_active_trader: Boolean(context.hasTradingOrExchange),
    investor_to_hnw: Boolean(context.hasWealthOrFund) && Boolean(context.highEmpireValue) && reputation >= MATURATION_REPUTATION_THRESHOLD,
    smb_to_corporate: Boolean(context.hasTreasuryOrInvestmentBank),
    hnw_to_institutional: Boolean(context.hasAssetManagerOrExchange) && reputation >= MATURATION_HIGH_REPUTATION_THRESHOLD,
    consumer_to_smb: Boolean(context.hasLendingOrBanking) && Boolean(context.entrepreneurshipActive),
  };
  for (const flow of MATURATION_FLOWS) {
    if (!eligible[flow.id]) continue;
    const amount = Math.min(next[flow.from], next[flow.from] * flow.ratePerDay);
    next[flow.from] -= amount;
    next[flow.to] += amount;
    moved[flow.from] += amount;
    moved[flow.to] += amount;
  }
  return { state: next, moved };
}

// ---------------------------------------------------------------------------
// New-player acquisition boost (Model Assumptions sheet): 3× for 24h.
// ---------------------------------------------------------------------------
export const NEW_PLAYER_ACQUISITION_BOOST = 3;
export const NEW_PLAYER_BOOST_HOURS = 24;

export function newPlayerBoostActive(boostUntilMs: number, nowMs: number): boolean {
  return nowMs < boostUntilMs;
}

export function newPlayerBoostMultiplier(boostUntilMs: number, nowMs: number): number {
  return newPlayerBoostActive(boostUntilMs, nowMs) ? NEW_PLAYER_ACQUISITION_BOOST : 1;
}
