import { EVENT_CATALOG, type CatalogEvent } from "./event_cycle.ts";

// ---------------------------------------------------------------------------
// Announced event calendar (retention spec sheet 08).
// Up to 2 announced major/global event windows per ISO week, derived
// deterministically from the week seed — no tables, no schedulers. Surprise /
// minor / crisis events stay unscheduled and are handled by the event system.
// ---------------------------------------------------------------------------

export type AnnouncedEventWindow = {
  eventId: string;
  title: string;
  startsAt: number;
  endsAt: number;
  durationHours: number;
};

export const ANNOUNCED_WINDOWS_PER_WEEK = 2;
export const ANNOUNCED_WINDOW_MIN_GAP_MS = 18 * 3_600_000;
export const ANNOUNCED_WINDOW_MIN_DURATION_MS = 8 * 3_600_000;
export const ANNOUNCED_WINDOW_MAX_DURATION_MS = 36 * 3_600_000;

/** Candidate catalog for announced windows: known major/global, non-crisis events. */
export const ANNOUNCED_EVENT_POOL: readonly CatalogEvent[] = EVENT_CATALOG.filter(
  (event) => event.scope === "Global" && event.category !== "Risk/Crisis",
);

function weekSeed(week: string): number {
  let seed = 2_166_136_261;
  for (let i = 0; i < week.length; i++) {
    seed ^= week.charCodeAt(i);
    seed = Math.imul(seed, 16_777_619);
  }
  return seed >>> 0;
}

function mixSeed(seed: number, index: number): number {
  let value = (seed ^ Math.imul(index + 1, 0x9e3779b9)) >>> 0;
  value ^= value >>> 16;
  value = Math.imul(value, 0x85ebca6b) >>> 0;
  value ^= value >>> 13;
  return value >>> 0;
}

/** Monday 00:00 UTC of an ISO week ("2026-W39"). */
export function weekMondayUtcMs(week: string): number {
  const [yearText, weekText] = week.split("-W");
  const year = Number(yearText);
  const weekNumber = Number(weekText);
  const jan4 = new Date(Date.UTC(year, 0, 4));
  const monday = new Date(jan4.getTime() - ((jan4.getUTCDay() || 7) - 1) * 86_400_000);
  return monday.getTime() + (weekNumber - 1) * 7 * 86_400_000;
}

/**
 * Deterministic announced windows for an ISO week: 1–2 windows (biased toward
 * 2), each 8–36h, spaced >= 18h apart where possible, chosen from the
 * non-crisis global catalog. Pure function of the week label.
 */
export function announcedWindowsForWeek(week: string): AnnouncedEventWindow[] {
  const pool = ANNOUNCED_EVENT_POOL;
  if (!pool.length) return [];
  const seed = weekSeed(week);
  const monday = weekMondayUtcMs(week);
  const count = 1 + (seed % ANNOUNCED_WINDOWS_PER_WEEK);
  const windows: AnnouncedEventWindow[] = [];
  let cursorMs = monday;
  for (let index = 0; index < count; index++) {
    const mixed = mixSeed(seed, index);
    const event = pool[mixed % pool.length]!;
    // Duration: clamp catalog duration into the canonical 8–36h band.
    const durationHours = Math.max(8, Math.min(36, event.durationHours));
    // First window opens 12–36h into the week; later windows respect the gap.
    const openAfterMs = index === 0
      ? (12 + (mixed % 25)) * 3_600_000
      : ANNOUNCED_WINDOW_MIN_GAP_MS + (mixed % 37) * 3_600_000;
    const startsAt = cursorMs + openAfterMs;
    const endsAt = startsAt + durationHours * 3_600_000;
    windows.push({ eventId: event.id, title: event.event, startsAt, endsAt, durationHours });
    cursorMs = endsAt;
  }
  return windows;
}

/** The announced window active at `now`, if any. */
export function currentAnnouncedWindow(week: string, now: number): AnnouncedEventWindow | null {
  return announcedWindowsForWeek(week).find((window) => window.startsAt <= now && now < window.endsAt) ?? null;
}
