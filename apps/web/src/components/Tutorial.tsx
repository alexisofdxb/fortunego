import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties } from "react";
import type { PlotSnapshot } from "@plotgo/shared";
import { useUiStore } from "../state/ui";
import { audio } from "../audio";

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
  /** Softer dim — for steps that interact with a drawer (inspect/upgrade/equip). */
  soft?: boolean;
  hint?: string;
  /** Spotlight hole — the element that stays undimmed. */
  target?: () => string | null;
  /** Gold ring + hand. Defaults to `target`. */
  point?: () => string | null;
  /** Secondary passive highlight (e.g. the drop parcel while the card is highlighted). */
  also?: () => string | null;
  /** Skip past this step when the condition holds (e.g. no module to equip). */
  skipIf?: (plot: PlotSnapshot) => boolean;
  /** Re-open the inspect drawer when this step is resumed after a reload. */
  resumeInspect?: boolean;
  /** Close inspect so HUD targets (XP, hunts, objectives) are visible. */
  closeInspect?: boolean;
  done: (plot: PlotSnapshot) => boolean;
}

type Rect = { top: number; left: number; width: number; height: number };

const PAD = 10;

function measureSel(sel: string | null | undefined): Rect | null {
  const el = sel ? document.querySelector(sel) : null;
  if (!el) return null;
  const r = el.getBoundingClientRect();
  return {
    top: Math.max(4, r.top - PAD),
    left: Math.max(4, r.left - PAD),
    width: r.width + PAD * 2,
    height: r.height + PAD * 2,
  };
}

function overlaps(a: Rect, b: Rect, gap = 12): boolean {
  return !(
    a.left + a.width + gap <= b.left ||
    b.left + b.width + gap <= a.left ||
    a.top + a.height + gap <= b.top ||
    b.top + b.height + gap <= a.top
  );
}

/** Park the coach card clear of the tap target; prefer the space left of a right-edge drawer. */
function coachPlacement(avoid: Rect[], mustClear: Rect[]): CSSProperties | undefined {
  if (!avoid.length && !mustClear.length) return undefined;
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const dw = Math.min(420, vw - 32);
  const dh = 150;
  const pad = 16;
  const boxes = [...avoid, ...mustClear];
  const leftmost = Math.min(...boxes.map((r) => r.left));
  const topmost = Math.min(...boxes.map((r) => r.top));
  const bottommost = Math.max(...boxes.map((r) => r.top + r.height));
  const rightmost = Math.max(...boxes.map((r) => r.left + r.width));

  const candidates: Rect[] = [];
  if (leftmost - pad - dw >= pad) {
    candidates.push({
      left: leftmost - pad - dw,
      top: Math.max(pad, Math.min(topmost, vh - dh - pad)),
      width: dw,
      height: dh,
    });
  }
  if (topmost - pad - dh >= pad) {
    candidates.push({
      left: Math.max(pad, Math.min((vw - dw) / 2, vw - dw - pad)),
      top: topmost - pad - dh,
      width: dw,
      height: dh,
    });
  }
  if (rightmost + pad + dw <= vw - pad) {
    candidates.push({
      left: rightmost + pad,
      top: Math.max(pad, Math.min(topmost, vh - dh - pad)),
      width: dw,
      height: dh,
    });
  }
  if (bottommost + pad + dh <= vh - pad) {
    candidates.push({
      left: Math.max(pad, Math.min((vw - dw) / 2, vw - dw - pad)),
      top: bottommost + pad,
      width: dw,
      height: dh,
    });
  }
  candidates.push({ left: pad, top: pad, width: dw, height: dh });

  const pick =
    candidates.find((c) => mustClear.every((r) => !overlaps(c, r)) && avoid.every((r) => !overlaps(c, r))) ??
    candidates.find((c) => mustClear.every((r) => !overlaps(c, r))) ??
    candidates[0];

  return {
    left: pick.left,
    top: pick.top,
    bottom: "auto",
    transform: "none",
    width: pick.width,
  };
}
/** Bump when tutorial steps change — everyone who completed an older version replays. */
const TUTORIAL_VERSION = 4;

function tutFlag(playerId: string) {
  return `plotgo:tut:${playerId}`;
}
function tutStepKey(playerId: string) {
  return `plotgo:tut-step:${playerId}`;
}

const STEPS: Step[] = [
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
    done: (p) =>
      p.cards.some((c) => c.stage >= 2) ||
      useUiStore.getState().inspectId !== null ||
      document.querySelector('[data-tut="inspect-drawer"]') !== null,
  },
  {
    text: "Upgrading makes a business earn more every day. Tap **Upgrade to Stage 2**.",
    lock: false,
    soft: true,
    resumeInspect: true,
    target: () =>
      document.querySelector('[data-tut="inspect-drawer"]') ? '[data-tut="inspect-drawer"]' : ".hex-chip",
    point: () => (document.querySelector('[data-tut="upgrade-btn"]') ? '[data-tut="upgrade-btn"]' : null),
    done: (p) => p.cards.some((c) => c.stage >= 2),
  },
  {
    text: "A **Customer Signage** module arrived with your founder kit! In the module panel, pick it in the slot's dropdown and tap **Equip**.",
    lock: false,
    soft: true,
    resumeInspect: true,
    hint: "Select Customer Signage, then tap Equip",
    target: () =>
      document.querySelector('[data-tut="inspect-drawer"]') ? '[data-tut="inspect-drawer"]' : ".hex-chip",
    point: () =>
      document.querySelector('[data-tut="module-equip"]')
        ? '[data-tut="module-equip"]'
        : document.querySelector(".module-panel")
          ? ".module-panel"
          : null,
    skipIf: (p) => !(p.modules?.inventory ?? []).some((m) => m.quantityAvailable > 0),
    done: (p) => (p.modules?.loadouts ?? []).some((l) => l.slots.length > 0),
  },
  {
    text: "Levels come from **XP**. The header shows how much you still need — **Lv 3 is 650 XP**. Hunts, daily objectives, upgrades, and new buildings all add XP. Watch this number.",
    cta: "Show me how",
    closeInspect: true,
    target: () => '[data-tut="xp-hud"]',
    done: () => false,
  },
  {
    text: "Tap the **purple Market Hunt** banner. Starting a hunt is **+20 XP**. This is the fastest way to level.",
    lock: false,
    soft: true,
    closeInspect: true,
    target: () => '[data-tut="hunt-banner"]',
    done: (p) =>
      Boolean(useUiStore.getState().openSections["dock-hunts"]) ||
      (p.hunts ?? []).some((h) => h.started) ||
      Boolean(p.hunt?.started),
  },
  {
    text: "Tap **Start** on an offer. Play the hunt, then claim it for XP.",
    lock: false,
    soft: true,
    hint: "Tap Start on any offer",
    target: () => (document.querySelector(".dock-sheet") ? ".dock-sheet" : '[data-tut="hunt-banner"]'),
    point: () => (document.querySelector('[data-tut="hunt-start"]') ? '[data-tut="hunt-start"]' : null),
    skipIf: (p) =>
      (p.hunts ?? []).some((h) => h.started) ||
      Boolean(p.hunt?.started) ||
      (p.huntOffers ?? []).length === 0,
    done: (p) => (p.hunts ?? []).some((h) => h.started) || Boolean(p.hunt?.started),
  },
  {
    text: "Tap the **gold objectives** banner. Each daily objective is **+25 XP**. Do hunts and objectives every day until the header reads **Lv 3**.",
    lock: false,
    soft: true,
    closeInspect: true,
    target: () => '[data-tut="objectives-banner"]',
    done: (p) =>
      Boolean(useUiStore.getState().openSections["dock-objectives"]) ||
      (p.objectives?.lanes.some((l) => l.status === "complete") ?? false),
  },
  {
    text: "That's the loop: **hunt → objectives → upgrade → expand**. Sound is on — tap the **speaker** in the header any time. Keep doing hunts and daily objectives until the header says Lv 3.",
    cta: "Keep going",
    done: () => false,
  },
];

/** First incomplete step from board state (skips welcome once a building exists). */
function derivedStep(plot: PlotSnapshot): number {
  for (let i = 0; i < STEPS.length; i++) {
    const s = STEPS[i];
    if (s.skipIf?.(plot)) continue;
    if (i === 0 && s.cta) {
      if (plot.cards.length > 0 || plot.session) continue;
      return 0;
    }
    if (i === STEPS.length - 1) return i;
    if (s.done(plot)) continue;
    return i;
  }
  return STEPS.length - 1;
}

function loadSavedStep(playerId: string): number | null {
  try {
    const raw = localStorage.getItem(tutStepKey(playerId));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { v?: number; step?: number };
    if (parsed.v !== TUTORIAL_VERSION || typeof parsed.step !== "number") return null;
    return Math.max(0, Math.min(STEPS.length - 1, Math.floor(parsed.step)));
  } catch {
    return null;
  }
}

function initialStep(plot: PlotSnapshot): number {
  const derived = derivedStep(plot);
  const saved = loadSavedStep(plot.playerId);
  return saved == null ? derived : Math.max(saved, derived);
}

/** True while the first-building chapter still owns the hand (only the kiosk
 *  is buildable). Later tutorial steps (XP / hunts / objectives) leave the
 *  full hand visible. */
export function tutorialRunning(plot: PlotSnapshot): boolean {
  if (localStorage.getItem(tutFlag(plot.playerId)) === String(TUTORIAL_VERSION)) return false;
  return plot.cards.length === 0;
}

export function tutorialFinished(playerId: string): boolean {
  return localStorage.getItem(tutFlag(playerId)) === String(TUTORIAL_VERSION);
}

export function Tutorial({ plot }: { plot: PlotSnapshot }) {
  const placeMode = useUiStore((s) => s.placeMode);
  const inspectId = useUiStore((s) => s.inspectId);
  const openSections = useUiStore((s) => s.openSections);
  const flag = tutFlag(plot.playerId);
  const flagValue = String(TUTORIAL_VERSION);
  const [step, setStep] = useState(() => initialStep(plot));
  const [rect, setRect] = useState<Rect | null>(null);
  const [rect2, setRect2] = useState<Rect | null>(null);
  const [pointRect, setPointRect] = useState<Rect | null>(null);
  const [coach, setCoach] = useState<CSSProperties | undefined>(undefined);
  const [finished, setFinished] = useState(() => localStorage.getItem(flag) === flagValue);
  const plotRef = useRef(plot);
  plotRef.current = plot;

  const running = !finished;
  const prevStep = useRef(step);

  const current = STEPS[Math.min(step, STEPS.length - 1)];
  const isLast = step >= STEPS.length - 1;

  useEffect(() => {
    if (!running) return;
    localStorage.setItem(tutStepKey(plot.playerId), JSON.stringify({ v: TUTORIAL_VERSION, step }));
    if (prevStep.current !== step) audio.play("tut_advance");
    prevStep.current = step;
  }, [running, step, plot.playerId]);

  // Re-open inspect when resuming an upgrade/equip step after a reload.
  useEffect(() => {
    if (!running) return;
    const s = STEPS[Math.min(step, STEPS.length - 1)];
    if (s.closeInspect) {
      useUiStore.getState().setInspectId(null);
      return;
    }
    if (!s.resumeInspect) return;
    const card = plotRef.current.cards[0];
    if (card && !useUiStore.getState().inspectId) useUiStore.getState().setInspectId(card.id);
  }, [running, step]);

  // Track the highlighted element's screen rect (targets can move/open drawers).
  useLayoutEffect(() => {
    if (!running) return;
    const update = () => {
      const current = STEPS[Math.min(step, STEPS.length - 1)];
      const hole = measureSel(current.target?.());
      const extra = measureSel(current.also?.());
      const point = measureSel(current.point?.()) ?? hole;
      setRect(hole);
      setRect2(extra);
      setPointRect(point);
      const avoid = [hole, extra].filter((box): box is Rect => Boolean(box));
      const clear = point ? [point] : [];
      setCoach(coachPlacement(avoid, clear));
    };
    update();
    const timer = setInterval(update, 350);
    window.addEventListener("resize", update);
    return () => {
      clearInterval(timer);
      window.removeEventListener("resize", update);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step, running, inspectId]);

  // Advance as soon as the action completes (or the step no longer applies).
  useEffect(() => {
    if (!running) return;
    if (current.skipIf?.(plotRef.current)) {
      setStep((s) => Math.min(s + 1, STEPS.length - 1));
      return;
    }
    if (!current.cta && current.done(plotRef.current)) {
      const t = setTimeout(() => setStep((s) => Math.min(s + 1, STEPS.length - 1)), 450);
      return () => clearTimeout(t);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [plot, placeMode, inspectId, step, running, openSections]);

  if (!running) return null;

  const finish = () => {
    localStorage.setItem(flag, flagValue);
    localStorage.removeItem(tutStepKey(plot.playerId));
    setFinished(true);
  };

  const r = rect;
  const aim = pointRect ?? rect;
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
          {aim ? (
            <div className="tut-ring" style={{ top: aim.top, left: aim.left, width: aim.width, height: aim.height }} />
          ) : null}
          {rect2 ? (
            <div className="tut-ring tut-ring-secondary" style={{ top: rect2.top, left: rect2.left, width: rect2.width, height: rect2.height }} />
          ) : null}
          {aim ? (
            <div className="tut-hand" style={{ top: aim.top + aim.height - 14, left: aim.left + aim.width - 18 }} aria-hidden="true">
              👆
            </div>
          ) : null}
        </>
      ) : (
        <div className="tut-shade tut-shade-full" />
      )}
      <div className="tut-dialog" style={coach}>
        <p>{rich(current.text)}</p>
        <div className="tut-actions">
          <span className="tut-progress">
            {step + 1} / {STEPS.length}
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
