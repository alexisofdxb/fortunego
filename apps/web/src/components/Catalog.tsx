import { useState } from "react";
import { buildingUnlockLevel, CARDS, ERA_LABEL, ERA_ORDER } from "@plotgo/game";
import type { PlotSnapshot } from "@plotgo/shared";
import { X } from "lucide-react";
import { useUiStore } from "../state/ui";
import { cashLabel, CATEGORY_ART } from "../utils";

const LINEAGE_TINT: Record<string, string> = {
  bank: "#3a6ea5",
  trade: "#3f8c4f",
  broker: "#6b4c9a",
  fund: "#b0742a",
  research: "#2a8c8c",
  lend: "#a53a3a",
  insure: "#7a6a2a",
  vault: "#5a5a6a",
  wealth: "#8c6b1f",
  treasury: "#4a5a2a",
  digital: "#2a5a8c",
};

const RARITY_CLASS: Record<string, string> = {
  uncommon: "rarity-uncommon",
  rare: "rarity-rare",
  epic: "rarity-epic",
  legendary: "rarity-legendary",
};

type Status = "available" | "placed" | "locked";
type Filter = "all" | Status;
type SortKey = "level" | "cost" | "era" | "name";

const SORTS: { key: SortKey; label: string }[] = [
  { key: "level", label: "Unlock level" },
  { key: "cost", label: "Cost" },
  { key: "era", label: "Era" },
  { key: "name", label: "Name" },
];

const FILTERS: { key: Filter; label: string }[] = [
  { key: "all", label: "All" },
  { key: "available", label: "Available" },
  { key: "placed", label: "Placed" },
  { key: "locked", label: "Locked" },
];

const GROUP_META: { key: Status; label: string }[] = [
  { key: "available", label: "Available" },
  { key: "placed", label: "Placed" },
  { key: "locked", label: "Locked" },
];

function eraLabel(era: string): string {
  return (ERA_LABEL as Record<string, string>)[era] ?? era;
}

function eraRank(era: string): number {
  const i = (ERA_ORDER as readonly string[]).indexOf(era);
  return i === -1 ? 99 : i;
}

interface Entry {
  id: string;
  status: Status;
  count: number;
  firstId: string;
  unlockLevel: number | null;
  name: string;
  era: string;
  lineage: string;
  costMinor: number;
  footprint: [number, number];
  blurb: string;
  description: string;
  art: string;
  tint: string;
  netPerDay: number | null;
  moduleSlots: number;
}

/** Full-screen gallery catalog: every building (available / placed / locked) + modules. */
export function CatalogOverlay({ plot, onClose }: { plot: PlotSnapshot; onClose: () => void }) {
  const setPlaceMode = useUiStore((s) => s.setPlaceMode);
  const setInspectId = useUiStore((s) => s.setInspectId);
  const [filter, setFilter] = useState<Filter>("all");
  const [sort, setSort] = useState<SortKey>("level");

  const placedByType = new Map<string, { count: number; ids: string[] }>();
  for (const c of plot.cards) {
    const entry = placedByType.get(c.type) ?? { count: 0, ids: [] };
    entry.count += 1;
    entry.ids.push(c.id);
    placedByType.set(c.type, entry);
  }

  const entries: Entry[] = plot.catalog.map((card) => {
    const placed = placedByType.get(card.id);
    const spec = CARDS[card.id];
    const status: Status = !card.unlocked ? "locked" : placed ? "placed" : "available";
    return {
      id: card.id,
      status,
      count: placed?.count ?? 0,
      firstId: placed?.ids[0] ?? "",
      unlockLevel: buildingUnlockLevel(card.id),
      name: card.name,
      era: card.era,
      lineage: card.lineage,
      costMinor: card.placeCostMinor,
      footprint: card.footprint,
      blurb: card.blurb,
      description: card.description,
      art: CATEGORY_ART[spec?.category ?? ""] ?? "🏢",
      tint: LINEAGE_TINT[card.lineage] ?? "#5a4a2a",
      netPerDay: spec?.baseNetPerDay ?? null,
      moduleSlots: card.moduleProfile?.maxModuleSlots ?? 0,
    };
  });

  const sorters: Record<SortKey, (a: Entry, b: Entry) => number> = {
    level: (a, b) => (a.unlockLevel ?? 99) - (b.unlockLevel ?? 99) || a.name.localeCompare(b.name),
    cost: (a, b) => a.costMinor - b.costMinor,
    era: (a, b) => eraRank(a.era) - eraRank(b.era) || a.name.localeCompare(b.name),
    name: (a, b) => a.name.localeCompare(b.name),
  };

  const visible = entries.filter((e) => filter === "all" || e.status === filter).sort(sorters[sort]);
  const groups = GROUP_META.map((g) => ({ ...g, items: visible.filter((e) => e.status === g.key) })).filter(
    (g) => g.items.length > 0,
  );

  const modules = plot.modules?.inventory ?? [];

  const act = (e: Entry) => {
    if (e.status === "available") {
      setPlaceMode({ type: e.id });
      onClose();
    } else if (e.status === "placed") {
      setInspectId(e.firstId);
      onClose();
    }
  };

  return (
    <section className="catalog-overlay" role="dialog" aria-label="Catalog">
      <div className="catalog-panel">
        <header className="catalog-head">
          <h2>Catalog</h2>
          <p className="catalog-sub">Every building, module and blueprint in your empire</p>
          <button className="modal-x catalog-x" type="button" aria-label="Close" onClick={onClose}>
            <X size={18} />
          </button>
        </header>

        <div className="catalog-toolbar">
          <div className="catalog-filters" role="tablist" aria-label="Filter buildings">
            {FILTERS.map((f) => (
              <button
                key={f.key}
                type="button"
                role="tab"
                aria-selected={filter === f.key}
                className={`catalog-filter${filter === f.key ? " active" : ""}`}
                onClick={() => setFilter(f.key)}
              >
                {f.label}
              </button>
            ))}
          </div>
          <label className="catalog-sort">
            Sort
            <select value={sort} onChange={(e) => setSort(e.target.value as SortKey)}>
              {SORTS.map((s) => (
                <option key={s.key} value={s.key}>
                  {s.label}
                </option>
              ))}
            </select>
          </label>
        </div>

        <div className="catalog-body">
          {groups.length === 0 ? <p className="catalog-empty">Nothing in this category yet.</p> : null}
          {groups.map((group) => (
            <section key={group.key} className="catalog-group">
              <header className="catalog-group-head">
                <h3>{group.label}</h3>
                <span className="catalog-count">{group.items.length}</span>
              </header>
              <div className="cat-track">
                {group.items.map((e) => (
                  <button
                    type="button"
                    key={e.id}
                    className={`cat-card st-${e.status}`}
                    onClick={() => act(e)}
                    aria-label={`${e.name} — ${group.label}`}
                  >
                    <span className="cat-cost">💵 {cashLabel(e.costMinor)}</span>
                    <span className={`cat-ribbon rib-${e.status}`}>
                      {e.status === "available" ? "New" : e.status === "placed" ? `✓ ×${e.count}` : `🔒 Lv ${e.unlockLevel ?? "?"}`}
                    </span>
                    <span className="cat-art" style={{ background: `radial-gradient(circle at 50% 35%, ${e.tint}55, ${e.tint}18 70%, transparent)` }}>
                      <span aria-hidden="true">{e.art}</span>
                      <em>{eraLabel(e.era)}</em>
                    </span>
                    <span className="cat-name">{e.name}</span>
                    <span className="cat-cap">
                      {e.footprint[0]}×{e.footprint[1]}
                    </span>
                    <span className="cat-tip" role="tooltip">
                      <b>{e.name}</b>
                      <small>
                        {eraLabel(e.era)} · {e.lineage} · unlocks Lv {e.unlockLevel ?? "?"}
                      </small>
                      <span className="cat-tip-desc">{e.blurb || e.description}</span>
                      <span className="cat-tip-stats">
                        {e.netPerDay != null ? <i>${e.netPerDay}/day base</i> : null}
                        <i>{cashLabel(e.costMinor)}</i>
                        {e.moduleSlots > 0 ? <i>{e.moduleSlots} module slots</i> : null}
                      </span>
                    </span>
                  </button>
                ))}
              </div>
            </section>
          ))}

          <section className="catalog-group">
            <header className="catalog-group-head">
              <h3>Modules</h3>
              <span className="catalog-count">{modules.length}</span>
            </header>
            {modules.length === 0 ? (
              <p className="catalog-empty">No modules yet — craft them from parts.</p>
            ) : (
              <div className="cat-track">
                {modules.map((m) => (
                  <div key={m.moduleId} className={`cat-card mod ${RARITY_CLASS[m.rarity] ?? ""}`}>
                    <span className="cat-cost">×{m.quantityAvailable}</span>
                    <span className={`cat-ribbon rib-mod ${RARITY_CLASS[m.rarity] ?? ""}`}>{m.rarity}</span>
                    <span className="cat-art mod-art">
                      <span aria-hidden="true">🧩</span>
                      <em>{m.category}</em>
                    </span>
                    <span className="cat-name">{m.name}</span>
                    <span className="cat-tip" role="tooltip">
                      <b>{m.name}</b>
                      <small>
                        {m.rarity} · {m.category}
                      </small>
                      <span className="cat-tip-desc">{m.primaryPower}</span>
                      <span className="cat-tip-stats">
                        {m.quantityEquipped > 0 ? <i>{m.quantityEquipped} equipped</i> : null}
                        <i>×{m.quantityAvailable} available</i>
                      </span>
                    </span>
                  </div>
                ))}
              </div>
            )}
          </section>
          {plot.modules && plot.modules.parts.length > 0 ? (
            <p className="catalog-parts">
              Parts: {plot.modules.parts.map((p) => `${p.rarity} ${p.balance}`).join(" · ")}
            </p>
          ) : null}
        </div>
      </div>
    </section>
  );
}
