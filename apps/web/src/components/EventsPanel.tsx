import type { PlotSnapshot } from "@plotgo/shared";
import { useEventChoose, useEventMissionClaim } from "../api/hooks";
import { cashLabel } from "../utils";

export function EventsPanel({ plot }: { plot: PlotSnapshot }) {
  const choose = useEventChoose();
  const claimMission = useEventMissionClaim();
  const eventState = plot.eventState;
  const global = eventState.globalEvent;
  const calendar = plot.eventCalendar;
  const windowLabel = (startsAt: number, endsAt: number) =>
    `${new Date(startsAt).toLocaleString([], { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })} – ${new Date(endsAt).toLocaleString([], { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}`;
  return (
    <section className="event-panel">
      <div className="portfolio-heading">
        <b>Market Cycle · {eventState.cycle.state}</b>
        <span>
          v{eventState.cycle.cycleVersion} · {eventState.catalogCount} events
        </span>
      </div>
      {calendar ? (
        <div className="event-calendar">
          {calendar.announced.map((window) => {
            const isCurrent = calendar.current?.eventId === window.eventId;
            return (
              <div className={`event-window ${isCurrent ? "current" : ""}`} key={window.eventId}>
                <div>
                  <b>{window.title}</b>
                  <span>{windowLabel(window.startsAt, window.endsAt)}</span>
                </div>
                <span className={`known-badge ${isCurrent ? "live" : ""}`}>{isCurrent ? "Active window" : "Known window"}</span>
              </div>
            );
          })}
          {!calendar.current && !calendar.announced.length ? (
            <small className="settled">No announced major windows this week. Minor or surprise events are not scheduled in advance.</small>
          ) : null}
        </div>
      ) : null}
      <div className="event-summary">
        <b>{global.event}</b>
        <span>
          {global.category} · {global.tone} · {global.durationHours}h · Hunt ×{global.huntSpawnMultiplier}
          {eventState.moduleInteractions.global?.rewardChance
            ? ` · Module reward chance ${Math.round(eventState.moduleInteractions.global.rewardChance * 100)}%`
            : ""}
          {eventState.moduleLocks.length
            ? ` · ${eventState.moduleLocks.length} Module lock${eventState.moduleLocks.length === 1 ? "" : "s"}`
            : ""}
        </span>
      </div>
      {global.playerChoice && !eventState.globalChoice.choiceId ? (
        <div className="event-choices">
          {eventState.globalChoice.decisions.map((decision) => (
            <button
              className="verb"
              type="button"
              key={decision.id}
              onClick={() => choose.mutate({ eventId: eventState.globalChoice.id, decisionId: decision.id })}
            >
              {decision.choice} · {cashLabel(decision.immediateCostMinor)}
            </button>
          ))}
        </div>
      ) : null}
      {eventState.personalEvents.map((personal) => (
        <div className="event-row" key={personal.id}>
          <div>
            <b>{personal.event?.event ?? personal.catalogId}</b>
            <span>
              {personal.event?.category ?? "Personal"} · ends{" "}
              {new Date(personal.endsAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
            </span>
          </div>
          {personal.decisions.length && !personal.choiceId ? (
            <div className="event-choices">
              {personal.decisions.map((decision) => (
                <button
                  className="verb"
                  type="button"
                  key={decision.id}
                  onClick={() => choose.mutate({ eventId: personal.id, decisionId: decision.id })}
                >
                  {decision.choice} · {cashLabel(decision.immediateCostMinor)}
                </button>
              ))}
            </div>
          ) : (
            <small className="settled">{personal.choiceId ? "Decision resolved" : "No decision required"}</small>
          )}
        </div>
      ))}
      {eventState.mission?.template ? (
        <div className="event-mission">
          <div>
            <b>{eventState.mission.template.mission}</b>
            <span>
              {eventState.mission.template.metric} · {eventState.mission.progress?.current ?? 0} /{" "}
              {eventState.mission.progress?.target ?? eventState.mission.target}
            </span>
          </div>
          <button
            className="claim"
            type="button"
            disabled={!eventState.mission.ready}
            onClick={() => claimMission.mutate({ missionId: eventState.mission?.id })}
          >
            {eventState.mission.ready ? "Claim" : "In progress"}
          </button>
        </div>
      ) : null}
      <div className="segments">
        <span>Demand {Math.round(eventState.modifiers.demandBps / 100)}%</span>
        <span>Activity {Math.round(eventState.modifiers.activityBps / 100)}%</span>
        <span>Revenue {Math.round(eventState.modifiers.revenueBps / 100)}%</span>
        <span>Risk {Math.round(eventState.modifiers.riskBps / 100)}%</span>
      </div>
    </section>
  );
}
