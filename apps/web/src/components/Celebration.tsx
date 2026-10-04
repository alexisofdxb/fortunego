import { useEffect } from "react";
import { useUiStore } from "../state/ui";

const SPARKLES = [
  { top: "8%", left: "18%", delay: "0s" },
  { top: "4%", left: "52%", delay: "0.15s" },
  { top: "12%", left: "82%", delay: "0.3s" },
  { top: "38%", left: "6%", delay: "0.2s" },
  { top: "42%", left: "90%", delay: "0.45s" },
  { top: "72%", left: "14%", delay: "0.1s" },
  { top: "78%", left: "78%", delay: "0.35s" },
  { top: "88%", left: "48%", delay: "0.25s" },
  { top: "22%", left: "40%", delay: "0.5s" },
  { top: "58%", left: "70%", delay: "0.05s" },
];

/** Sparkling upgrade celebration — name, art, new rank, and what it unlocked. */
export function Celebration() {
  const celebration = useUiStore((s) => s.celebration);
  const clearCelebration = useUiStore((s) => s.clearCelebration);

  useEffect(() => {
    if (!celebration) return;
    const t = setTimeout(clearCelebration, 5200);
    return () => clearTimeout(t);
  }, [celebration, clearCelebration]);

  if (!celebration) return null;

  return (
    <div className="celebrate" role="status" aria-live="polite" onClick={clearCelebration}>
      <div className="celebrate-card">
        {SPARKLES.map((s, i) => (
          <i key={i} className="celebrate-spark" style={{ top: s.top, left: s.left, animationDelay: s.delay }} />
        ))}
        <div className="celebrate-art" aria-hidden>
          {celebration.art}
        </div>
        <p className="celebrate-kicker">Upgraded</p>
        <h2 className="celebrate-name">{celebration.name}</h2>
        <span className="celebrate-rank">Rank {celebration.rank}</span>
        <ul className="celebrate-unlocks">
          {celebration.unlocks.map((line) => (
            <li key={line}>{line}</li>
          ))}
        </ul>
      </div>
    </div>
  );
}
