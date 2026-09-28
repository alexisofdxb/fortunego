import type { PlotSnapshot } from "@plotgo/shared";

export function cashLabel(minor: number) {
  const sign = minor < 0 ? "-" : "";
  return `${sign}$${Math.floor(Math.abs(minor) / 100).toLocaleString()}`;
}

/** "2d 4h", "3h 12m", "45m" — used for hunt expiry and week countdowns. */
export function formatCountdown(ms: number): string {
  const totalMinutes = Math.max(0, Math.floor(ms / 60_000));
  const days = Math.floor(totalMinutes / 1_440);
  const hours = Math.floor((totalMinutes % 1_440) / 60);
  const minutes = totalMinutes % 60;
  if (days > 0) return `${days}d ${hours}h`;
  if (hours > 0) return `${hours}h ${minutes}m`;
  return `${minutes}m`;
}

export type ClosingBellCopy = {
  label: string;
  detail: string;
  tone: "normal" | "soon" | "bell" | "stretch" | "pending" | "final";
  showEligibility: boolean;
};

/**
 * Weekly countdown / Closing Bell states (spec sheet 09). Provisional while
 * the week is open — never a guaranteed-payout label; pending settlement
 * reassures that nothing is lost.
 */
export function closingBellCopy(weekStatus: PlotSnapshot["weekStatus"]): ClosingBellCopy | null {
  if (!weekStatus) return null;
  if (weekStatus.status === "pending") {
    return {
      label: "Settlement pending",
      detail: "Settlement is being finalized; nothing is lost. The new week is already playable.",
      tone: "pending",
      showEligibility: false,
    };
  }
  if (weekStatus.status === "finalized") {
    return { label: "Week finalized", detail: "Results are final.", tone: "final", showEligibility: false };
  }
  const hours = weekStatus.msUntilClose / 3_600_000;
  if (hours > 48) {
    return {
      label: "Provisional",
      detail: "Week in progress. Play normally and inspect your weakest component.",
      tone: "normal",
      showEligibility: false,
    };
  }
  if (hours > 24) {
    return {
      label: "Closing Bell soon",
      detail: "The week closes within 48 hours. Only real gaps are highlighted — no payout is guaranteed.",
      tone: "soon",
      showEligibility: false,
    };
  }
  if (hours > 6) {
    return {
      label: "Closing Bell",
      detail: "The week closes within 24 hours. Check active-day eligibility and address real gaps, or stop.",
      tone: "bell",
      showEligibility: true,
    };
  }
  return {
    label: "Final stretch",
    detail: `Week closes at ${new Date(weekStatus.closesAt).toISOString().slice(11, 16)} UTC. One legitimate action if useful.`,
    tone: "stretch",
    showEligibility: true,
  };
}

/** Smooth-scroll to the first element matching the selector (deep-link-ish inbox actions). */
export function scrollToSelector(selector: string) {
  const element = document.querySelector<HTMLElement>(selector);
  if (element) element.scrollIntoView({ behavior: "smooth", block: "start" });
}

/** Land grade -> CSS class (Entry/Growth/Premium/Prime/Trophy). */
export const GRADE_CLASS: Record<string, string> = {
  Entry: "grade-entry",
  Growth: "grade-growth",
  Premium: "grade-premium",
  Prime: "grade-prime",
  Trophy: "grade-trophy",
};
