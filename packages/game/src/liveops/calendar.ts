/** Repeating weekday overlay from Fortune_Go_LiveOps Event Calendar sheet. Days are 0=Mon … 6=Sun. */
export type LiveopsWeekTone = "gold" | "teal" | "blue" | "purple";

export type LiveopsWeekEvent = {
  id: string;
  name: string;
  group: string;
  tone: LiveopsWeekTone;
  startDay: number;
  endDay: number;
  durationLabel: string;
  qualifying: string;
  rewards: string;
};

export const LIVEOPS_WEEKLY_EVENTS: readonly LiveopsWeekEvent[] = [
  {
    id: "global_finance_week",
    name: "Global Finance Week",
    group: "Campaigns",
    tone: "gold",
    startDay: 0,
    endDay: 6,
    durationLabel: "7 days",
    qualifying: "Build, upgrade, invest, trade, Market Hunts",
    rewards: "Cash, case keys, shards · season XP + exclusive cosmetic",
  },
  {
    id: "upgrade_sprint",
    name: "Upgrade Sprint",
    group: "Campaigns",
    tone: "gold",
    startDay: 0,
    endDay: 6,
    durationLabel: "Daily flash",
    qualifying: "Stage upgrades, module upgrades",
    rewards: "Shards, boosters",
  },
  {
    id: "business_expansion",
    name: "Business Expansion",
    group: "Campaigns",
    tone: "gold",
    startDay: 0,
    endDay: 1,
    durationLabel: "48 hours",
    qualifying: "Build new businesses, mature openings",
    rewards: "Cash, components · Executive Case",
  },
  {
    id: "market_hunter",
    name: "Market Hunter",
    group: "Campaigns",
    tone: "teal",
    startDay: 2,
    endDay: 2,
    durationLabel: "24 hours",
    qualifying: "Market Hunts, stock fragments",
    rewards: "Tickets, Market Cases · rare stock cosmetic",
  },
  {
    id: "customer_rush",
    name: "Customer Rush",
    group: "Campaigns",
    tone: "teal",
    startDay: 3,
    endDay: 3,
    durationLabel: "24 hours",
    qualifying: "Acquire and serve customers, throughput goals",
    rewards: "Cash, campaign boosts · Executive Case",
  },
  {
    id: "property_development",
    name: "Property Development",
    group: "Campaigns",
    tone: "teal",
    startDay: 4,
    endDay: 5,
    durationLabel: "48 hours",
    qualifying: "Buy land, develop qualifying parcels",
    rewards: "Permits, Cash · Prime Permit",
  },
  {
    id: "bull_market_rally",
    name: "Bull Market Rally",
    group: "Campaigns",
    tone: "gold",
    startDay: 4,
    endDay: 6,
    durationLabel: "72 hours",
    qualifying: "Selected market-sensitive actions",
    rewards: "Cash, boosts, cases · limited cosmetic",
  },
  {
    id: "portfolio_week",
    name: "Portfolio Week",
    group: "Campaigns",
    tone: "teal",
    startDay: 5,
    endDay: 6,
    durationLabel: "72 hours",
    qualifying: "Complete stock sets / diversify collections",
    rewards: "Fragments, cases · exclusive title",
  },
  {
    id: "weekly_settlement",
    name: "Weekly Settlement",
    group: "Campaigns",
    tone: "blue",
    startDay: 6,
    endDay: 6,
    durationLabel: "Sunday",
    qualifying: "Close the week in good standing",
    rewards: "Weekly score and payout snapshot",
  },
];
