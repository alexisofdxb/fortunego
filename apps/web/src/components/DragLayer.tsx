import { CARDS, ERA_LABEL } from "@plotgo/game";
import { useUiStore } from "../state/ui";
import { cashLabel } from "../utils";

/** Floating ghost card + gold arc traced from the hand while dragging. */
export function DragLayer() {
  const drag = useUiStore((s) => s.drag);
  if (!drag) return null;
  const card = CARDS[drag.type];
  if (!card) return null;

  // Smooth arc: control point lifted above the chord midpoint.
  const mx = (drag.ox + drag.x) / 2;
  const my = Math.min(drag.oy, drag.y) - 90;
  const angle = Math.max(-24, Math.min(24, ((drag.x - drag.ox) / 24) * 4));

  return (
    <div className="drag-layer" aria-hidden="true">
      <svg className="drag-arc">
        <path d={`M ${drag.ox} ${drag.oy} Q ${mx} ${my} ${drag.x} ${drag.y}`} />
        <circle cx={drag.x} cy={drag.y} r="5" />
      </svg>
      <div className="drag-ghost" style={{ left: drag.x, top: drag.y, transform: `translate(-50%, -80%) rotate(${angle}deg)` }}>
        <span className="play-era">{(ERA_LABEL as Record<string, string>)[card.era] ?? card.era}</span>
        <span className="play-name">{card.name}</span>
        <span className="play-meta">{cashLabel(card.placeCostMinor)}</span>
      </div>
    </div>
  );
}
