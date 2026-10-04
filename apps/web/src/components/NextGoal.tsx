import { CARDS, STAGE_LABEL, XP_SOURCE_BASE } from "@plotgo/game";
import type { PlotSnapshot } from "@plotgo/shared";
import { useUiStore } from "../state/ui";
import { tutorialFinished } from "./Tutorial";

type Goal = {
  action: string;
  detail: string;
  dock: string | null;
};

function pickGoal(plot: PlotSnapshot): Goal {
  const hunts = plot.hunts ?? (plot.hunt ? [plot.hunt] : []);
  const ready = hunts.find((h) => h.started && h.ready && !h.claimed);
  if (ready) {
    return {
      action: "Claim your Market Hunt",
      detail: `+${XP_SOURCE_BASE.hunt} XP · tap the purple Hunt banner`,
      dock: "hunts",
    };
  }
  const active = hunts.find((h) => h.started && !h.claimed);
  if (active) {
    return {
      action: `Finish: ${active.title}`,
      detail: `${active.progress.current}/${active.progress.target} · +${XP_SOURCE_BASE.hunt} XP`,
      dock: "hunts",
    };
  }
  const offers = plot.huntOffers ?? hunts.filter((h) => !h.started);
  if (offers.length > 0) {
    return {
      action: "Start a Market Hunt",
      detail: `${offers.length} offers ready · +${XP_SOURCE_BASE.hunt} XP each`,
      dock: "hunts",
    };
  }
  const lane = plot.objectives?.lanes.find((l) => l.status !== "complete");
  if (lane) {
    return {
      action: lane.title,
      detail: `Daily objective · +${XP_SOURCE_BASE.dailyObjective} XP · tap the gold banner`,
      dock: "objectives",
    };
  }
  const board = plot.hexBoard;
  const acquirable = board.hexes.find(
    (h) => !h.owned && h.frontier && h.requiredLevel <= board.empireLevel && board.ownedCount < board.capacityForLevel,
  );
  if (acquirable) {
    return {
      action: `Claim parcel ${acquirable.parcelId ?? acquirable.hexId}`,
      detail: `+${XP_SOURCE_BASE.land} XP · tap the unlocked 🔓 hex`,
      dock: null,
    };
  }
  const hasFree = board.hexes.some((h) => h.owned && !plot.cards.some((c) => c.hexId === h.hexId));
  if (hasFree) {
    return {
      action: "Place another business",
      detail: `+${XP_SOURCE_BASE.construction} XP · drag a card onto an empty parcel you own`,
      dock: "catalog",
    };
  }
  const up = plot.cards.find((c) => c.stage < 3);
  if (up) {
    const spec = CARDS[up.type];
    const next = (up.stage + 1) as 2 | 3;
    const xp = up.stage === 1 ? XP_SOURCE_BASE.stage2Upgrade : XP_SOURCE_BASE.stage3Upgrade;
    return {
      action: `Upgrade ${spec?.name ?? "building"} to ${STAGE_LABEL[next]}`,
      detail: `+${xp} XP · tap the building, then Upgrade`,
      dock: null,
    };
  }
  if (!plot.session) {
    return {
      action: "Close the day",
      detail: "Tap 🌙 Close Day in the header to collect cash",
      dock: null,
    };
  }
  return {
    action: "You're caught up for today",
    detail: "New hunts and objectives arrive after UTC midnight",
    dock: null,
  };
}

/** Always-on “what do I do now” plaque — XP to next level + one concrete action. */
export function NextGoal({ plot }: { plot: PlotSnapshot }) {
  const questOpen = useUiStore((s) => s.questOpen);
  const toggle = useUiStore((s) => s.toggleSection);
  const setQuestOpen = useUiStore((s) => s.setQuestOpen);
  if (questOpen || !tutorialFinished(plot.playerId)) return null;

  const board = plot.hexBoard;
  if (board.xpForNextLevel <= 0) return null;

  const nextLevel = board.empireLevel + 1;
  const nextAt = board.empireXp + board.xpForNextLevel;
  const pct = nextAt > 0 ? Math.min(100, Math.round((board.empireXp / nextAt) * 100)) : 100;
  const goal = pickGoal(plot);

  return (
    <aside className="goal-card" aria-label="Next goal">
      <header className="goal-head">
        <b>Reach Lv {nextLevel}</b>
        <span>
          {board.xpForNextLevel.toLocaleString()} XP to go
        </span>
      </header>
      <div className="goal-bar" aria-hidden>
        <i style={{ width: `${pct}%` }} />
      </div>
      <p className="goal-xp">
        {board.empireXp.toLocaleString()} / {nextAt.toLocaleString()} XP
      </p>
      <button
        type="button"
        className="goal-action"
        onClick={() => (goal.dock ? toggle(`dock-${goal.dock}`) : setQuestOpen(true))}
      >
        {goal.action}
      </button>
      <p className="goal-detail">{goal.detail}</p>
    </aside>
  );
}
