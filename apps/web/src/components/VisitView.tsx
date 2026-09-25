import { useState } from "react";
import {
  CARDS,
  INVEST_MAX_MINOR,
  INVEST_MIN_MINOR,
  INVEST_SHARE_BPS,
  INVEST_TERM_DAYS,
  VISIT_ACTIONS,
  VISIT_NOTIONAL_MINOR,
  cardHourMinor,
  visitEligible,
  visitFeeMinor,
  type PlacedCard,
  type VisitAction,
} from "@plotgo/game";
import type { PlotSnapshot } from "@plotgo/shared";
import { useInvest, useLeaderboard, usePlayerBoard, useVisit } from "../api/hooks";
import { cashLabel } from "../utils";

const ACTION_HINT: Record<VisitAction, string> = {
  trade: "Fee only. The host earns your trading commission.",
  deposit: "Fee + notional moves to the host and auto-returns at your next daily settle.",
  borrow: "Fee + notional moves to the host and auto-repays at your next daily settle.",
};

export function VisitView({ plot }: { plot: PlotSnapshot }) {
  const leaderboard = useLeaderboard();
  const [hostId, setHostId] = useState<string | null>(null);
  const [buildingId, setBuildingId] = useState<string | null>(null);
  const [amount, setAmount] = useState("");
  const board = usePlayerBoard(hostId);
  const visit = useVisit();
  const invest = useInvest();

  const hosts = (leaderboard.data?.board ?? []).filter((entry) => entry.playerId !== plot.playerId);
  const buildings = board.data?.buildings ?? [];
  const selected = buildings.find((candidate) => candidate.id === buildingId) ?? null;
  const selectedSpec = selected ? CARDS[selected.type] : null;
  const boardCards: PlacedCard[] = buildings.map((b) => ({ id: b.id, type: b.type, x: b.x, y: b.y, stage: b.stage as 1 | 2 | 3, orientation: b.orientation as 0 | 90 | 180 | 270 }));
  const eligibleActions = selectedSpec ? VISIT_ACTIONS.filter((action) => visitEligible(selectedSpec.lineage, action)) : [];
  const amountMinor = Math.round(Number(amount || "0") * 100);
  const amountOk = Number.isFinite(amountMinor) && amountMinor >= INVEST_MIN_MINOR && amountMinor <= INVEST_MAX_MINOR;
  const expectedYieldMinor = selected
    ? Math.round((cardHourMinor({ id: selected.id, type: selected.type, x: selected.x, y: selected.y, stage: selected.stage as 1 | 2 | 3 }, boardCards) * 24 * INVEST_SHARE_BPS) / 10_000)
    : 0;

  const doVisit = (action: VisitAction) => {
    if (!selected) return;
    visit.mutate({ hostId: hostId!, action, buildingId: selected.id, idempotencyKey: crypto.randomUUID() });
  };

  const doInvest = () => {
    if (!selected || !amountOk) return;
    invest.mutate({ hostId: hostId!, buildingId: selected.id, amountMinor, idempotencyKey: crypto.randomUUID() });
  };

  return (
    <section className="visit-panel">
      <div className="portfolio-heading">
        <b>Visit Founders</b>
        <span>Use another founder's business — the host earns the fee</span>
      </div>

      {!hostId ? (
        <div className="position-list">
          {hosts.length === 0 && <span className="portfolio-empty">No other founders on the leaderboard yet.</span>}
          {hosts.map((entry) => (
            <div className="position-row" key={entry.playerId}>
              <div>
                <b>{entry.name}</b>
                <small>{entry.archetype ?? "unaffiliated"} · empire {entry.empireValue ?? "—"}</small>
              </div>
              <span />
              <button className="performance-claim" type="button" onClick={() => setHostId(entry.playerId)}>
                Visit
              </button>
            </div>
          ))}
        </div>
      ) : (
        <div className="visit-host">
          <div className="portfolio-heading">
            <b>{board.data?.name ?? "Founder"}</b>
            <button className="performance-claim" type="button" onClick={() => { setHostId(null); setBuildingId(null); }}>
              ← Back
            </button>
          </div>
          <div className="visit-building-list">
            {buildings.length === 0 && <span className="portfolio-empty">This founder has not placed any buildings yet.</span>}
            {buildings.map((building) => {
              const spec = CARDS[building.type];
              const usable = spec ? VISIT_ACTIONS.some((action) => visitEligible(spec.lineage, action)) : false;
              return (
                <button
                  className={`visit-building ${building.id === buildingId ? "selected" : ""}`}
                  key={building.id}
                  type="button"
                  disabled={!usable}
                  onClick={() => setBuildingId(building.id)}
                >
                  <b>{building.name}</b>
                  <small>
                    stage {building.stage} · {spec?.lineage ?? "—"}
                    {usable ? "" : " · no visit actions"}
                  </small>
                </button>
              );
            })}
          </div>

          {selected && selectedSpec && (
            <div className="visit-actions">
              {eligibleActions.map((action) => {
                const fee = visitFeeMinor(action, selectedSpec.rateBps, plot.cashMinor);
                const notional = action === "trade" ? 0 : VISIT_NOTIONAL_MINOR[action];
                return (
                  <div className="position-row" key={action}>
                    <div>
                      <b>{action}</b>
                      <small>
                        {ACTION_HINT[action]} Fee {cashLabel(fee)}
                        {notional ? ` · notional ${cashLabel(notional)}` : ""}
                      </small>
                    </div>
                    <span />
                    <button className="performance-claim" type="button" disabled={visit.isPending || plot.cashMinor <= 0} onClick={() => doVisit(action)}>
                      {plot.cashMinor <= 0 ? "No Cash" : "Pay"}
                    </button>
                  </div>
                );
              })}

              <div className="visit-invest">
                <div className="portfolio-heading">
                  <b>Invest in {selected.name}</b>
                  <span>
                    {INVEST_SHARE_BPS / 100}% of gross daily revenue · {INVEST_TERM_DAYS}-day term · principal guaranteed
                  </span>
                </div>
                <small className="settled">
                  Your Cash transfers to the host immediately (host keeps the capital). You earn {INVEST_SHARE_BPS / 100}% of this
                  building's gross each day it settles; the host repays the principal at maturity. Estimated yield ≈ {cashLabel(expectedYieldMinor)} /day.
                </small>
                <div className="portfolio-actions">
                  <input
                    className="visit-amount"
                    type="number"
                    min={INVEST_MIN_MINOR / 100}
                    max={INVEST_MAX_MINOR / 100}
                    placeholder={`${INVEST_MIN_MINOR / 100}–${INVEST_MAX_MINOR / 100} Cash`}
                    value={amount}
                    onChange={(event) => setAmount(event.target.value)}
                  />
                  <button className="performance-claim" type="button" disabled={invest.isPending || !amountOk} onClick={doInvest}>
                    Invest
                  </button>
                  <small>{amountOk ? `${cashLabel(amountMinor)} for ${INVEST_TERM_DAYS} days` : `Min ${INVEST_MIN_MINOR / 100}, max ${INVEST_MAX_MINOR / 100} Cash`}</small>
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </section>
  );
}
