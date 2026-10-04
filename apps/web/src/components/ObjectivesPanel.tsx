import { useEffect, useRef } from "react";
import type { PlotSnapshot } from "@plotgo/shared";
import { useObjectiveReroll } from "../api/hooks";
import { useUiStore } from "../state/ui";
import { cashLabel } from "../utils";
import { audio } from "../audio";

const LANE_LABEL: Record<string, string> = { operations: "Operations", growth: "Growth", market: "Market" };

/**
 * Daily business objectives — three lanes (Operations / Growth / Market).
 * Completion is validated from authoritative gameplay evidence server-side and
 * pays Cash automatically; the panel only reports state (spec sheet 07).
 */
export function ObjectivesPanel({ plot }: { plot: PlotSnapshot }) {
  const reroll = useObjectiveReroll();
  const setToast = useUiStore((s) => s.setToast);
  const objectives = plot.objectives;
  const toastedRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    for (const lane of objectives?.lanes ?? []) {
      const key = `${objectives?.day}:${lane.lane}:${lane.templateId}`;
      if (lane.status === "complete" && !toastedRef.current.has(key)) {
        toastedRef.current.add(key);
        audio.play("objective_done");
        setToast(`Objective complete — ${lane.title}: ${cashLabel(lane.rewardMinor)} Cash paid.`);
      }
    }
  }, [objectives, setToast]);

  if (!objectives) return null;

  const complete = objectives.lanes.filter((lane) => lane.status === "complete").length;
  return (
    <div className="objectives-list">
      {objectives.lanes.map((lane) => {
        const pct = Math.min(100, Math.round((lane.progress.current / Math.max(1, lane.progress.target)) * 100));
        const stateLabel = lane.status === "complete" ? "Complete" : lane.status === "expired" ? "Expired" : "Active";
        return (
          <div className={`objective-lane ${lane.status}`} key={lane.lane}>
            <div className="objective-lane-head">
              <b>{LANE_LABEL[lane.lane] ?? lane.lane}</b>
              <span className={`objective-state ${lane.status}`}>{stateLabel}</span>
            </div>
            <p className="objective-title">{lane.title}</p>
            <small className="objective-desc">{lane.description}</small>
            <div className="objective-progress">
              <div className="bar">
                <i style={{ width: `${pct}%` }} />
              </div>
              <span>
                {Math.min(lane.progress.current, lane.progress.target).toLocaleString()} / {lane.progress.target.toLocaleString()}
              </span>
            </div>
            <div className="objective-foot">
              <span className="objective-reward">Reward {cashLabel(lane.rewardMinor)} Cash</span>
              <button
                className="verb objective-reroll"
                type="button"
                disabled={!objectives.rerollAvailable || lane.status !== "active" || reroll.isPending}
                title={objectives.rerollAvailable ? "Reroll this lane (1 per day, shared across lanes)" : "Daily reroll already used"}
                onClick={() => reroll.mutate({ lane: lane.lane })}
              >
                Reroll
              </button>
            </div>
          </div>
        );
      })}
      <small className="settled">
        {complete}/3 complete today · Cash-only rewards · Objectives expire at the daily reset with no debt or catch-up.
      </small>
    </div>
  );
}
