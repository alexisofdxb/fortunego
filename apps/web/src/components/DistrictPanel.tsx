import { SESSION_VERBS, type SessionVerb } from "@plotgo/game";
import type { PlotSnapshot } from "@plotgo/shared";
import { useSessionSettle } from "../api/hooks";
import { cashLabel } from "../utils";

export function DistrictPanel({ plot }: { plot: PlotSnapshot }) {
  const settle = useSessionSettle();
  const risk = Math.round(plot.attributes.riskBps / 100);
  const reputation = Math.round(plot.attributes.reputationBps / 100);
  const condition = Math.round(plot.attributes.conditionBps / 100);
  const segments = plot.attributes.segments;
  return (
    <section className="day-panel" data-onboarding-target="settle">
      <div className="day-copy">
        <b>District Day · {plot.event.title}</b>
        <span>{plot.event.description}</span>
        <small>
          Market event: {plot.marketEvent.title} · {plot.marketEvent.durationHours}h · {plot.marketEvent.spawnMultiplier}×
          hunt spawn · {plot.marketEvent.activityModifier}× activity
        </small>
      </div>
      <div className="day-stats">
        <span>
          Risk <b>{risk}%</b>
        </span>
        <span>
          Reputation <b>{reputation}%</b>
        </span>
        <span>
          Customers{" "}
          <b>
            {plot.attributes.population.toLocaleString()} / {plot.attributes.capacity.toLocaleString()}
          </b>
        </span>
        <span>
          Condition <b>{condition}%</b>
        </span>
        <span>
          Transactions <b>{plot.attributes.transactions.toLocaleString()}</b>
        </span>
        <span>
          Volume <b>{cashLabel(plot.attributes.volumeMinor)}</b>
        </span>
        <span>
          Synergies <b>{plot.attributes.synergyCount}</b>
        </span>
        <span>
          Placement <b>{plot.placement.score.placementScore}/100</b>
        </span>
      </div>
      <div className="segments">
        <span>
          Links {plot.placement.directLinks} direct · {plot.placement.supportLinks} support
        </span>
        <span>Districts {plot.placement.districts.length}</span>
        <span>Penalties {plot.placement.penalties.length}</span>
        <span>Layout v{plot.placementAudit.layoutVersion}</span>
      </div>
      <div className="segments">
        <span>General {segments.generalConsumers}</span>
        <span>Retail {segments.retailInvestors}</span>
        <span>Traders {segments.activeTraders}</span>
        <span>Small biz {segments.smallBusinesses}</span>
        <span>Corporate {segments.corporateClients}</span>
        <span>HNW {segments.highNetWorth}</span>
        <span>Institutional {segments.institutional}</span>
      </div>
      <div className="verbs">
        {SESSION_VERBS.map((verb) => (
          <button
            className="verb"
            type="button"
            key={verb.id}
            disabled={!!plot.session}
            title={verb.description}
            onClick={() => settle.mutate({ verb: verb.id as SessionVerb })}
          >
            {verb.title}
          </button>
        ))}
      </div>
      {plot.session ? (
        <small className="settled">Settled today with “{plot.session.verb.replaceAll("_", " ")}”.</small>
      ) : (
        <small className="settled">Choose one business action. It settles once per UTC day.</small>
      )}
    </section>
  );
}
