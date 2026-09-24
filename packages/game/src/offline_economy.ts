export type OfflineBand = "grace" | "short" | "medium" | "long" | "frozen";

export const OFFLINE_CONFIG = {
  configVersion: "offline-v1.0",
  disconnectGraceMin: 30,
  shortAwayEndHours: 2,
  mediumAwayEndHours: 6,
  accrualCapHours: 12,
  afkTimeoutMin: 20,
  summaryThresholdMin: 5,
  cashEfficiency: { grace: 1, short: 0.65, medium: 0.5, long: 0.35, frozen: 0 },
  customerIntensity: { grace: 1, short: 0.4, medium: 0.3, long: 0.2, frozen: 0 },
  performanceRevenueCredit: { grace: 1, short: 0.25, medium: 0.25, long: 0.25, frozen: 0 },
  performanceGrowthCredit: { grace: 1, short: 0.25, medium: 0.25, long: 0.25, frozen: 0 },
  riskIntensity: { grace: 1, short: 0.5, medium: 0.5, long: 0.5, frozen: 0 },
  activityCredit: { grace: 0, short: 0, medium: 0, long: 0, frozen: 0 },
  huntProgress: { grace: 0, short: 0, medium: 0, long: 0, frozen: 0 },
  positiveReputationGain: { grace: 0, short: 0, medium: 0, long: 0, frozen: 0 },
} as const;

export type OfflineSlice = {
  startAt: number;
  endAt: number;
  durationMs: number;
  elapsedHours: number;
  band: OfflineBand;
  cashEfficiency: number;
  customerIntensity: number;
  performanceRevenueCredit: number;
  performanceGrowthCredit: number;
  riskIntensity: number;
};

export function offlineBandAtElapsedHours(hours: number): OfflineBand {
  if (hours < 0.5) return "grace";
  if (hours < OFFLINE_CONFIG.shortAwayEndHours) return "short";
  if (hours < OFFLINE_CONFIG.mediumAwayEndHours) return "medium";
  if (hours < OFFLINE_CONFIG.accrualCapHours) return "long";
  return "frozen";
}

export function splitOfflineWindow(startAt: number, endAt: number, offlineStartedAt = startAt): OfflineSlice[] {
  const cappedEnd = Math.min(endAt, offlineStartedAt + OFFLINE_CONFIG.accrualCapHours * 3_600_000);
  if (cappedEnd <= startAt) return [];
  const slices: OfflineSlice[] = [];
  let cursor = startAt;
  while (cursor < cappedEnd) {
    const elapsedHours = Math.max(0, (cursor - offlineStartedAt) / 3_600_000);
    const band = offlineBandAtElapsedHours(elapsedHours);
    const nextBoundary = band === "grace"
      ? offlineStartedAt + 0.5 * 3_600_000
      : band === "short"
        ? offlineStartedAt + OFFLINE_CONFIG.shortAwayEndHours * 3_600_000
        : band === "medium"
          ? offlineStartedAt + OFFLINE_CONFIG.mediumAwayEndHours * 3_600_000
          : band === "long"
            ? offlineStartedAt + OFFLINE_CONFIG.accrualCapHours * 3_600_000
            : cappedEnd;
    const end = Math.min(cappedEnd, nextBoundary, cursor + 30 * 60_000);
    if (end <= cursor) break;
    slices.push({
      startAt: cursor,
      endAt: end,
      durationMs: end - cursor,
      elapsedHours,
      band,
      cashEfficiency: OFFLINE_CONFIG.cashEfficiency[band],
      customerIntensity: OFFLINE_CONFIG.customerIntensity[band],
      performanceRevenueCredit: OFFLINE_CONFIG.performanceRevenueCredit[band],
      performanceGrowthCredit: OFFLINE_CONFIG.performanceGrowthCredit[band],
      riskIntensity: OFFLINE_CONFIG.riskIntensity[band],
    });
    cursor = end;
  }
  return slices;
}

export function offlineStateForAwayMinutes(minutes: number): "grace" | "short" | "medium" | "long" | "frozen" {
  return offlineBandAtElapsedHours(minutes / 60);
}

