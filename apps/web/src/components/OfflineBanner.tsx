import type { PlotSnapshot } from "@plotgo/shared";
import { useOfflineSummaryView } from "../api/hooks";
import { cashLabel } from "../utils";

export function OfflineBanner({ plot }: { plot: PlotSnapshot }) {
  const view = useOfflineSummaryView();
  const summary = plot.offlineSummary;
  if (!summary) return null;
  return (
    <section className="offline-summary">
      <div className="portfolio-heading">
        <b>Welcome back</b>
        <span>
          {Math.max(0, (summary.returnedAt - summary.awayStartedAt) / 3_600_000).toFixed(1)}h away · {plot.presenceState}
        </span>
      </div>
      <div className="offline-summary-stats">
        <span>
          Offline Cash <b>{cashLabel(summary.cashDeltaMinor)}</b>
        </span>
        <span>
          Customers{" "}
          <b>
            {summary.customerDelta >= 0 ? "+" : ""}
            {Math.round(summary.customerDelta).toLocaleString()}
          </b>
        </span>
        <span>
          Revenue credit <b>{cashLabel(summary.revenueCreditMinor)}</b>
        </span>
        <span>
          Growth credit <b>{summary.growthCredit.toFixed(1)}</b>
        </span>
      </div>
      <small className="settled">
        Offline operations use reduced efficiency. Activity and Hunts require active play; only 25% of later offline
        revenue and customer growth counts toward Performance.
        {summary.frozenMs > 0 ? ` Economy froze after 12 hours (${(summary.frozenMs / 3_600_000).toFixed(1)}h frozen).` : ""}
      </small>
      <button className="performance-claim" type="button" onClick={() => view.mutate({ summaryId: summary.summaryId })}>
        Dismiss summary
      </button>
    </section>
  );
}
