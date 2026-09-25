import { useState, type ReactNode } from "react";
import type { PlotSnapshot } from "@plotgo/shared";
import { ObjectivesPanel } from "./ObjectivesPanel";
import { closingBellCopy, formatCountdown, scrollToSelector } from "../utils";

function BriefingCard({
  id,
  title,
  onDismiss,
  children,
}: {
  id: string;
  title: string;
  onDismiss: (id: string) => void;
  children: ReactNode;
}) {
  return (
    <section className={`briefing-card briefing-${id}`}>
      <div className="briefing-card-head">
        <b>{title}</b>
        <button className="briefing-dismiss" type="button" aria-label={`Dismiss ${title}`} onClick={() => onDismiss(id)}>
          ×
        </button>
      </div>
      {children}
    </section>
  );
}

/** Critical Business Alert (spec sheet 04): risk critical band or utilization >95%. */
function alertFor(plot: PlotSnapshot): string | null {
  const reasons: string[] = [];
  if (plot.attributes.riskBps >= 9_000) {
    reasons.push(`District risk is critical (${Math.round(plot.attributes.riskBps / 100)}%). Review exposure.`);
  }
  if (plot.performance.averageUtilization > 0.95) {
    reasons.push(`Utilization is above 95% (${Math.round(plot.performance.averageUtilization * 100)}%). Add capacity or upgrade.`);
  }
  return reasons.length ? reasons.join(" ") : null;
}

/**
 * Daily Briefing stack (spec sheet 04), shown after the Return Summary /
 * OfflineBanner: (a) Critical Business Alert, (b) Hunts Today, (c) Business
 * Objectives, (d) Weekly Performance, (e) Event Calendar, (f) Operating
 * Streak footer. Every card is dismissible.
 */
export function DailyBriefing({ plot }: { plot: PlotSnapshot }) {
  const [dismissed, setDismissed] = useState<string[]>([]);
  const [goalsOpen, setGoalsOpen] = useState(false);
  const dismiss = (id: string) => setDismissed((list) => (list.includes(id) ? list : [...list, id]));
  const isDismissed = (id: string) => dismissed.includes(id);

  const alert = alertFor(plot);
  const alertKey = alert ? `alert:${plot.attributes.riskBps}:${Math.round(plot.performance.averageUtilization * 100)}` : null;
  const offers = plot.huntOffers ?? [];
  const activeCount = plot.activeHuntCount ?? 0;
  const objectives = plot.objectives;
  const objectiveComplete = objectives?.lanes.filter((lane) => lane.status === "complete").length ?? 0;
  const bell = closingBellCopy(plot.weekStatus);
  const calendar = plot.eventCalendar;
  const nextWindow = calendar?.announced.find((window) => !calendar.current || window.eventId !== calendar.current.eventId) ?? null;
  const streak = plot.operatingStreak ?? 0;

  const cards: ReactNode[] = [];

  // (a) Critical Business Alert — dismissible, but a compact chip stays in the
  // HUD until the condition resolves; a new condition re-opens the full card.
  if (alert && alertKey) {
    cards.push(
      isDismissed(alertKey) ? (
        <button
          className="briefing-alert-chip"
          type="button"
          key={alertKey}
          title={alert}
          onClick={() => scrollToSelector('[data-onboarding-target="settle"]')}
        >
          ⚠ {alert.split(".")[0]}.
        </button>
      ) : (
        <BriefingCard id="alert" title="Critical Business Alert" onDismiss={() => dismiss(alertKey)} key={alertKey}>
          <p className="briefing-alert-copy">{alert}</p>
          <button className="performance-claim" type="button" onClick={() => scrollToSelector('[data-onboarding-target="settle"]')}>
            Review district
          </button>
        </BriefingCard>
      ),
    );
  }

  // (b) Hunts Today.
  if (!isDismissed("hunts")) {
    cards.push(
      <BriefingCard id="hunts" title="Hunts Today" onDismiss={dismiss} key="hunts">
        <p className="briefing-line">
          {offers.length} offer{offers.length === 1 ? "" : "s"} · {activeCount}/5 active
          {plot.rerollAvailable ? " · free reroll ready" : " · reroll used"}
        </p>
        <button className="performance-claim" type="button" onClick={() => scrollToSelector('[data-onboarding-target="hunt-strip"]')}>
          View hunt board
        </button>
      </BriefingCard>,
    );
  }

  // (c) Business Objectives — compact card with the canonical panel collapsible.
  if (!isDismissed("objectives") && objectives) {
    cards.push(
      <BriefingCard id="objectives" title="Business Objectives" onDismiss={dismiss} key="objectives">
        <p className="briefing-line">
          {objectiveComplete}/3 complete today · Cash-only rewards · reset at 00:00 UTC
        </p>
        <button className="performance-claim" type="button" onClick={() => setGoalsOpen((value) => !value)}>
          {goalsOpen ? "Hide goals" : "Goals"}
        </button>
        <div hidden={!goalsOpen}>
          <ObjectivesPanel plot={plot} />
        </div>
      </BriefingCard>,
    );
  }

  // (d) Weekly Performance.
  if (!isDismissed("performance") && bell && !plot.performance.finalized) {
    cards.push(
      <BriefingCard id="performance" title="Weekly Performance" onDismiss={dismiss} key="performance">
        <p className="briefing-line">
          {plot.performance.score}/120 provisional · {plot.performance.activeDays}/3 active days
          {plot.weekStatus?.status === "open" ? ` · closes in ${formatCountdown(plot.weekStatus.msUntilClose)}` : ""}
        </p>
        <p className="briefing-line subdued">
          {bell.label} — {bell.detail}
        </p>
        <button
          className="performance-claim"
          type="button"
          onClick={() => scrollToSelector('[data-onboarding-target="performance-panel"]')}
        >
          View performance
        </button>
      </BriefingCard>,
    );
  }

  // (e) Event Calendar — current + next announced window.
  if (!isDismissed("events") && calendar && (calendar.current || nextWindow)) {
    const fmt = (ts: number) => new Date(ts).toLocaleString([], { weekday: "short", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
    cards.push(
      <BriefingCard id="events" title="Event Calendar" onDismiss={dismiss} key="events">
        {calendar.current ? (
          <p className="briefing-line">
            Now: {calendar.current.title} — until {fmt(calendar.current.endsAt)}
          </p>
        ) : null}
        {nextWindow ? (
          <p className="briefing-line">
            Next known window: {nextWindow.title} — {fmt(nextWindow.startsAt)} → {fmt(nextWindow.endsAt)}
          </p>
        ) : (
          <p className="briefing-line subdued">No further announced windows this week. Surprise events are not scheduled.</p>
        )}
      </BriefingCard>,
    );
  }

  // (f) Operating Streak — small footer only, status/cosmetic (spec sheet 10).
  if (!isDismissed("streak") && streak >= 2) {
    cards.push(
      <BriefingCard id="streak" title="Operating Streak" onDismiss={dismiss} key="streak">
        <p className="briefing-line streak-line" title={`Longest streak: ${plot.longestStreak ?? streak} consecutive eligible days`}>
          Operating streak: {streak} day{streak === 1 ? "" : "s"} — status only, no rewards attached.
        </p>
      </BriefingCard>,
    );
  }

  if (!cards.length) return null;
  return <div className="daily-briefing">{cards}</div>;
}
