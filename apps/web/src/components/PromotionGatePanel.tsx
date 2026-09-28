import type { HexBoard } from "@plotgo/shared";
import { XP_SOURCE_BASE } from "@plotgo/game";

const REQUIREMENT_LINES: { key: "ownedHexes" | "builtBusinesses" | "stage2PlusBuildings" | "uniqueStocks"; label: string }[] = [
  { key: "ownedHexes", label: "Owned parcels" },
  { key: "builtBusinesses", label: "Businesses" },
  { key: "stage2PlusBuildings", label: "Stage 2+ buildings" },
  { key: "uniqueStocks", label: "Unique stocks" },
];

/**
 * Promotion gate progress (Empire_Progression_System_v1.0): lists the active
 * gate's requirements with current/required progress and a ✓/✗ per line. When
 * every requirement is met the panel announces the pending promotion and its
 * one-time XP reward. Renders nothing when no gate is active.
 */
export function PromotionGatePanel({ board }: { board: HexBoard }) {
  const gate = board.activeGate;
  if (!gate) return null;
  const metCount = REQUIREMENT_LINES.filter(({ key }) => gate.progress[key].current >= gate.progress[key].required).length;
  return (
    <div className="promotion-gate">
      <p className="briefing-line subdued">
        Candidate level {board.candidateLevel} · displayed level held at {board.empireLevel} until the gate is crossed.
      </p>
      {REQUIREMENT_LINES.map(({ key, label }) => {
        const entry = gate.progress[key];
        const met = entry.current >= entry.required;
        return (
          <p key={key} className={`briefing-line promotion-req ${met ? "promotion-req-met" : "promotion-req-unmet"}`}>
            {label} {entry.current}/{entry.required} {met ? "✓" : "✗"}
          </p>
        );
      })}
      {gate.met ? (
        <p className="briefing-line promotion-ready">Promotion ready! Crossing the gate promotes you to {gate.promotionTo} and awards {XP_SOURCE_BASE.promotion} XP.</p>
      ) : (
        <p className="briefing-line subdued">
          {metCount}/{REQUIREMENT_LINES.length} requirements met · all are required to promote to {gate.promotionTo} at Lv {gate.requiredLevel}.
        </p>
      )}
    </div>
  );
}
