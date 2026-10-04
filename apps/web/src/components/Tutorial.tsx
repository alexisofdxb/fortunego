import { useEffect, useRef, useState } from "react";
import type { PlotSnapshot } from "@plotgo/shared";
import { useUiStore } from "../state/ui";

/**
 * Forced first-time tutorial (strategy-genre FTUE): a spotlight mask dims
 * everything except the one highlighted element, a coach hand points at it,
 * and all other input is swallowed until the *action* completes (not just a
 * click-through). Progress is per-player and skippable.
 */

interface Step {
  text: string;
  /** Advance-by-button steps (welcome / completion); others advance on `done`. */
  cta?: string;
  /** Input lockdown: default true. Drag steps must be false so the pointer is free. */
  lock?: boolean;
  /** Softer dim — for steps that interact with a modal (inspect/upgrade/equip). */
  soft?: boolean;
  hint?: string;
  target?: () => string | null;
  /** Secondary passive highlight (e.g. the drop parcel while the card is highlighted). */
  also?: () => string | null;
  /** Skip past this step when the condition holds (e.g. no module to equip). */
  skipIf?: (plot: PlotSnapshot) => boolean;
  done: (plot: PlotSnapshot) => boolean;
}

const PAD = 10;
/** Bump when tutorial steps change — everyone who completed an older version replays. */
const TUTORIAL_VERSION = 3;

/** True while the forced tutorial is still running for this player (drives
 *  progressive disclosure — e.g. the hand shows only the tutorial card). */
export function tutorialRunning(plot: PlotSnapshot): boolean {
  if (plot.onboarding?.status !== "active") return false;
  return localStorage.getItem(`plotgo:tut:${plot.playerId}`) !== String(TUTORIAL_VERSION);
}

export function Tutorial({ plot }: { plot: PlotSnapshot }) {
  const placeMode = useUiStore((s) => s.placeMode);
  const inspectId = useUiStore((s) => s.inspectId);
  const flag = `plotgo:tut:${plot.playerId}`;
  const flagValue = String(TUTORIAL_VERSION);
  const [started, setStarted] = useState(false);
  const [step, setStep] = useState(0);
  const [rect, setRect] = useState<{ top: number; left: number; width: number; height: number } | null>(null);
  const [rect2, setRect2] = useState<{ top: number; left: number; width: number; height: number } | null>(null);
  const [finished, setFinished] = useState(() => localStorage.getItem(flag) === flagValue);
  const plotRef = useRef(plot);
  plotRef.current = plot;
  const placeModeRef = useRef(placeMode);
  placeModeRef.current = placeMode;

  const active = plot.onboarding?.status === "active";
  const shouldStart = active && !finished && (plot.cards.length === 0 || started);
  useEffect(() => {
    if (shouldStart && !started) setStarted(true);
  }, [shouldStart, started]);

  const steps: Step[] = [
    {
      text: "Welcome, Founder! This is your district. Let's set up your first business — it only takes a minute.",
      cta: "Let's build",
      done: () => false,
    },
    {
      text: "This is your **hand** — businesses you can build. **Drag the Cash Kiosk** onto the **pulsing parcel** and let go. Buildings earn cash every day.",
      lock: false,
      hint: "Hold the card, drag it to the pulsing parcel, let go",
      target: () => '[data-onboarding-target="build-cash-kiosk"]',
      also: () => "#hex-35",
      done: (p) => p.cards.length >= 1,
    },
    {
      text: "Businesses pay out when the day closes. Tap **🌙 Close Day** to collect your first earnings.",
      target: () => '[data-tut="close-day"]',
      done: (p) => Boolean(p.session),
    },
    {
      text: "Tap your kiosk's **medal** on the board to inspect it.",
      lock: false,
      soft: true,
      target: () => ".hex-chip",
      // Advance on the store signal, with a DOM fallback for robustness.
      done: () =>
        useUiStore.getState().inspectId !== null || document.querySelector(".modal-card") !== null,
    },
    {
      text: "Upgrading makes a business earn more every day. Tap **Upgrade to Stage 2**.",
      lock: false,
      soft: true,
      also: () => (document.querySelector(".modal-card") ? ".modal-card" : null),
      target: () =>
        document.querySelector('[data-tut="upgrade-btn"]') ? '[data-tut="upgrade-btn"]' : ".hex-chip",
      done: (p) => p.cards.some((c) => c.stage >= 2),
    },
    {
      text: "A **Customer Signage** module arrived with your founder kit! In the module panel, pick it in the slot's dropdown and tap **Equip**.",
      lock: false,
      soft: true,
      hint: "Select Customer Signage, then tap Equip",
      also: () => (document.querySelector(".modal-card") ? ".modal-card" : null),
      target: () => (document.querySelector(".module-panel") ? ".module-panel" : ".hex-chip"),
      skipIf: (p) => !(p.modules?.inventory ?? []).some((m) => m.quantityAvailable > 0),
      done: (p) => (p.modules?.loadouts ?? []).some((l) => l.slots.length > 0),
    },
    {
      text: "You earned cash and XP! Your next goal: reach **Lv2** — finish the daily objectives (📋) and a market hunt (🎯), then claim the **free deed** parcel beside yours and build a second business. The **📜 quest tracker** shows your objectives and exactly what unlocks next. That's the loop: **place → upgrade → close day → expand**. Happy building!",
      cta: "Start building",
      done: () => false,
    },
  ];

  const current = steps[Math.min(step, steps.length - 1)];
  const isLast = step >= steps.length - 1;

  // Track the highlighted element's screen rect (targets can move/open drawers).
  useEffect(() => {
    if (!started || finished) return;
    const update = () => {
      const current = steps[Math.min(step, steps.length - 1)];
      const measure = (sel: string | null | undefined) => {
        const el = sel ? document.querySelector(sel) : null;
        if (!el) return null;
        const r = el.getBoundingClientRect();
        return {
          top: Math.max(4, r.top - PAD),
          left: Math.max(4, r.left - PAD),
          width: r.width + PAD * 2,
          height: r.height + PAD * 2,
        };
      };
      setRect(measure(current.target?.()));
      setRect2(measure(current.also?.()));
    };
    update();
    const timer = setInterval(update, 350);
    window.addEventListener("resize", update);
    return () => {
      clearInterval(timer);
      window.removeEventListener("resize", update);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step, started, finished]);

  // Advance as soon as the action completes (or the step no longer applies).
  useEffect(() => {
    if (!started || finished) return;
    if (current.skipIf?.(plotRef.current)) {
      setStep((s) => Math.min(s + 1, steps.length - 1));
      return;
    }
    if (!current.cta && current.done(plotRef.current)) {
      const t = setTimeout(() => setStep((s) => Math.min(s + 1, steps.length - 1)), 450);
      return () => clearTimeout(t);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [plot, placeMode, inspectId, step, started, finished]);

  if (!active || finished || !shouldStart) return null;

  const finish = () => {
    localStorage.setItem(flag, flagValue);
    setFinished(true);
  };

  const r = rect;
  // Render **bold** markers in step text.
  const rich = (text: string) =>
    text.split("**").map((part, i) => (i % 2 === 1 ? <b key={i}>{part}</b> : part));

  return (
    <div className="tut-overlay" role="dialog" aria-label="Tutorial">
      {/* Spotlight quads — swallow every click outside the hole. */}
      {r ? (
        <>
          <div className={`tut-shade${current.lock === false ? " tut-shade-passive" : ""}${current.soft ? " tut-shade-soft" : ""}`} style={{ top: 0, left: 0, right: 0, height: r.top }} />
          <div className={`tut-shade${current.lock === false ? " tut-shade-passive" : ""}${current.soft ? " tut-shade-soft" : ""}`} style={{ top: r.top, left: 0, width: r.left, height: r.height }} />
          <div className={`tut-shade${current.lock === false ? " tut-shade-passive" : ""}${current.soft ? " tut-shade-soft" : ""}`} style={{ top: r.top, left: r.left + r.width, right: 0, height: r.height }} />
          <div className={`tut-shade${current.lock === false ? " tut-shade-passive" : ""}${current.soft ? " tut-shade-soft" : ""}`} style={{ top: r.top + r.height, left: 0, right: 0, bottom: 0 }} />
          <div className="tut-ring" style={{ top: r.top, left: r.left, width: r.width, height: r.height }} />
          {rect2 ? (
            <div className="tut-ring tut-ring-secondary" style={{ top: rect2.top, left: rect2.left, width: rect2.width, height: rect2.height }} />
          ) : null}
          <div className="tut-hand" style={{ top: r.top + r.height - 14, left: r.left + r.width - 18 }} aria-hidden="true">
            👆
          </div>
        </>
      ) : (
        <div className="tut-shade tut-shade-full" />
      )}
      <div className="tut-dialog">
        <p>{rich(current.text)}</p>
        <div className="tut-actions">
          <span className="tut-progress">
            {step + 1} / {steps.length}
          </span>
          {current.cta ? (
            <button type="button" className="tut-next" onClick={() => (isLast ? finish() : setStep(step + 1))}>
              {current.cta}
            </button>
          ) : (
            <span className="tut-hint">{current.hint ?? "Tap the highlighted target"}</span>
          )}
        </div>
      </div>
    </div>
  );
}
