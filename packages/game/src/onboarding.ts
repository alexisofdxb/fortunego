export type OnboardingStatus = "active" | "completed" | "skipped";

export type OnboardingMilestone = {
  id: string;
  targetMinute: number;
  xp: number;
  label: string;
  required: boolean;
};

export type OnboardingGuide = {
  milestoneId: string;
  title: string;
  prompt: string;
  actionLabel: string;
  target: string;
  recovery: string;
};

export const ONBOARDING_XP_THRESHOLDS = { 1: 0, 2: 100, 3: 175, 4: 275 } as const;

export const ONBOARDING_MILESTONES: readonly OnboardingMilestone[] = [
  { id: "onboarding_started", targetMinute: 0, xp: 0, label: "Start onboarding", required: true },
  { id: "onboarding_first_build", targetMinute: 1, xp: 60, label: "Place your first Cash Kiosk", required: true },
  { id: "onboarding_first_customer", targetMinute: 1.4, xp: 40, label: "Serve your first customer", required: true },
  { id: "onboarding_second_business", targetMinute: 2.5, xp: 75, label: "Open a Trading Booth", required: true },
  { id: "onboarding_third_business", targetMinute: 4, xp: 60, label: "Open a Savings Stand", required: true },
  { id: "onboarding_first_synergy", targetMinute: 4.2, xp: 40, label: "Activate your first synergy", required: true },
  { id: "onboarding_first_cash", targetMinute: 5, xp: 25, label: "See your first real Cash", required: true },
  { id: "onboarding_first_upgrade", targetMinute: 6.5, xp: 100, label: "Upgrade your Cash Kiosk", required: true },
  { id: "onboarding_first_hunt_open", targetMinute: 8, xp: 0, label: "Open your first Market Hunt", required: true },
  { id: "onboarding_first_hunt_complete", targetMinute: 14, xp: 25, label: "Complete your first Market Hunt", required: true },
  { id: "onboarding_first_stock", targetMinute: 14.2, xp: 0, label: "Receive your first stock fragment", required: true },
  { id: "onboarding_first_portfolio", targetMinute: 14.5, xp: 0, label: "View your Portfolio", required: true },
  { id: "onboarding_first_performance", targetMinute: 18, xp: 25, label: "View provisional Performance", required: true },
  { id: "onboarding_freeplay", targetMinute: 22, xp: 0, label: "Enter free play", required: true },
];

/** Server-owned tutorial copy and target names. The client only renders the target. */
export const ONBOARDING_GUIDE: readonly OnboardingGuide[] = [
  { milestoneId: "onboarding_started", title: "Build your first financial business", prompt: "Place a Cash Kiosk to start your district.", actionLabel: "Show Cash Kiosk", target: "build-cash-kiosk", recovery: "The Cash Kiosk remains available in Build until you place it." },
  { milestoneId: "onboarding_first_build", title: "Own your first business", prompt: "Choose the highlighted Cash Kiosk and place it on any valid tile.", actionLabel: "Show Build", target: "build-cash-kiosk", recovery: "Try another highlighted tile if the first location does not fit." },
  { milestoneId: "onboarding_first_customer", title: "Make the district come alive", prompt: "Run today's business action so your first real customer can arrive.", actionLabel: "Show today's action", target: "settle", recovery: "Your early customer demand is protected while onboarding is active." },
  { milestoneId: "onboarding_second_business", title: "Add a second business", prompt: "Place the highlighted Trading Booth. It is affordable from your starting Cash.", actionLabel: "Show Trading Booth", target: "build-trading-booth", recovery: "Any valid location works; adjacency is optional for this step." },
  { milestoneId: "onboarding_third_business", title: "Build a small empire", prompt: "Place the Savings Stand, preferably beside the Cash Kiosk.", actionLabel: "Show Savings Stand", target: "build-savings-stand", recovery: "The placement guide will point to valid nearby tiles." },
  { milestoneId: "onboarding_first_synergy", title: "Make placement matter", prompt: "Place the Cash Kiosk and Savings Stand orthogonally to activate the first synergy.", actionLabel: "Show placement", target: "board", recovery: "You have one guided relocation correction available if you miss the adjacency." },
  { milestoneId: "onboarding_first_cash", title: "See real Cash", prompt: "Run today's action and read the Cash delta in the receipt.", actionLabel: "Show today's action", target: "settle", recovery: "The receipt uses the customer-driven economy; no tutorial Cash is fabricated." },
  { milestoneId: "onboarding_first_upgrade", title: "Strengthen your first business", prompt: "Open the Cash Kiosk detail and upgrade it to Level 2.", actionLabel: "Show Cash Kiosk", target: "building-cash-kiosk", recovery: "The upgrade card shows the exact canonical cost before you confirm." },
  { milestoneId: "onboarding_first_hunt_open", title: "Start your first Market Hunt", prompt: "Open the highlighted starter Hunt and choose a signal.", actionLabel: "Show Market Hunt", target: "hunt-strip", recovery: "The tutorial Hunt stays visible until you start it." },
  { milestoneId: "onboarding_first_hunt_complete", title: "Complete the Hunt", prompt: "Keep operating until the Hunt reaches its Activity Point target, then claim it.", actionLabel: "Show Hunt", target: "hunt-strip", recovery: "Validated activity counts; waiting alone does not fabricate progress." },
  { milestoneId: "onboarding_first_stock", title: "Reveal your first market asset", prompt: "Claim the completed Hunt to receive the guaranteed Common stock packet.", actionLabel: "Show reward", target: "hunt-strip", recovery: "The reward is idempotent and remains claimable after a reload." },
  { milestoneId: "onboarding_first_portfolio", title: "View your Portfolio", prompt: "Open the Portfolio panel to see your in-game stock fragment.", actionLabel: "Show Portfolio", target: "portfolio-panel", recovery: "Portfolio values are labeled in-game and are not real securities." },
  { milestoneId: "onboarding_first_performance", title: "Read your Performance", prompt: "Open the provisional Performance view to understand the weekly components.", actionLabel: "Show Performance", target: "performance-panel", recovery: "This view is provisional; no payout estimate is shown before eligibility." },
  { milestoneId: "onboarding_freeplay", title: "Your core loop is live", prompt: "Choose your next goal and play freely.", actionLabel: "Show district", target: "settle", recovery: "Guided prompts stop here; normal goals remain available." },
];

export function onboardingGuideFor(milestoneId: string): OnboardingGuide | undefined {
  return ONBOARDING_GUIDE.find((guide) => guide.milestoneId === milestoneId);
}

export function onboardingMilestone(id: string): OnboardingMilestone | undefined {
  return ONBOARDING_MILESTONES.find((milestone) => milestone.id === id);
}

export function onboardingLevel(xp: number): 1 | 2 | 3 | 4 {
  if (xp >= ONBOARDING_XP_THRESHOLDS[4]) return 4;
  if (xp >= ONBOARDING_XP_THRESHOLDS[3]) return 3;
  if (xp >= ONBOARDING_XP_THRESHOLDS[2]) return 2;
  return 1;
}

export function onboardingStep(achieved: readonly string[], status: OnboardingStatus): string {
  if (status === "skipped") return "freeplay";
  if (status === "completed") return "freeplay";
  return ONBOARDING_MILESTONES.find((milestone) => milestone.required && !achieved.includes(milestone.id))?.id ?? "freeplay";
}
