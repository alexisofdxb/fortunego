import { useEffect, useState } from "react";
import type { HuntView, PlotSnapshot } from "@plotgo/shared";
import { useHuntClaim, useHuntReroll, useHuntStart } from "../api/hooks";
import { formatCountdown } from "../utils";

const MAX_ACTIVE_HUNTS = 5;

function rewardLine(hunt: HuntView) {
  const stockReward = hunt.rewardValueMinor
    ? `$${(hunt.rewardValueMinor / 100).toFixed(2)} ${hunt.stockTicker ?? "stock"}`
    : "Pool fallback";
  const moduleReward = hunt.moduleReward
    ? ` + ${hunt.moduleReward.label ?? `${hunt.moduleReward.rarity} Module ${hunt.moduleReward.kind === "parts" ? "Parts" : ""}`}`
    : "";
  return `${stockReward}${moduleReward} · ${hunt.points} pts`;
}

export function HuntStrip({ plot }: { plot: PlotSnapshot }) {
  const claim = useHuntClaim();
  const start = useHuntStart();
  const reroll = useHuntReroll();
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 30_000);
    return () => window.clearInterval(timer);
  }, []);

  const all = plot.hunts ?? (plot.hunt ? [plot.hunt] : []);
  const active = all.filter((hunt) => hunt.started).slice(0, MAX_ACTIVE_HUNTS);
  const offers = plot.huntOffers ?? all.filter((hunt) => !hunt.started);
  const activeCount = plot.activeHuntCount ?? active.length;
  const queueFull = activeCount >= MAX_ACTIVE_HUNTS;
  const huntTickets = plot.liveops?.inventory.find((item) => item.itemId === "market_hunt_ticket")?.quantity ?? 0;

  return (
    <div className="hunt-strip" data-onboarding-target="hunt-strip">
      <div className="hunt-heading">
        <b>
          Market Hunts · {plot.marketStage} · L{plot.empireLevel}
        </b>
        <span>
          {plot.marketHuntPoints}/{plot.marketHuntPointCap} weekly points · {plot.marketHuntSubscore}/100 score · pool{" "}
          {Math.round(plot.marketPoolConsumption * 100)}%
          {huntTickets > 0 ? ` · ${huntTickets} hunt ticket${huntTickets === 1 ? "" : "s"}` : ""}
        </span>
      </div>

      {active.length ? (
        <div className="hunt-list">
          {active.map((hunt) => {
            const pct = Math.min(100, Math.round((hunt.progress.current / Math.max(1, hunt.progress.target)) * 100));
            const remaining = hunt.expiresAt - now;
            return (
              <div className={`hunt-row ${hunt.ready ? "ready" : ""}`} key={hunt.id}>
                <div className="hunt-copy">
                  <b>{hunt.title}</b>
                  <span>
                    {hunt.difficulty} · {hunt.rewardRarity} · {rewardLine(hunt)}
                  </span>
                  <span className="hunt-timer">
                    {hunt.status === "claimed" ? "Claimed" : `Expires in ${formatCountdown(remaining)}`}
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
      ) : (
        <small className="settled">No active Hunts. Start an offer below — started Hunts keep their own timer.</small>
      )}

      {offers.length ? (
        <div className="hunt-offers">
          <div className="hunt-offers-head">
            <b>Today's offers</b>
            {plot.rerollAvailable ? (
              <button
                className="verb hunt-reroll"
                type="button"
                disabled={reroll.isPending}
                onClick={() => reroll.mutate({ huntId: offers[0]?.id })}
              >
                Reroll one offer · 1/day
              </button>
            ) : (
              <span className="hunt-reroll-spent">Daily reroll used</span>
            )}
          </div>
          {offers.map((hunt) => (
            <div className="hunt-offer-card" key={hunt.id}>
              <div className="hunt-copy">
                <b>{hunt.title}</b>
                <span>
                  {hunt.difficulty} · {hunt.rewardRarity} · {rewardLine(hunt)}
                </span>
                <span className="hunt-timer">Unstarted offers refresh at the next daily reset</span>
              </div>
              <button
                className="claim"
                type="button"
                data-tut="hunt-start"
                title={queueFull ? "Active queue is full (max 5 started Hunts)" : ""}
                disabled={queueFull || start.isPending}
                onClick={() => start.mutate({ huntId: hunt.id })}
              >
                Start
              </button>
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}
