import { cashLabel, GRADE_CLASS } from "../utils";
import { useAcquireLand, useLandView } from "../api/hooks";
import type { HexBoard as HexBoardDto } from "@plotgo/shared";

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

/**
 * Right-side parcel drawer: full hex info (grade, coordinates, zone, price,
 * required level, all eight attributes + adjacency/LVI) and the acquire
 * action, gated on empire level (and frontier reachability).
 */
export function HexDrawer({ board, hexId, onClose }: { board: HexBoardDto; hexId: string; onClose: () => void }) {
  const hex: BoardHex | undefined = board.hexes.find((h) => h.hexId === hexId);
  const land = useLandView();
  const acquire = useAcquireLand();
  if (!hex) return null;

  const attrs = (land.data?.hexes.find((h) => h.hexId === hexId)?.attributes ?? null) as Record<string, number> | null;
  const zone = typeof attrs?.zone === "string" ? attrs.zone : null;
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

  return (
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

      <h2 className="hex-drawer-title">Parcel {hex.parcelId ?? `#${hex.hexId}`}</h2>
      {zone ? <p className="hex-drawer-zone">{zone}</p> : null}

      <dl className="hex-drawer-stats">
        <div>
          <dt>Status</dt>
          <dd>{owned ? "Owned" : hex.frontier ? "Frontier" : "Unreached"}</dd>
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
      {!owned && levelMet && !hex.frontier ? <p className="hex-drawer-hint">Expand from a parcel you own to reach this land.</p> : null}
    </aside>
  );
}
