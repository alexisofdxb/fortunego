import { useEffect } from "react";
import { createPortal } from "react-dom";
import { CARDS, STAGE_LABEL, resolveType, stageMul } from "@plotgo/game";
import type { HexBoard as HexBoardDto, PlotSnapshot } from "@plotgo/shared";
import { cashLabel, CATEGORY_ART, GRADE_CLASS } from "../utils";
import { useAcquireLand, useLandView } from "../api/hooks";
import { audio } from "../audio";

type BoardHex = HexBoardDto["hexes"][number];

const ATTRIBUTE_ROWS: { key: string; label: string }[] = [
  { key: "commerce", label: "Commerce" },
  { key: "footfall", label: "Footfall" },
  { key: "road", label: "Road Access" },
  { key: "prestige", label: "Prestige" },
  { key: "capital", label: "Capital Access" },
  { key: "data", label: "Data / Talent" },
  { key: "security", label: "Security" },
  { key: "amenity", label: "Amenity" },
  { key: "adjacency", label: "Adjacency Potential" },
];

const METHOD_LABEL: Record<string, string> = {
  starter_grant: "Starter Grant",
  frontier_deed: "Frontier Deed",
  cash_purchase: "Cash Purchase",
};

function cashDay(dollars: number): string {
  const rounded = Math.round(dollars * 100) / 100;
  return `$${rounded.toLocaleString(undefined, {
    minimumFractionDigits: Number.isInteger(rounded) ? 0 : 2,
    maximumFractionDigits: 2,
  })}`;
}

function statusLabel(hex: BoardHex): string {
  if (hex.owned) return "Owned";
  if (hex.frontier) return "Frontier";
  return "Unreached";
}

/**
 * Right-edge inspect drawer. Empty parcels show land stats and acquire.
 * Occupied parcels lead with the building (expected vs current daily earn)
 * and keep a compact strip for the plot underneath.
 */
export function HexDrawer({ plot, hexId, onClose }: { plot: PlotSnapshot; hexId: string; onClose: () => void }) {
  const board = plot.hexBoard;
  const hex: BoardHex | undefined = board.hexes.find((h) => h.hexId === hexId);
  const land = useLandView();
  const acquire = useAcquireLand();
  useEffect(() => {
    audio.play("parcel_open");
    return () => audio.play("drawer_close");
  }, [hexId]);
  if (!hex) return null;

  const attrs = (land.data?.hexes.find((h) => h.hexId === hexId)?.attributes ?? null) as Record<string, number> | null;
  const zone = typeof attrs?.zone === "string" ? attrs.zone : null;
  const card = plot.cards.find((c) => c.hexId === hexId);

  if (card) {
    const spec = CARDS[resolveType(card.type)];
    const stageMultiplier = stageMul(card.stage);
    const expectedDay = spec ? spec.baseNetPerDay * stageMultiplier : 0;
    const revenue = plot.attributes.revenue.find((item) => item.buildingId === card.id);
    const currentDay = (revenue?.amountMinor ?? 0) / 100;
    const art = CATEGORY_ART[spec?.category ?? ""] ?? "🏢";
    const parcel = hex.parcelId ?? hex.hexId;

    return createPortal(
      <aside className="hex-drawer" role="dialog" aria-label={spec?.name ?? card.type}>
        <header className="hex-drawer-head">
          <span className="hex-drawer-art" aria-hidden>
            {art}
          </span>
          <span className="hex-drawer-coords">
            {spec?.category ?? "Building"} · {STAGE_LABEL[card.stage]}
          </span>
          <button type="button" className="hex-drawer-close" aria-label="Close" onClick={onClose}>
            ×
          </button>
        </header>

        <h2 className="hex-drawer-title">{spec?.name ?? card.type}</h2>
        {spec?.description ? <p className="hex-drawer-zone">{spec.description}</p> : null}

        <dl className="hex-drawer-earn">
          <div>
            <dt>Expected / day</dt>
            <dd>{cashDay(expectedDay)}</dd>
            <small>
              base {cashDay(spec?.baseNetPerDay ?? 0)} · stage ×{stageMultiplier}
            </small>
          </div>
          <div className="current">
            <dt>Current / day</dt>
            <dd>{cashDay(currentDay)}</dd>
            <small>{revenue ? revenue.model : "Last settle"}</small>
          </div>
        </dl>

        <dl className="hex-drawer-stats">
          <div>
            <dt>Stage</dt>
            <dd>
              {card.stage} / 3 · {STAGE_LABEL[card.stage]}
            </dd>
          </div>
          <div>
            <dt>Revenue model</dt>
            <dd>{revenue?.model ?? "service"}</dd>
          </div>
        </dl>

        <h3 className="hex-drawer-subhead">Plot</h3>
        <div className="hex-plot-strip">
          <b>{parcel}</b>
          {zone ? <span>{zone}</span> : null}
          <small>
            {statusLabel(hex)} · LVI {hex.lvi.toFixed(1)} · Ring {hex.ring ?? "—"}
          </small>
        </div>
      </aside>,
      document.body,
    );
  }

  const levelMet = hex.requiredLevel <= board.empireLevel;
  const owned = hex.owned;
  const priceLabel = hex.priceMinor <= 0 ? "Free deed" : `${cashLabel(hex.priceMinor)} Cash`;
  let action: { label: string; disabled: boolean; run?: () => void };
  if (owned) action = { label: `Owned · ${METHOD_LABEL[hex.acquisitionMethod ?? ""] ?? "Acquired"}`, disabled: true };
  else if (!levelMet) action = { label: `🔒 Requires Empire Level ${hex.requiredLevel}`, disabled: true };
  else if (!hex.frontier) action = { label: "Not on your frontier", disabled: true };
  else
    action = {
      label: hex.priceMinor <= 0 ? "Claim deed" : `Acquire · ${cashLabel(hex.priceMinor)}`,
      disabled: acquire.isPending,
      run: () => acquire.mutate(hex.hexId, { onSuccess: onClose }),
    };

  return createPortal(
    <aside className="hex-drawer" role="dialog" aria-label={`Parcel ${hex.parcelId ?? hex.hexId}`}>
      <header className="hex-drawer-head">
        <span className={`land-grade ${GRADE_CLASS[hex.grade ?? ""] ?? "grade-entry"}`}>{hex.grade ?? "Ungraded"}</span>
        <span className="hex-drawer-coords">
          {hex.cx}, {hex.cy}
        </span>
        <button type="button" className="hex-drawer-close" aria-label="Close" onClick={onClose}>
          ×
        </button>
      </header>

      <h2 className="hex-drawer-title">{hex.parcelId ?? hex.hexId}</h2>
      {zone ? <p className="hex-drawer-zone">{zone}</p> : null}

      <dl className="hex-drawer-stats">
        <div>
          <dt>Status</dt>
          <dd>{statusLabel(hex)}</dd>
        </div>
        <div>
          <dt>Ring</dt>
          <dd>{hex.ring ?? "—"}</dd>
        </div>
        <div>
          <dt>Land Value</dt>
          <dd>{hex.lvi.toFixed(1)}</dd>
        </div>
        <div>
          <dt>Price</dt>
          <dd>{owned ? "—" : priceLabel}</dd>
        </div>
        <div>
          <dt>Required Level</dt>
          <dd>{hex.requiredLevel}</dd>
        </div>
        <div>
          <dt>Acquisition</dt>
          <dd>{owned ? METHOD_LABEL[hex.acquisitionMethod ?? ""] ?? "—" : hex.priceMinor <= 0 ? "Deed grant" : "Cash purchase"}</dd>
        </div>
      </dl>

      <h3 className="hex-drawer-subhead">Attributes</h3>
      <ul className="hex-drawer-attrs">
        {ATTRIBUTE_ROWS.map(({ key, label }) => {
          const value = attrs?.[key];
          const shown = typeof value === "number" ? value : 0;
          return (
            <li key={key}>
              <span className="attr-label">{label}</span>
              <span className="attr-track">
                <i style={{ width: `${Math.max(0, Math.min(100, shown))}%` }} />
              </span>
              <span className="attr-value">{typeof value === "number" ? value : "—"}</span>
            </li>
          );
        })}
      </ul>

      <button type="button" className="hex-drawer-buy" disabled={action.disabled} onClick={action.run}>
        {action.label}
      </button>
      {!owned && !levelMet ? (
        <p className="hex-drawer-hint">Reach Empire Level {hex.requiredLevel} to claim this parcel.</p>
      ) : null}
    </aside>,
    document.body,
  );
}
