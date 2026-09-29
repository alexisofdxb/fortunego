import type { PlotSnapshot } from "@plotgo/shared";
import { useOnboardingSkip } from "../api/hooks";
import { useUiStore } from "../state/ui";

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

  return (
    <aside className="quest-tracker" role="dialog" aria-label="Quests">
      <header className="quest-head">
        <b>Quests</b>
        <button type="button" className="quest-close" aria-label="Close quests" onClick={close}>
          ×
        </button>
      </header>

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
      onClick={() => setQuestOpen(!open)}
    >
      📜
      {pending > 0 ? <span className="quest-count">{pending}</span> : null}
    </button>
  );
}
