import type { PlotSnapshot } from "@plotgo/shared";
import hexLayout from "../public/map/hexes.json";

/** DiceBear Lorelei portrait — same seed always draws the same face. */
export function dicebearAvatarUrl(seed: string, size = 64): string {
  const params = new URLSearchParams({
    seed: seed || "founder",
    backgroundColor: "ffd5dc",
    size: String(size),
  });
  return `https://api.dicebear.com/9.x/lorelei/svg?${params.toString()}`;
}

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

/** Nearest parcel to a screen point — the whole painted plot (plus margin)
 *  is a valid drop target, not just the exact polygon. Returns a game hex id. */
export function nearestHexFromPoint(clientX: number, clientY: number): string | null {
  const svg = document.querySelector(".hex-frame svg");
  if (!svg) return null;
  const r = svg.getBoundingClientRect();
  if (r.width === 0) return null;
  const x = ((clientX - r.left) / r.width) * 1672;
  const y = ((clientY - r.top) / r.height) * 941;
  let best: string | null = null;
  let bestScore = 1.7; // ~1.3 hex-radii of forgiveness
  for (const h of HEX_GEOM) {
    const cx = h.refX ?? h.cx;
    const cy = h.refY ?? h.cy;
    const a = (h.paintedA ?? 73) * 0.96 * 1.2;
    const b = (h.paintedB ?? 47) * 0.96 * 1.2;
    const dx = (x - cx) / a;
    const dy = (y - cy) / b;
    const score = dx * dx + dy * dy;
    if (score < bestScore) {
      bestScore = score;
      best = h.id;
    }
  }
  return best;
}

const HEX_GEOM = (hexLayout as { hexes: { id: string; cx: number; cy: number; refX?: number; refY?: number; paintedA?: number; paintedB?: number }[] }).hexes;

/** SVG group id is `hex-12`; game ids are `12`. */
export function hexIdFromEl(el: Element | null): string | null {
  const hex = el?.closest?.(".hex");
  if (!hex) return null;
  const data = (hex as HTMLElement).dataset?.hex;
  if (data) return data;
  const id = hex.id;
  return id?.startsWith("hex-") ? id.slice(4) : id || null;
}

/** Building category -> emoji art (used on catalog cards and board chips). */
export const CATEGORY_ART: Record<string, string> = {
  "Banking & Savings": "🏦",
  Brokerage: "📊",
  "Funds & Asset Management": "💼",
  "Institutional Finance": "🏛️",
  "Insurance & Risk": "🛡️",
  "Lending & Credit": "💳",
  "Research, Data & Fintech": "🔬",
  "Retail Finance": "🏪",
  "Trading & Markets": "📈",
  "Treasury, Vault & Custody": "🔐",
};
