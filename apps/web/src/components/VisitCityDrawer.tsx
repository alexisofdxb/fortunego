import { useState } from "react";
import { createPortal } from "react-dom";
import {
  CARDS,
  INVEST_MAX_MINOR,
  INVEST_MIN_MINOR,
  INVEST_SHARE_BPS,
  stageMul,
  visitEligible,
  visitFeeMinor,
  VISIT_ACTIONS,
  type VisitAction,
} from "@plotgo/game";
import type { PlotSnapshot } from "@plotgo/shared";
import { useInvest, useVisit } from "../api/hooks";
import { useUiStore } from "../state/ui";
import { cashLabel } from "../utils";

const ACTION_HINT: Record<VisitAction, string> = {
  trade: "Pay a fee. The host earns the commission.",
  deposit: "Fee plus a notional that returns at your next Close Day.",
  borrow: "Fee plus a notional that repays at your next Close Day.",
};

export function VisitCityDrawer({
  plot,
  hexId,
  onClose,
}: {
  plot: PlotSnapshot;
  hexId: string;
  onClose: () => void;
}) {
  const visitMode = useUiStore((s) => s.visitMode);
  const visit = useVisit();
  const invest = useInvest();
  const [amount, setAmount] = useState("100");
  if (!visitMode) return null;
  const building = visitMode.buildings.find((item) => item.hexId === hexId);
  const spec = building ? CARDS[building.type] : null;
  const parcel = plot.hexBoard.hexes.find((hex) => hex.hexId === hexId)?.parcelId ?? hexId;

  if (!building || !spec) {
    return createPortal(
      <aside className="hex-drawer" role="dialog" aria-label={`Parcel ${parcel}`}>
        <header className="hex-drawer-head">
          <span className="hex-drawer-coords">{parcel}</span>
          <button type="button" className="hex-drawer-close" onClick={onClose}>
            ×
          </button>
        </header>
        <h2 className="hex-drawer-title">{parcel}</h2>
        <p className="hex-drawer-zone">Empty plot in {visitMode.name}&apos;s city.</p>
      </aside>,
      document.body,
    );
  }

  const eligible = VISIT_ACTIONS.filter((action) => visitEligible(spec.lineage, action));
  const amountMinor = Math.round(Number(amount || "0") * 100);
  const amountOk = Number.isFinite(amountMinor) && amountMinor >= INVEST_MIN_MINOR && amountMinor <= INVEST_MAX_MINOR;
  const expected =
    Math.round((spec.baseNetPerDay * 100 * stageMul(building.stage as 1 | 2 | 3) * INVEST_SHARE_BPS) / 10_000);

  return createPortal(
    <aside className="hex-drawer" role="dialog" aria-label={spec.name}>
      <header className="hex-drawer-head">
        <span className="hex-drawer-coords">
          {spec.category} · visiting {visitMode.regionLabel}
        </span>
        <button type="button" className="hex-drawer-close" onClick={onClose}>
          ×
        </button>
      </header>
      <h2 className="hex-drawer-title">{spec.name}</h2>
      <p className="hex-drawer-zone">
        {visitMode.name}&apos;s {parcel} · stage {building.stage}
      </p>
      <dl className="hex-drawer-stats">
        <div>
          <dt>Expected / day</dt>
          <dd>{cashLabel(expected)}</dd>
        </div>
      </dl>
      {eligible.length ? (
        <div className="event-choices">
          {eligible.map((action) => (
            <button
              key={action}
              type="button"
              className="verb"
              title={ACTION_HINT[action]}
              disabled={visit.isPending}
              onClick={() =>
                visit.mutate({
                  hostId: visitMode.hostId,
                  action,
                  buildingId: building.id,
                  idempotencyKey: crypto.randomUUID(),
                })
              }
            >
              {action} · {cashLabel(visitFeeMinor(action, spec.rateBps, plot.cashMinor))}
            </button>
          ))}
        </div>
      ) : (
        <p className="hex-drawer-hint">This building does not take visits. You can still invest.</p>
      )}
      <div className="hex-plot-strip">
        <b>Invest</b>
        <input
          className="hex-invest-input"
          type="number"
          min={INVEST_MIN_MINOR / 100}
          max={INVEST_MAX_MINOR / 100}
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
        />
        <button
          type="button"
          className="hex-drawer-buy"
          disabled={!amountOk || invest.isPending}
          onClick={() =>
            invest.mutate({
              hostId: visitMode.hostId,
              buildingId: building.id,
              amountMinor,
              idempotencyKey: crypto.randomUUID(),
            })
          }
        >
          Invest {cashLabel(amountMinor)}
        </button>
      </div>
    </aside>,
    document.body,
  );
}
