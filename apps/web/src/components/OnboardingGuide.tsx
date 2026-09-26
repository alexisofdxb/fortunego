import type { PlotSnapshot } from "@plotgo/shared";
import { useOnboardingSkip } from "../api/hooks";
import { useUiStore } from "../state/ui";

function focusOnboardingTarget(target?: string) {
  if (!target) return;
  document.querySelectorAll<HTMLElement>(".onboarding-focus").forEach((el) => el.classList.remove("onboarding-focus"));
  const element = document.querySelector<HTMLElement>(`[data-onboarding-target="${target}"]`);
  if (!element) {
    useUiStore.getState().setToast("That tutorial step is waiting for the previous action to finish.");
    return;
  }
  element.scrollIntoView({ behavior: "smooth", block: "center", inline: "nearest" });
  element.classList.add("onboarding-focus");
  window.setTimeout(() => element.classList.remove("onboarding-focus"), 2_400);
}

export function OnboardingGuide({ plot, expanded = false }: { plot: PlotSnapshot; expanded?: boolean }) {
  const skip = useOnboardingSkip();
  const storeOpen = useUiStore((s) => !!s.openSections["quest"]);
  const toggle = useUiStore((s) => s.toggleSection);
  const open = expanded || storeOpen;
  const onboarding = plot.onboarding;
  if (!onboarding || onboarding.status !== "active") return null;

  const next = onboarding.milestones.find((m) => m.id === onboarding.step) ?? null;
  const required = onboarding.milestones.filter((m) => m.required);
  const complete = required.filter((m) => m.achievedAt != null).length;
  const guide = onboarding.guide;
  const questTitle = guide?.title ?? next?.label ?? "Your core empire loop is live.";

  return (
    <section className="onboarding-panel quest">
      {expanded ? null : (
        <button type="button" className="rail-section-head quest-head" onClick={() => toggle("quest")} aria-expanded={open}>
          <span className="rail-section-title">Quest</span>
          <span className="rail-section-sub">
            {questTitle} · {complete}/{required.length}
          </span>
          <span className="rail-section-caret">{open ? "▾" : "▸"}</span>
        </button>
      )}
      <div className="quest-progress">
        <i style={{ width: `${Math.round((complete / Math.max(1, required.length)) * 100)}%` }} />
      </div>
      {open ? (
        <div className="quest-body">
          <p className="onboarding-quest-title">{questTitle}</p>
          <div className="onboarding-instruction">{guide?.prompt ?? "Choose your next goal and play freely."}</div>
          {guide ? (
            <>
              <button className="performance-claim" type="button" onClick={() => focusOnboardingTarget(guide.target)}>
                {guide.actionLabel}
              </button>
              <small className={`settled ${guide.overdue ? "onboarding-recovery" : ""}`}>
                {guide.overdue
                  ? `Recovery: ${guide.recovery}`
                  : `Step ${complete + 1} of ${required.length} · ${Math.floor(onboarding.elapsedMinutes)}m elapsed`}
              </small>
            </>
          ) : null}
          <small className="settled">
            Build → Customers → Cash → Placement → Hunts → Portfolio → Performance. Guided prompts end before 30 minutes.
          </small>
          <button className="performance-claim secondary" type="button" onClick={() => skip.mutate()}>
            Skip guided onboarding
          </button>
        </div>
      ) : null}
    </section>
  );
}
