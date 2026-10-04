import { useEffect, useMemo, useState } from "react";
import { isoWeek, LIVEOPS_WEEKLY_EVENTS, weekMondayUtcMs } from "@plotgo/game";
import type { PlotSnapshot } from "@plotgo/shared";
import { ChevronLeft, X } from "lucide-react";
import {
  useClaimSeasonPass,
  useEventChoose,
  useEventMissionClaim,
  useLiveopsLeaderboard,
  useBuyLiveopsSku,
  useLiveopsFaucet,
  useOpenLiveopsCase,
  useUnlockSeasonPass,
} from "../api/hooks";
import { cashLabel } from "../utils";

const DAY_NAMES = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];

type CalBar = {
  id: string;
  name: string;
  group: string;
  tone: string;
  startDay: number;
  endDay: number;
  live: boolean;
  durationLabel: string;
  qualifying: string;
  rewards: string;
};

function dayIndexInWeek(ms: number, mondayMs: number): number | null {
  const delta = Math.floor((ms - mondayMs) / 86_400_000);
  if (delta < 0 || delta > 6) return null;
  return delta;
}

function barsForPlot(plot: PlotSnapshot, mondayMs: number, weekEndMs: number): CalBar[] {
  const now = Date.now();
  const today = dayIndexInWeek(now, mondayMs);
  const bars: CalBar[] = LIVEOPS_WEEKLY_EVENTS.map((event) => ({
    ...event,
    live: today != null && event.startDay <= today && today <= event.endDay,
  }));

  const cycle = plot.eventState.cycle;
  const cycleStart = dayIndexInWeek(Math.max(cycle.startedAt, mondayMs), mondayMs);
  const cycleEnd = dayIndexInWeek(Math.min(cycle.endsAt - 1, weekEndMs - 1), mondayMs);
  if (cycleStart != null && cycleEnd != null && cycleEnd >= cycleStart) {
    bars.unshift({
      id: `cycle:${cycle.state}`,
      name: `Market Cycle · ${cycle.state}`,
      group: "Market",
      tone: "purple",
      startDay: cycleStart,
      endDay: cycleEnd,
      live: cycle.startedAt <= now && now < cycle.endsAt,
      durationLabel: `${Math.max(1, Math.round((cycle.endsAt - cycle.startedAt) / 3_600_000))}h`,
      qualifying: plot.eventState.globalEvent.event,
      rewards: `Demand ${Math.round(plot.eventState.modifiers.demandBps / 100)}% · Hunt ×${plot.eventState.globalEvent.huntSpawnMultiplier}`,
    });
  }

  for (const window of plot.eventCalendar?.announced ?? []) {
    const start = dayIndexInWeek(Math.max(window.startsAt, mondayMs), mondayMs);
    const end = dayIndexInWeek(Math.min(window.endsAt - 1, weekEndMs - 1), mondayMs);
    if (start == null || end == null || end < start) continue;
    bars.push({
      id: `window:${window.eventId}`,
      name: window.title,
      group: "Market",
      tone: "blue",
      startDay: start,
      endDay: end,
      live: plot.eventCalendar?.current?.eventId === window.eventId,
      durationLabel: `${window.durationHours}h`,
      qualifying: "Announced major window this week",
      rewards: "Live modifiers while the window is open",
    });
  }

  return bars;
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function remainLabel(ms: number): string {
  const hours = Math.max(0, Math.floor(ms / 3_600_000));
  if (hours >= 24) return `${Math.floor(hours / 24)}d ${hours % 24}h left`;
  const minutes = Math.max(0, Math.floor((ms % 3_600_000) / 60_000));
  return `${hours}h ${minutes}m left`;
}

function formatDayHead(mondayMs: number, index: number) {
  const date = new Date(mondayMs + index * 86_400_000);
  return {
    name: DAY_NAMES[index]!,
    date: `${MONTHS[date.getUTCMonth()]} ${date.getUTCDate()}`,
  };
}

/** Full-screen Event calendar — left list + week grid of overlapping campaigns. */
export function EventsOverlay({ plot, onClose }: { plot: PlotSnapshot; onClose: () => void }) {
  const choose = useEventChoose();
  const claimMission = useEventMissionClaim();
  const openCase = useOpenLiveopsCase();
  const unlockPass = useUnlockSeasonPass();
  const claimPass = useClaimSeasonPass();
  const buySku = useBuyLiveopsSku();
  const faucet = useLiveopsFaucet();
  const week = plot.eventCalendar?.week ?? isoWeek();
  const mondayMs = weekMondayUtcMs(week);
  const weekEndMs = mondayMs + 7 * 86_400_000;
  const todayIdx = dayIndexInWeek(Date.now(), mondayMs);
  const bars = useMemo(() => barsForPlot(plot, mondayMs, weekEndMs), [plot, mondayMs, weekEndMs]);
  const [selectedId, setSelectedId] = useState<string>("calendar");
  const selected = bars.find((bar) => bar.id === selectedId) ?? null;
  const campaigns = plot.liveops?.campaigns ?? [];
  const campaignById = new Map(campaigns.map((campaign) => [campaign.id, campaign]));
  const selectedCampaign = selected ? campaignById.get(selected.id) : null;
  const board = useLiveopsLeaderboard(selectedCampaign?.id ?? campaigns[0]?.id ?? null);
  const pass = plot.liveops?.pass;
  const groups = useMemo(() => {
    const map = new Map<string, CalBar[]>();
    for (const bar of bars) {
      const list = map.get(bar.group) ?? [];
      list.push(bar);
      map.set(bar.group, list);
    }
    return [...map.entries()];
  }, [bars]);

  const eventState = plot.eventState;
  const global = eventState.globalEvent;
  const bag = (plot.liveops?.inventory ?? []).filter((item) => item.quantity > 0);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const showLiveActions = selectedId === `cycle:${eventState.cycle.state}` || selectedId === "calendar";

  return (
    <section className="events-overlay" role="dialog" aria-label="Events">
      <div className="events-page">
        <div className="events-mist" aria-hidden />
        <header className="events-page-head">
          <button type="button" className="events-back" onClick={onClose} aria-label="Close events">
            <ChevronLeft size={22} strokeWidth={2.4} />
            <b>Event</b>
          </button>
          <span className="events-week-chip">This week · {week}</span>
          <button className="events-close" type="button" aria-label="Close" onClick={onClose}>
            <X size={16} />
          </button>
        </header>

        <div className="events-page-body">
          <nav className="events-side" aria-label="Event list">
            <button
              type="button"
              className={`events-side-item top${selectedId === "calendar" ? " active" : ""}`}
              onClick={() => setSelectedId("calendar")}
            >
              Event Calendar
            </button>
            {groups.map(([group, items]) => (
              <div key={group} className="events-side-group">
                <span className="events-side-banner">{group}</span>
                {items.map((item) => (
                  <button
                    type="button"
                    key={item.id}
                    className={`events-side-item${selectedId === item.id ? " active" : ""}`}
                    onClick={() => setSelectedId(item.id)}
                  >
                    <span>{item.name}</span>
                    {item.live ? <i className="events-live-dot" title="Live" /> : null}
                  </button>
                ))}
              </div>
            ))}
          </nav>

          <div className="events-main">
            {campaigns.length ? (
              <div className="ev-live-strip">
                {campaigns.map((campaign) => {
                  const goal = campaign.nextMilestonePoints ?? campaign.milestones.at(-1)?.points ?? 1;
                  const pct = Math.min(100, Math.round((campaign.points / Math.max(1, goal)) * 100));
                  return (
                    <button
                      type="button"
                      key={`${campaign.id}:${campaign.seasonId}`}
                      className={`ev-live-card tone-${campaign.tone}${selectedId === campaign.id ? " selected" : ""}`}
                      onClick={() => setSelectedId(campaign.id)}
                    >
                      <b>{campaign.name}</b>
                      <span>
                        {campaign.points}
                        {campaign.nextMilestonePoints != null ? ` / ${campaign.nextMilestonePoints}` : ""} pts · #{campaign.rank}/{campaign.fieldSize} · {remainLabel(campaign.remainingMs)}
                      </span>
                      <span className="ev-progress">
                        <i style={{ width: `${pct}%` }} />
                      </span>
                    </button>
                  );
                })}
              </div>
            ) : null}
            <div className="evcal" style={{ ["--today" as string]: String((todayIdx ?? 0) + 1) }}>
              <div className="evcal-head">
                {DAY_NAMES.map((name, i) => {
                  const head = formatDayHead(mondayMs, i);
                  return (
                    <div key={name} className={`evcal-dayhead${todayIdx === i ? " today" : ""}`}>
                      <b>{head.name}</b>
                      <span>{head.date}</span>
                    </div>
                  );
                })}
              </div>
              <div className="evcal-rows">
                {bars.map((bar) => (
                  <div key={bar.id} className="evcal-row">
                    <button
                      type="button"
                      className={`evcal-bar tone-${bar.tone}${selectedId === bar.id ? " selected" : ""}${bar.startDay === bar.endDay ? " short" : ""}${campaignById.has(bar.id) || bar.live ? " live" : ""}`}
                      style={{ gridColumn: `${bar.startDay + 1} / ${bar.endDay + 2}` }}
                      onClick={() => setSelectedId(bar.id)}
                    >
                      <i className="evcal-bar-mark" aria-hidden />
                      <span>{bar.name}</span>
                    </button>
                  </div>
                ))}
              </div>
            </div>

            {selected ? (
              <aside className={`events-detail tone-${selected.tone}`}>
                <header>
                  <small>
                    {selected.group}
                    {selectedCampaign || selected.live ? " · Live now" : ""}
                  </small>
                  <h3>{selected.name}</h3>
                  <p>
                    {selectedCampaign ? remainLabel(selectedCampaign.remainingMs) : selected.durationLabel}
                    {selectedCampaign ? ` · ${selectedCampaign.points} pts` : ""}
                  </p>
                </header>
                <div>
                  <dl>
                    <div>
                      <dt>Qualifying</dt>
                      <dd>{selectedCampaign?.qualifyingCopy ?? selected.qualifying}</dd>
                    </div>
                    <div>
                      <dt>Rewards</dt>
                      <dd>{selectedCampaign?.rewardsCopy ?? selected.rewards}</dd>
                    </div>
                  </dl>
                  {selectedCampaign ? (
                    <p className="ev-rank">
                      Rank {selectedCampaign.rank} of {selectedCampaign.fieldSize} in your bracket
                    </p>
                  ) : null}
                  {selectedCampaign ? (
                    <div className="ev-miles">
                      {selectedCampaign.milestones.map((milestone) => (
                        <span key={milestone.id} className={`ev-mile${milestone.claimed ? " claimed" : ""}`}>
                          {milestone.claimed ? "✓" : milestone.points} {milestone.label}
                        </span>
                      ))}
                    </div>
                  ) : null}
                </div>
              </aside>
            ) : null}

            {showLiveActions ? (
              <div className="events-live">
                <div className="event-summary">
                  <b>{global.event}</b>
                  <span>
                    {global.category} · {global.tone} · {global.durationHours}h · Hunt ×{global.huntSpawnMultiplier}
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
              </div>
            ) : null}

            {pass ? (
              <div className="ev-pass">
                <header>
                  <div>
                    <h3>Season Pass · {pass.seasonId}</h3>
                    <small>
                      Lv {pass.level} · {pass.xp} XP
                      {pass.nextCumulativeXp != null ? ` / ${pass.nextCumulativeXp}` : ""} · {remainLabel(pass.remainingMs)}
                    </small>
                  </div>
                  {pass.premium ? (
                    <span className="ev-pass-flag">Premium</span>
                  ) : (
                    <button type="button" className="claim" disabled={unlockPass.isPending} onClick={() => unlockPass.mutate()}>
                      Unlock Premium · {pass.passPlot.toLocaleString()} $PLOT
                    </button>
                  )}
                </header>
                <span className="ev-progress">
                  <i
                    style={{
                      width: `${Math.min(100, pass.nextCumulativeXp ? Math.round((pass.xp / pass.nextCumulativeXp) * 100) : 100)}%`,
                    }}
                  />
                </span>
                <div className="ev-pass-track">
                  {pass.levels
                    .filter((row) => row.level <= Math.max(5, pass.level + 2))
                    .map((row) => (
                      <div key={row.level} className={`ev-pass-level${row.major ? " major" : ""}${row.level <= pass.level ? " reached" : ""}`}>
                        <b>Lv {row.level}</b>
                        <button
                          type="button"
                          disabled={row.level > pass.level || row.free.claimed || claimPass.isPending}
                          onClick={() => claimPass.mutate({ level: row.level, track: "free" })}
                        >
                          {row.free.claimed ? "Claimed" : row.free.label}
                        </button>
                        <button
                          type="button"
                          disabled={!pass.premium || row.level > pass.level || row.premium.claimed || claimPass.isPending}
                          onClick={() => claimPass.mutate({ level: row.level, track: "premium" })}
                        >
                          {row.premium.claimed ? "Claimed" : row.premium.label}
                        </button>
                      </div>
                    ))}
                </div>
              </div>
            ) : null}

            {board.data && Array.isArray((board.data as { top?: unknown[] }).top) ? (
              <div className="ev-board">
                <h3>Leaderboard{(board.data as { bracket?: string }).bracket ? ` · ${(board.data as { bracket: string }).bracket}` : ""}</h3>
                <ol>
                  {((board.data as { top: { rank: number; playerId: string; points: number; you?: boolean }[] }).top ?? []).map((row) => (
                    <li key={`${row.rank}-${row.playerId}`} className={row.you ? "you" : ""}>
                      <span>#{row.rank}</span>
                      <b>{row.you ? "You" : row.playerId}</b>
                      <em>{row.points} pts</em>
                    </li>
                  ))}
                </ol>
              </div>
            ) : null}

            {plot.liveops?.shop ? (
              <div className="ev-shop">
                <header>
                  <h3>Shop</h3>
                  <small>{plot.plotBalance.toLocaleString()} $PLOT</small>
                  {plot.liveops.shop.faucet ? (
                    <button type="button" className="verb" disabled={faucet.isPending} onClick={() => faucet.mutate()}>
                      Dev faucet
                    </button>
                  ) : null}
                </header>
                <div className="ev-shop-grid">
                  {plot.liveops.shop.offers.map((offer) => (
                    <button
                      type="button"
                      key={offer.sku}
                      className="ev-shop-card"
                      disabled={offer.remaining <= 0 || buySku.isPending}
                      onClick={() => buySku.mutate({ sku: offer.sku, quoteId: offer.quoteId })}
                    >
                      <small>{offer.slot}</small>
                      <b>{offer.name}</b>
                      <span>{offer.contents.join(" · ")}</span>
                      <em>
                        {offer.payment === "plot" ? `${offer.plotPrice.toLocaleString()} $PLOT` : cashLabel(offer.cashMinor)}
                        {` · ${offer.remaining} left`}
                      </em>
                    </button>
                  ))}
                </div>
              </div>
            ) : null}

            {plot.liveops?.cases ? (
              <div className="ev-cases">
                <h3>Cases</h3>
                <div className="ev-case-grid">
                  <button
                    type="button"
                    className="ev-case-card"
                    disabled={!plot.liveops.cases.dailyAvailable || openCase.isPending}
                    onClick={() => openCase.mutate("daily")}
                  >
                    <b>Daily Case</b>
                    <small>{plot.liveops.cases.dailyAvailable ? "1 free today" : "Already opened today"}</small>
                  </button>
                  <button
                    type="button"
                    className="ev-case-card"
                    disabled={plot.liveops.cases.businessKeys <= 0 || openCase.isPending}
                    onClick={() => openCase.mutate("business")}
                  >
                    <b>Business Case</b>
                    <small>
                      {plot.liveops.cases.businessKeys} key{plot.liveops.cases.businessKeys === 1 ? "" : "s"}
                      {plot.liveops.cases.pity.business > 0 ? ` · pity ${plot.liveops.cases.pity.business}/12` : ""}
                    </small>
                  </button>
                  <button
                    type="button"
                    className="ev-case-card"
                    disabled={plot.liveops.cases.marketKeys <= 0 || openCase.isPending}
                    onClick={() => openCase.mutate("market")}
                  >
                    <b>Market Case</b>
                    <small>
                      {plot.liveops.cases.marketKeys} key{plot.liveops.cases.marketKeys === 1 ? "" : "s"}
                      {plot.liveops.cases.pity.market > 0 ? ` · pity ${plot.liveops.cases.pity.market}/12` : ""}
                    </small>
                  </button>
                  <button
                    type="button"
                    className="ev-case-card"
                    disabled={plot.liveops.cases.eventKeys <= 0 || openCase.isPending}
                    onClick={() => openCase.mutate("event")}
                  >
                    <b>Event Case</b>
                    <small>
                      {plot.liveops.cases.eventKeys} key{plot.liveops.cases.eventKeys === 1 ? "" : "s"}
                      {plot.liveops.cases.pity.event > 0 ? ` · pity ${plot.liveops.cases.pity.event}/20` : ""}
                    </small>
                  </button>
                  <button
                    type="button"
                    className="ev-case-card"
                    disabled={plot.liveops.cases.executiveKeys <= 0 || openCase.isPending}
                    onClick={() => openCase.mutate("executive")}
                  >
                    <b>Executive Case</b>
                    <small>
                      {plot.liveops.cases.executiveKeys} key{plot.liveops.cases.executiveKeys === 1 ? "" : "s"}
                      {plot.liveops.cases.pity.executive > 0 ? ` · pity ${plot.liveops.cases.pity.executive}/20` : ""}
                    </small>
                  </button>
                  <button
                    type="button"
                    className="ev-case-card"
                    disabled={plot.liveops.cases.tycoonKeys <= 0 || openCase.isPending}
                    onClick={() => openCase.mutate("tycoon")}
                  >
                    <b>Tycoon Case</b>
                    <small>
                      {plot.liveops.cases.tycoonKeys} key{plot.liveops.cases.tycoonKeys === 1 ? "" : "s"}
                      {plot.liveops.cases.pity.tycoon > 0 ? ` · pity ${plot.liveops.cases.pity.tycoon}/30` : ""}
                    </small>
                  </button>
                </div>
                {plot.liveops.cases.lastOpen ? (
                  <p className="ev-case-last">Last open: {plot.liveops.cases.lastOpen.label}</p>
                ) : null}
              </div>
            ) : null}

            {bag.length ? (
              <div className="liveops-bag" aria-label="LiveOps inventory">
                {bag.map((item) => (
                  <span key={item.itemId} className="liveops-chip" title={`${item.name} · ${item.category}`}>
                    <i>{item.icon}</i>
                    <b>{item.quantity}</b>
                    <small>{item.name}</small>
                  </span>
                ))}
              </div>
            ) : null}

            <p className="events-footnote">Event windows follow the weekly LiveOps calendar and may shift with the market cycle.</p>
          </div>
        </div>
      </div>
    </section>
  );
}


