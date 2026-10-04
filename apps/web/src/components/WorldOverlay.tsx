import { useEffect, useMemo, useState } from "react";
import { WORLD_CELLS, WORLD_HEX_SIZE, WORLD_VIEW, worldHexCorners } from "@plotgo/game";
import type { PlotSnapshot } from "@plotgo/shared";
import { ChevronLeft, X } from "lucide-react";
import { useVisitWorld, useWorldMap } from "../api/hooks";

type RegionView = {
  id: string;
  q: number;
  r: number;
  ring: number;
  label: string;
  ownerId: string | null;
  name: string | null;
  empireLevel: number | null;
  presence: string;
  you: boolean;
};

/** Full-screen world map — founders occupy hex regions; visit means travel. */
export function WorldOverlay({ plot, onClose }: { plot: PlotSnapshot; onClose: () => void }) {
  const world = useWorldMap();
  const travel = useVisitWorld();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const regions = (world.data as { regions?: RegionView[]; you?: { regionId: string } } | undefined)?.regions ?? [];
  const byId = useMemo(() => new Map(regions.map((region) => [region.id, region])), [regions]);
  const selected = selectedId ? byId.get(selectedId) ?? null : null;
  const youId = (world.data as { you?: { regionId: string } } | undefined)?.you?.regionId;

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <section className="world-overlay" role="dialog" aria-label="World map">
      <div className="world-page">
        <header className="world-head">
          <button type="button" className="events-back" onClick={onClose} aria-label="Close world">
            <ChevronLeft size={22} strokeWidth={2.4} />
            <b>World</b>
          </button>
          <span className="events-week-chip">
            {regions.filter((region) => region.ownerId).length} cities · {plot.playerId.slice(0, 6)}
          </span>
          <button className="events-close" type="button" aria-label="Close" onClick={onClose}>
            <X size={16} />
          </button>
        </header>

        <div className="world-body">
          <svg
            className="world-map"
            viewBox={`${WORLD_VIEW.minX} ${WORLD_VIEW.minY} ${WORLD_VIEW.width} ${WORLD_VIEW.height}`}
          >
            {WORLD_CELLS.map((cell) => {
              const region = byId.get(cell.id);
              const pts = worldHexCorners(cell.x, cell.y, WORLD_HEX_SIZE - 1.5);
              const d = `M${pts.map((p) => p.join(",")).join("L")}Z`;
              const cls = [
                "world-hex",
                region?.you ? "you" : "",
                region?.ownerId && !region.you ? "occupied" : "",
                !region?.ownerId ? "empty" : "",
                selectedId === cell.id ? "selected" : "",
                region?.presence === "online" ? "online" : "",
              ]
                .filter(Boolean)
                .join(" ");
              return (
                <g key={cell.id} className={cls} onClick={() => setSelectedId(cell.id)}>
                  <path d={d} />
                  <text x={cell.x} y={cell.y + 4} textAnchor="middle">
                    {region?.you ? "You" : region?.label ?? cell.label}
                  </text>
                </g>
              );
            })}
          </svg>

          <aside className="world-detail">
            {selected ? (
              <>
                <small>{selected.label}</small>
                <h3>{selected.you ? "Your city" : selected.name ?? "Unclaimed region"}</h3>
                {selected.ownerId ? (
                  <p>
                    Empire Lv {selected.empireLevel ?? "—"}
                    {selected.presence === "online" ? " · Online" : " · Away"}
                  </p>
                ) : (
                  <p>No founder has claimed this land yet.</p>
                )}
                {selected.ownerId && !selected.you ? (
                  <button
                    type="button"
                    className="claim"
                    disabled={travel.isPending}
                    onClick={() => travel.mutate(selected.id)}
                  >
                    Visit city
                  </button>
                ) : null}
                {selected.you ? <p className="world-hint">Other founders travel here to visit you.</p> : null}
              </>
            ) : (
              <>
                <h3>Choose a region</h3>
                <p>
                  Every founder occupies one hex on this world. Tap a claimed city to travel there.
                  {youId ? ` You are ${byId.get(youId)?.label ?? youId}.` : ""}
                </p>
              </>
            )}
          </aside>
        </div>
      </div>
    </section>
  );
}
