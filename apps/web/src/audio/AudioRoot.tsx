import { useEffect } from "react";
import { rankForLevel } from "@plotgo/game";
import type { PlotSnapshot } from "@plotgo/shared";
import { tutorialFinished } from "../components/Tutorial";
import { useUiStore } from "../state/ui";
import type { MusicId } from "./cues";
import { audio } from "./player";

function bedFor(plot: PlotSnapshot, visit: boolean, world: boolean): MusicId {
  if (world) return "world";
  if (visit) return "visit";
  const rank = rankForLevel(plot.hexBoard.empireLevel);
  if (rank === "growing" || rank === "established" || rank === "elite" || rank === "tycoon") return "growing_day";
  if (plot.session) return "humble_dusk";
  return "humble_day";
}

/** Unlocks the AudioContext, preloads SFX, and keeps the district bed in sync. */
export function AudioRoot({ plot }: { plot: PlotSnapshot }) {
  const visitMode = useUiStore((s) => s.visitMode);
  const worldOpen = useUiStore((s) => Boolean(s.openSections["dock-world"]));

  useEffect(() => {
    const unlock = () => {
      void audio.unlock().then(() => {
        audio.setMusic(bedFor(plot, Boolean(visitMode), worldOpen));
        audio.setTutorialDuck(!tutorialFinished(plot.playerId));
      });
    };
    window.addEventListener("pointerdown", unlock, { once: true });
    window.addEventListener("keydown", unlock, { once: true });
    return () => {
      window.removeEventListener("pointerdown", unlock);
      window.removeEventListener("keydown", unlock);
    };
    // Unlock once per mount; bed updates live in the effect below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const onVis = () => audio.pauseForBackground(document.hidden);
    document.addEventListener("visibilitychange", onVis);
    return () => document.removeEventListener("visibilitychange", onVis);
  }, []);

  useEffect(() => {
    if (!audio.isUnlocked()) return;
    audio.setMusic(bedFor(plot, Boolean(visitMode), worldOpen));
    audio.setTutorialDuck(!tutorialFinished(plot.playerId));
  }, [plot.hexBoard.empireLevel, plot.session, plot.playerId, visitMode, worldOpen]);

  return null;
}
