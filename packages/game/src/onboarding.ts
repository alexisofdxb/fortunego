export type OnboardingStatus = "active" | "completed" | "skipped";

export type OnboardingMilestone = {
  id: string;
  targetMinute: number;
  xp: number;
  label: string;
  required: boolean;
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

