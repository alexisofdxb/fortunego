import { CASH_SCALE } from "../constants.ts";
import { isoWeek } from "../market_phase3.ts";
import { weekMondayUtcMs } from "../event_calendar.ts";
import { liveopsItem, type LiveopsItem } from "./items.ts";
import type { LiveopsWeekTone } from "./calendar.ts";

function utcDay(now = Date.now()): string {
  return new Date(now).toISOString().slice(0, 10);
}

export type LiveopsVerb = "place" | "upgrade" | "land" | "hunt_start" | "hunt_claim" | "settle";

export type LiveopsMilestone = {
  id: string;
  points: number;
  cashMinor?: number;
  items?: { itemId: string; quantity: number }[];
};

export type LiveopsCampaignWindow =
  | { kind: "weekdays"; startDay: number; endDay: number }
  | { kind: "daily" };

export type LiveopsCampaign = {
  id: string;
  name: string;
  tone: LiveopsWeekTone;
  window: LiveopsCampaignWindow;
  durationLabel: string;
  qualifying: readonly LiveopsVerb[];
  qualifyingCopy: string;
  rewardsCopy: string;
  pointsPerAction: number;
  milestones: readonly LiveopsMilestone[];
};

const cash = (dollars: number) => Math.round(dollars * CASH_SCALE);

/** MVP campaigns from Fortune_Go_LiveOps Event Catalog (Phase = MVP). */
export const LIVEOPS_CAMPAIGNS: readonly LiveopsCampaign[] = [
  {
    id: "global_finance_week",
    name: "Global Finance Week",
    tone: "gold",
    window: { kind: "weekdays", startDay: 0, endDay: 6 },
    durationLabel: "7 days",
    qualifying: ["place", "upgrade", "land", "hunt_start", "hunt_claim", "settle"],
    qualifyingCopy: "Build, upgrade, invest, trade, Market Hunts",
    rewardsCopy: "Cash, case keys, shards",
    pointsPerAction: 8,
    milestones: [
      { id: "gfw_1", points: 16, items: [{ itemId: "module_shard", quantity: 8 }] },
      { id: "gfw_2", points: 40, cashMinor: cash(1_500), items: [{ itemId: "business_key", quantity: 1 }] },
      { id: "gfw_3", points: 80, items: [{ itemId: "market_key", quantity: 1 }, { itemId: "module_shard", quantity: 15 }] },
    ],
  },
  {
    id: "business_expansion",
    name: "Business Expansion",
    tone: "gold",
    window: { kind: "weekdays", startDay: 0, endDay: 1 },
    durationLabel: "48 hours",
    qualifying: ["place"],
    qualifyingCopy: "Build new businesses, mature openings",
    rewardsCopy: "Cash, components · Business Key",
    pointsPerAction: 30,
    milestones: [
      { id: "exp_1", points: 30, cashMinor: cash(1_500), items: [{ itemId: "module_shard", quantity: 10 }] },
      { id: "exp_2", points: 60, items: [{ itemId: "business_key", quantity: 1 }] },
      { id: "exp_3", points: 90, items: [{ itemId: "precision_component", quantity: 1 }] },
    ],
  },
  {
    id: "upgrade_sprint",
    name: "Upgrade Sprint",
    tone: "gold",
    window: { kind: "daily" },
    durationLabel: "24 hours",
    qualifying: ["upgrade"],
    qualifyingCopy: "Stage upgrades, module upgrades",
    rewardsCopy: "Shards, boosters",
    pointsPerAction: 25,
    milestones: [
      { id: "upg_1", points: 25, items: [{ itemId: "module_shard", quantity: 8 }] },
      { id: "upg_2", points: 50, items: [{ itemId: "maturation_booster", quantity: 1 }] },
    ],
  },
  {
    id: "market_hunter",
    name: "Market Hunter",
    tone: "teal",
    window: { kind: "weekdays", startDay: 2, endDay: 2 },
    durationLabel: "24 hours",
    qualifying: ["hunt_start", "hunt_claim"],
    qualifyingCopy: "Market Hunts, stock fragments",
    rewardsCopy: "Tickets, Market Cases",
    pointsPerAction: 25,
    milestones: [
      { id: "hunt_1", points: 25, items: [{ itemId: "market_hunt_ticket", quantity: 1 }] },
      { id: "hunt_2", points: 50, items: [{ itemId: "market_key", quantity: 1 }] },
      { id: "hunt_3", points: 75, items: [{ itemId: "module_shard", quantity: 12 }] },
    ],
  },
  {
    id: "customer_rush",
    name: "Customer Rush",
    tone: "teal",
    window: { kind: "weekdays", startDay: 3, endDay: 3 },
    durationLabel: "24 hours",
    qualifying: ["settle"],
    qualifyingCopy: "Acquire and serve customers, throughput goals",
    rewardsCopy: "Cash, campaign boosts",
    pointsPerAction: 30,
    milestones: [
      { id: "rush_1", points: 30, items: [{ itemId: "customer_campaign", quantity: 1 }] },
      { id: "rush_2", points: 60, cashMinor: cash(2_000) },
    ],
  },
  {
    id: "property_development",
    name: "Property Development",
    tone: "teal",
    window: { kind: "weekdays", startDay: 4, endDay: 5 },
    durationLabel: "48 hours",
    qualifying: ["land"],
    qualifyingCopy: "Buy land, develop qualifying parcels",
    rewardsCopy: "Permits, Cash",
    pointsPerAction: 30,
    milestones: [
      { id: "prop_1", points: 30, items: [{ itemId: "development_permit", quantity: 1 }] },
      { id: "prop_2", points: 60, cashMinor: cash(2_500) },
    ],
  },
];

const BY_ID = new Map(LIVEOPS_CAMPAIGNS.map((campaign) => [campaign.id, campaign]));

export function liveopsCampaign(id: string): LiveopsCampaign | undefined {
  return BY_ID.get(id);
}

export type LiveopsWindow = {
  campaignId: string;
  seasonId: string;
  startsAt: number;
  endsAt: number;
};

/** Active LiveOps windows at `now`. Weekday campaigns use the ISO week; daily flashes use the UTC day. */
export function liveopsWindowsAt(now = Date.now()): LiveopsWindow[] {
  const week = isoWeek(new Date(now));
  const monday = weekMondayUtcMs(week);
  const dayStart = Date.parse(`${utcDay(now)}T00:00:00Z`);
  const windows: LiveopsWindow[] = [];
  for (const campaign of LIVEOPS_CAMPAIGNS) {
    if (campaign.window.kind === "daily") {
      const startsAt = dayStart;
      const endsAt = dayStart + 86_400_000;
      if (now >= startsAt && now < endsAt) {
        windows.push({ campaignId: campaign.id, seasonId: utcDay(now), startsAt, endsAt });
      }
      continue;
    }
    const startsAt = monday + campaign.window.startDay * 86_400_000;
    const endsAt = monday + (campaign.window.endDay + 1) * 86_400_000;
    if (now >= startsAt && now < endsAt) {
      windows.push({ campaignId: campaign.id, seasonId: week, startsAt, endsAt });
    }
  }
  return windows;
}

/** 1st action: full points; 2nd and 3rd: half; further repeats score nothing that UTC day. */
export function liveopsPointsForRepeat(base: number, priorCount: number): number {
  if (priorCount <= 0) return base;
  if (priorCount <= 2) return Math.floor(base / 2);
  return 0;
}

export function liveopsMilestoneLabel(milestone: LiveopsMilestone): string {
  const parts: string[] = [];
  if (milestone.cashMinor) parts.push(`$${Math.round(milestone.cashMinor / CASH_SCALE).toLocaleString()}`);
  for (const item of milestone.items ?? []) {
    const spec: LiveopsItem | undefined = liveopsItem(item.itemId);
    parts.push(`${item.quantity}× ${spec?.name ?? item.itemId}`);
  }
  return parts.join(" · ") || `${milestone.points} pts`;
}
