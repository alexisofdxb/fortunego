import type { PlotSnapshot } from "@plotgo/shared";
import { useHuntClaim } from "../api/hooks";

export function HuntStrip({ plot }: { plot: PlotSnapshot }) {
  const claim = useHuntClaim();
  const hunts = plot.hunts ?? (plot.hunt ? [plot.hunt] : []);
  return (
    <div className="hunt-strip" data-onboarding-target="hunt-strip">
      <div className="hunt-heading">
        <b>
          Market Hunts · {plot.marketStage} · L{plot.empireLevel}
        </b>
        <span>
          {plot.marketHuntPoints}/{plot.marketHuntPointCap} weekly points · {plot.marketHuntSubscore}/100 score · pool{" "}
          {Math.round(plot.marketPoolConsumption * 100)}%
        </span>
      </div>
      <div className="hunt-list">
        {hunts.map((hunt) => {
          const pct = Math.min(100, Math.round((hunt.progress.current / Math.max(1, hunt.progress.target)) * 100));
          const stockReward = hunt.rewardValueMinor
            ? `$${(hunt.rewardValueMinor / 100).toFixed(2)} ${hunt.stockTicker ?? "stock"}`
            : "Pool fallback";
          const moduleReward = hunt.moduleReward
            ? ` + ${hunt.moduleReward.label ?? `${hunt.moduleReward.rarity} Module ${hunt.moduleReward.kind === "parts" ? "Parts" : ""}`}`
            : "";
          return (
            <div className={`hunt-row ${hunt.ready ? "ready" : ""}`} key={hunt.id}>
              <div className="hunt-copy">
                <b>{hunt.title}</b>
                <span>
                  {hunt.difficulty} · {hunt.rewardRarity} · {stockReward}
                  {moduleReward} · {hunt.points} pts
                </span>
                <div className="bar">
                  <i style={{ width: `${pct}%` }} />
                </div>
              </div>
              <button
                className="claim"
                type="button"
                title={hunt.claimBlockedReason ?? ""}
                disabled={!hunt.ready}
                onClick={() => claim.mutate({ huntId: hunt.id })}
              >
                {hunt.status === "claimed" ? "Claimed" : hunt.claimBlockedReason ? "Held" : "Claim"}
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}
