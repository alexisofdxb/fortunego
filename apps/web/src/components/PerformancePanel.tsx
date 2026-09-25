import type { PlotSnapshot } from "@plotgo/shared";
import { usePerformanceClaim } from "../api/hooks";
import { closingBellCopy, formatCountdown } from "../utils";

export function PerformancePanel({ plot }: { plot: PlotSnapshot }) {
  const claim = usePerformanceClaim();
  const performance = plot.performance;
  const weekStatus = plot.weekStatus;
  const bell = closingBellCopy(weekStatus);
  const rows = Object.entries(performance.components).map(([key, value]) => (
    <span key={key}>
      {key.replace(/([A-Z])/g, " $1")} <b>{Math.round(value)}</b>
    </span>
  ));
  return (
    <section className="performance-panel" data-onboarding-target="performance-panel">
      <div className="portfolio-heading">
        <b>
          Weekly Performance · {performance.week}
          {performance.finalized ? "" : " · Provisional"}
        </b>
        <span>
          {performance.score}/120 · {plot.plotBalance.toLocaleString()} $PLOT
        </span>
      </div>
      {bell && !performance.finalized ? (
        <div className={`closing-bell ${bell.tone}`}>
          <b>{bell.label}</b>
          <span>
            {bell.detail}
            {weekStatus && weekStatus.status === "open" ? ` Closes in ${formatCountdown(weekStatus.msUntilClose)}.` : ""}
          </span>
          {bell.showEligibility ? (
            <span className="closing-bell-eligibility">
              Active days {performance.activeDays}/3 — eligibility needs 3 eligible days this week.
            </span>
          ) : null}
        </div>
      ) : null}
      <div className="performance-stats">{rows}</div>
      <small className="settled">
        {plot.pendingPayout
          ? `Pending payout: ${plot.pendingPayout.payoutPlot.toLocaleString()} $PLOT from ${plot.pendingPayout.week}.`
          : performance.finalized
            ? performance.eligible
              ? `Eligible payout: ${performance.payoutPlot.toLocaleString()} $PLOT${performance.claimed ? " · claimed" : ""}`
              : "Finalized but not eligible"
            : `${performance.activeDays}/3 active days · ${performance.completedHunts} hunts · snapshot in progress`}
      </small>
      {plot.weeklyRedeemable ? (
        <button
          className="performance-claim"
          type="button"
          onClick={() => claim.mutate({ week: plot.pendingPayout?.week ?? undefined })}
        >
          Claim weekly $PLOT payout
        </button>
      ) : null}
      {!performance.finalized && performance.eligibilityReasons.length ? (
        <small className="settled">{performance.eligibilityReasons.slice(0, 2).join(" ")}</small>
      ) : null}
    </section>
  );
}
