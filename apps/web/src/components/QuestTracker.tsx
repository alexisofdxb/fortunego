import { buildingUnlockLevel, XP_SOURCE_BASE } from "@plotgo/game";
import type { PlotSnapshot } from "@plotgo/shared";
import { useOnboardingSkip } from "../api/hooks";
import { cashLabel } from "../utils";
import { useUiStore } from "../state/ui";
import { audio } from "../audio";

/**
 * Compact quest tracker (right-side floating panel): onboarding quest, daily
 * objectives, and the pending promotion gate — dark translucent card, gold
 * headers, diamond bullets, toggled from the quest icon.
 */
export function QuestTracker({ plot }: { plot: PlotSnapshot }) {
  const open = useUiStore((s) => s.questOpen);
  const skip = useOnboardingSkip();
  const setQuestOpen = useUiStore((s) => s.setQuestOpen);
  if (!open) return null;

  const close = () => setQuestOpen(false);
  const objectives = plot.objectives;
  const gate = plot.hexBoard.activeGate;
  const onboarding = plot.onboarding && plot.onboarding.status === "active" ? plot.onboarding : null;

  // What's next: nearest locked buildings + nearest level-gated parcels.
  const nextBuildings = plot.catalog
    .filter((c) => !c.unlocked)
    .map((c) => ({ card: c, level: buildingUnlockLevel(c.id) ?? 99 }))
    .filter((e) => e.level > plot.empireLevel)
    .sort((a, b) => a.level - b.level || a.card.placeCostMinor - b.card.placeCostMinor)
    .slice(0, 3);
  const nextLand = plot.hexBoard.hexes
    .filter((h) => !h.owned && h.requiredLevel > plot.empireLevel)
    .sort((a, b) => a.requiredLevel - b.requiredLevel || a.priceMinor - b.priceMinor)
    .slice(0, 2);

  return (
    <aside className="quest-tracker" role="dialog" aria-label="Quests">
      <header className="quest-head">
        <b>Quests</b>
        <button type="button" className="quest-close" aria-label="Close quests" onClick={close}>
          ×
        </button>
      </header>

      {plot.hexBoard.xpForNextLevel > 0 ? (
        <section className="quest-section">
          <h3>Reach Lv {plot.hexBoard.empireLevel + 1}</h3>
          <ul>
            <li>
              <i />
              <span>
                {plot.hexBoard.xpForNextLevel.toLocaleString()} XP to go
                <em>
                  {plot.hexBoard.empireXp.toLocaleString()} /{" "}
                  {(plot.hexBoard.empireXp + plot.hexBoard.xpForNextLevel).toLocaleString()}
                </em>
              </span>
            </li>
            <li>
              <i />
              <span>
                Market Hunt
                <em>+{XP_SOURCE_BASE.hunt} XP</em>
              </span>
            </li>
            <li>
              <i />
              <span>
                Daily objective
                <em>+{XP_SOURCE_BASE.dailyObjective} XP</em>
              </span>
            </li>
            <li>
              <i />
              <span>
                Place a business
                <em>+{XP_SOURCE_BASE.construction} XP</em>
              </span>
            </li>
            <li>
              <i />
              <span>
                Upgrade a building
                <em>+{XP_SOURCE_BASE.stage2Upgrade}–{XP_SOURCE_BASE.stage3Upgrade} XP</em>
              </span>
            </li>
          </ul>
        </section>
      ) : null}

      {onboarding ? (
        <section className="quest-section">
          <h3>{onboarding.guide?.title ?? "Getting Started"}</h3>
          <ul>
            <li>
              <i />
              <span>{onboarding.guide?.prompt ?? "Follow the guide to establish your first businesses."}</span>
            </li>
          </ul>
          <button
            type="button"
            className="quest-skip"
            disabled={skip.isPending}
            onClick={() => skip.mutate(undefined, { onSuccess: close })}
          >
            Skip guided onboarding
          </button>
        </section>
      ) : null}

      {objectives ? (
        <section className="quest-section">
          <h3>Daily Operations</h3>
          <ul>
            {objectives.lanes.map((lane) => (
              <li key={lane.lane} className={lane.status === "complete" ? "done" : ""}>
                <i />
                <span>
                  {lane.title}
                  <em>
                    {lane.progress.current}/{lane.progress.target}
                  </em>
                </span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <section className="quest-section">
        <h3>Next Unlocks</h3>
        <ul>
          {nextBuildings.map(({ card, level }) => (
            <li key={card.id}>
              <i />
              <span>
                {card.name}
                <em>Lv {level}</em>
              </span>
            </li>
          ))}
          {nextLand.map((h) => (
            <li key={h.hexId}>
              <i />
              <span>
                Parcel #{h.hexId} — {h.grade}
                <em>
                  Lv {h.requiredLevel} · {h.priceMinor > 0 ? cashLabel(h.priceMinor) : "deed"}
                </em>
              </span>
            </li>
          ))}
          {nextBuildings.length === 0 && nextLand.length === 0 ? (
            <li className="done">
              <i />
              <span>Everything at your level is unlocked — expand your frontier 🔓</span>
            </li>
          ) : null}
        </ul>
      </section>

      {gate ? (
        <section className="quest-section">
          <h3>Promotion — {gate.promotionTo}</h3>
          <ul>
            {(
              [
                ["ownedHexes", "Owned parcels"],
                ["builtBusinesses", "Businesses built"],
                ["stage2PlusBuildings", "Stage 2+ buildings"],
                ["uniqueStocks", "Unique stocks"],
              ] as const
            ).map(([key, label]) => {
              const req = gate.progress[key];
              const met = req.current >= req.required;
              return (
                <li key={key} className={met ? "done" : ""}>
                  <i />
                  <span>
                    {label}
                    <em>
                      {req.current}/{req.required}
                    </em>
                  </span>
                </li>
              );
            })}
          </ul>
        </section>
      ) : null}

      {!onboarding && !objectives && !gate ? (
        <p className="quest-empty">No active quests — settle a day to receive new objectives.</p>
      ) : null}
    </aside>
  );
}

/** Quest icon button (header): shows a count badge of unfinished quest items. */
export function QuestToggle({ plot }: { plot: PlotSnapshot }) {
  const open = useUiStore((s) => s.questOpen);
  const setQuestOpen = useUiStore((s) => s.setQuestOpen);
  const objectives = plot.objectives;
  const gate = plot.hexBoard.activeGate;
  let pending = objectives ? objectives.lanes.filter((l) => l.status !== "complete").length : 0;
  if (plot.onboarding?.status === "active") pending += 1;
  if (gate && !gate.met) pending += 1;
  return (
    <button
      type="button"
      className={`quest-toggle${open ? " active" : ""}`}
      title="Quests"
      onClick={() => {
        audio.play("ui_tap");
        audio.play(open ? "drawer_close" : "drawer_open");
        setQuestOpen(!open);
      }}
    >
      📜
      {pending > 0 ? <span className="quest-count">{pending}</span> : null}
    </button>
  );
}
