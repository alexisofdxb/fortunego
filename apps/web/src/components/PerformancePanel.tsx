import type { PlotSnapshot } from "@plotgo/shared";
import { usePerformanceClaim } from "../api/hooks";

export function PerformancePanel({ plot }: { plot: PlotSnapshot }) {
  const claim = usePerformanceClaim();
  const performance = plot.performance;
  const rows = Object.entries(performance.components).map(([key, value]) => (
    <span key={key}>
      {key.replace(/([A-Z])/g, " $1")} <b>{Math.round(value)}</b>
    </span>
  ));
  return (
    <section className="performance-panel" data-onboarding-target="performance-panel">
      <div className="portfolio-heading">
        <b>Weekly Performance · {performance.week}</b>
        <span>
          {performance.score}/120 · {plot.plotBalance.toLocaleString()} $PLOT
        </span>
      </div>
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
