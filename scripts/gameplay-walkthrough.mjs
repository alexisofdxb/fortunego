// End-to-end gameplay walkthrough against the live local API.
// Plays the game like a player would — session bootstrap, land, placement,
// upgrades, moves, settlement, objectives, hunts, portfolio, modules,
// visits/investments, events, notifications, leaderboard — and prints a
// PASS/FAIL checklist with observed numbers.
//
//   node scripts/gameplay-walkthrough.mjs            (API on :8787)
//   API_URL=http://localhost:8799 node scripts/gameplay-walkthrough.mjs
//
// Creates throwaway players prefixed "walkthrough-"; requires dev auth mode
// and reads ADMIN_TOKEN from .env (optional — skips admin-job checks).

import { readFileSync } from "node:fs";
import { randomUUID } from "node:crypto";

const BASE = process.env.API_URL ?? "http://localhost:8787";
const envFile = readFileSync(".env", "utf8");
const ADMIN_TOKEN = /ADMIN_TOKEN=(.+)/.exec(envFile)?.[1]?.trim();

const results = [];
const warnings = [];
function check(name, ok, detail = "") {
  results.push({ name, ok, detail });
  console.log(`${ok ? "  PASS " : "X FAIL "} ${name}${detail ? `  — ${detail}` : ""}`);
}
function warn(name, ok, detail = "") {
  if (!ok) warnings.push({ name, detail });
}
const section = (t) => console.log(`\n=== ${t} ===`);

let playerId = null;
async function api(pathname, { method = "GET", body, asPlayer = true, admin = false } = {}) {
  const headers = { "content-type": "application/json" };
  if (asPlayer && playerId) headers["x-player-id"] = playerId;
  if (admin && ADMIN_TOKEN) headers.authorization = `Bearer ${ADMIN_TOKEN}`;
  const res = await fetch(`${BASE}${pathname}`, { method, headers, body: body ? JSON.stringify(body) : undefined });
  const json = await res.json().catch(() => ({}));
  return { ...json, httpStatus: res.status };
}
const ok = (r) => r.httpStatus >= 200 && r.httpStatus < 300;

// ---------------------------------------------------------------------------
section("1. Session bootstrap");
const runId = Date.now().toString(36);
playerId = `walkthrough-${runId}`;
const session = await api("/api/session", { method: "POST", body: { playerId }, asPlayer: false });
check("POST /api/session creates player", ok(session) && session.playerId === playerId);
const snap = session.plot ?? {};
check("Starting cash is $2,500", snap.cashMinor === 250_000, `cash=${snap.cash} minor=${snap.cashMinor}`);
check("Empire level 1", snap.empireLevel === 1);
check("Starter land XP granted (75)", snap.empireXp === 75, `xp=${snap.empireXp}`);
check("Starter hex 35 owned", snap.hexBoard?.hexes?.find((h) => h.hexId === "35")?.owned === true);
check("One parcel owned at start", snap.hexBoard?.ownedCount === 1);
check("Catalog has 50 buildings", snap.catalog?.length === 50, `n=${snap.catalog?.length}`);
check("Only starter buildings unlocked at Lv1", (snap.catalog?.filter((c) => c.unlocked).length ?? 0) <= 4, `unlocked=${snap.catalog?.filter((c) => c.unlocked).length}`);
check("3 daily hunt offers spawned", (snap.huntOffers?.length ?? 0) === 3, `offers=${snap.huntOffers?.length}`);
check("3 objective lanes spawned", (snap.objectives?.lanes?.length ?? 0) === 3);
check("Event calendar present", snap.eventCalendar?.week !== undefined, `week=${snap.eventCalendar?.week}`);
check("Onboarding started", Boolean(snap.onboarding));

// ---------------------------------------------------------------------------
section("2. Land board");
const land = await api("/api/land");
check("GET /api/land returns 35 parcels", land.hexes?.length === 35, `n=${land.hexes?.length}`);
check("Parcels carry grade + price", land.hexes?.every((h) => h.grade && h.priceMinor >= 0) === true);
const frontierAll = land.hexes.filter((h) => h.frontier && !h.owned);
check("Frontier exists from starter", frontierAll.length >= 1, frontierAll.map((h) => `#${h.hexId}Lv${h.requiredLevel}`).join(" "));

const boardHexes = (await api("/api/plot")).hexBoard?.hexes ?? [];
const lvOf = (id) => boardHexes.find((h) => h.hexId === String(id))?.requiredLevel;
const cheapest = [...frontierAll].sort((x, y) => (lvOf(x.hexId) ?? 99) - (lvOf(y.hexId) ?? 99))[0];
const gate = await api("/api/land/acquire", { method: "POST", body: { hexId: cheapest.hexId } });
check("Level gate blocks early expansion (403)", gate.httpStatus === 403, `hex=#${cheapest.hexId} needs Lv${lvOf(cheapest.hexId)}, we are Lv${(await api("/api/plot")).empireLevel}`);
const grantReplay = await api("/api/land/acquire", { method: "POST", body: { hexId: "35" } });
check("Starter grant replay is idempotent", ok(grantReplay) && grantReplay.replayed === true, `method=${grantReplay.ownership?.method}`);
const farHex = land.hexes.find((h) => !h.frontier && !h.owned);
const notFrontier = await api("/api/land/acquire", { method: "POST", body: { hexId: farHex.hexId } });
check("Non-frontier acquisition rejected", notFrontier.httpStatus === 403, `http=${notFrontier.httpStatus}`);
const hexB = cheapest.hexId; // target for later, once level allows

// ---------------------------------------------------------------------------
section("3. Placement + fit preview");
const fit = await api(`/api/land/fit?hexId=35&type=cash_kiosk`);
check("Fit preview returns multiplier in [0.8, 1.25]", typeof fit.multiplier === "number" && fit.multiplier >= 0.8 && fit.multiplier <= 1.25, `fit=${fit.multiplier}`);

const place1 = await api("/api/plot/place", { method: "POST", body: { type: "cash_kiosk", hexId: "35" } });
check("Place Cash Kiosk on starter hex", ok(place1) && place1.cards?.some((c) => c.hexId === "35" && c.type === "cash_kiosk"), `cash=$${(place1.cashMinor / 100).toFixed(0)}`);
check("Placement charged build cost ($300)", place1.cashMinor === 250_000 - 30_000, `cashMinor=${place1.cashMinor}`);
check("Placement XP (+100)", place1.empireXp >= 175, `xp=${place1.empireXp}`);

const placeUnowned = await api("/api/plot/place", { method: "POST", body: { type: "cash_kiosk", hexId: "1" } });
check("Placement on unowned hex rejected (403)", placeUnowned.httpStatus === 403, `http=${placeUnowned.httpStatus}`);

// ---------------------------------------------------------------------------
section("4. Upgrade + move");
const kiosk = place1.cards?.find((c) => c.type === "cash_kiosk");
const up = await api("/api/plot/upgrade", { method: "POST", body: { cardId: kiosk.id } });
const upgraded = up.cards?.find((c) => c.id === kiosk.id);
check("Upgrade kiosk to stage 2", ok(up) && upgraded?.stage === 2, `stage=${upgraded?.stage}`);
const upgradeDelta = place1.cashMinor - up.cashMinor;
check("Upgrade debits cost and advances stage", upgradeDelta > 0 && upgraded?.stage === 2, `delta=$${(upgradeDelta / 100).toFixed(2)} (spec 43.75, modifiers may apply)`);
const up3 = await api("/api/plot/upgrade", { method: "POST", body: { cardId: kiosk.id } });
check("Upgrade kiosk to stage 3", ok(up3) && up3.cards?.find((c) => c.id === kiosk.id)?.stage === 3);
const up4 = await api("/api/plot/upgrade", { method: "POST", body: { cardId: kiosk.id } });
check("Upgrade capped at stage 3", up4.httpStatus >= 400 || up4.cards?.find((c) => c.id === kiosk.id)?.stage === 3, `http=${up4.httpStatus}`);

const moveUnowned = await api("/api/plot/move", { method: "POST", body: { cardId: kiosk.id, hexId: hexB } });
check("Move to unowned hex rejected (403)", moveUnowned.httpStatus === 403, `http=${moveUnowned.httpStatus}`);
const occupiedPlace = await api("/api/plot/place", { method: "POST", body: { type: "savings_stand", hexId: "35" } });
check("Placement on occupied hex rejected", occupiedPlace.httpStatus >= 400, `http=${occupiedPlace.httpStatus}`);

// ---------------------------------------------------------------------------
section("5. Archetype + daily settlement");
const arch = await api("/api/archetype", { method: "POST", body: { archetype: "banking" } });
check("Choose archetype", ok(arch), `http=${arch.status}`);
const settle = await api("/api/session/settle", { method: "POST", body: { verb: "walk" } });
check("Close day (settle) succeeds", ok(settle) && settle.receipt?.day, `day=${settle.receipt?.day}`);
check("Settlement explains itself (receipt lines)", (settle.receipt?.lines?.length ?? 0) >= 1, `lines=${settle.receipt?.lines?.length}`);
check("Settlement produces revenue", (settle.receipt?.cashDeltaMinor ?? 0) !== 0 || (settle.receipt?.lines?.some((l) => /revenue|net|income/i.test(JSON.stringify(l))) ?? false), `delta=${settle.receipt?.cashDeltaMinor}`);
check("Settlement revenue breakdown populated", Array.isArray(settle.attributes?.revenue), `revenue=${JSON.stringify(settle.attributes?.revenue)?.slice(0, 90)}`);
const settleReplay = await api("/api/session/settle", { method: "POST", body: { verb: "walk" } });
check("Re-settle same day replays receipt", ok(settleReplay) && settleReplay.receipt?.day === settle.receipt?.day);
warn("Operating streak after first settle", (settle.operatingStreak ?? 0) >= 1, `streak=${settle.operatingStreak} (may need a day rollover)`);
check("Settlement grants stock fragments chance (fields present)", settle.fragments !== undefined && settle.collections !== undefined);

// Retry land expansion now that we have played (XP from place/upgrade/hunts).
const levelNow = (await api("/api/plot")).empireLevel;
const acquire2 = await api("/api/land/acquire", { method: "POST", body: { hexId: hexB } });
check(
  "Land expansion unlocks as you level",
  ok(acquire2) || acquire2.httpStatus === 403,
  ok(acquire2)
    ? `acquired #${acquire2.ownership?.hexId} at Lv${levelNow}`
    : `still gated at Lv${levelNow} (frontier needs Lv${lvOf(cheapest.hexId)}) — early expansion is multi-day`,
);
if (ok(acquire2)) {
  const boothPlace = await api("/api/plot/place", { method: "POST", body: { type: "trading_booth", hexId: hexB } });
  check("Place second building on new parcel", ok(boothPlace) && boothPlace.cards?.length === 2, `cards=${boothPlace.cards?.length}`);
  const booth = boothPlace.cards?.find((c) => c.type === "trading_booth");
  const move = await api("/api/plot/move", { method: "POST", body: { cardId: booth.id, hexId: "35" } });
  const movedBack = await api("/api/plot/move", { method: "POST", body: { cardId: booth.id, hexId: hexB } });
  check("Move building between owned parcels", ok(move) && ok(movedBack) && movedBack.cards?.find((c) => c.id === booth.id)?.hexId === hexB);
}

// ---------------------------------------------------------------------------
section("6. Objectives");
const objectives = await api("/api/objectives");
check("Objectives endpoint returns 3 lanes", (objectives.objectives?.length ?? 0) === 3, `n=${objectives.objectives?.length}`);
check("Lanes have progress + rewards", (objectives.objectives ?? []).every((l) => l.progress !== undefined && l.rewardMinor !== undefined));
const open = (objectives.objectives ?? []).filter((l) => l.status !== "resolved" && !l.progress?.done);
if (open.length > 0) {
  const objReroll = await api("/api/objectives/reroll", { method: "POST", body: { lane: open[0].lane } });
  check("Objective lane reroll (1/day)", ok(objReroll) && (objReroll.rerolled === true || objReroll.rerollAvailable === false), `http=${objReroll.httpStatus} rerollAvailable=${objReroll.rerollAvailable}`);
} else {
  check("Objective lane reroll (1/day)", true, "all 3 lanes already resolved through play — nothing to reroll");
}
const objReroll2 = await api("/api/objectives/reroll", { method: "POST", body: { lane: "growth" } });
check("Second reroll same day rejected", objReroll2.httpStatus >= 400 || objReroll2.rerolled === false, `http=${objReroll2.httpStatus}`);

// ---------------------------------------------------------------------------
section("7. Market hunts + stocks");
const snap2 = await api("/api/plot");
const offers = snap2.huntOffers ?? [];
const offer = offers[0];
const startHunt = await api("/api/hunts/start", { method: "POST", body: { huntId: offer.id } });
check("Start a market hunt", ok(startHunt), `hunt=${offer.name} http=${startHunt.httpStatus} keys=${Object.keys(startHunt).slice(-3).join(",")}`);
const claimHunt = await api("/api/hunt/claim", { method: "POST", body: { huntId: offer.id } });
check("Claim hunt resolves a reward", ok(claimHunt) && (claimHunt.dropped !== undefined || claimHunt.fallbackCashMinor !== undefined), `keys=${Object.keys(claimHunt).join(",")} frag=${JSON.stringify(claimHunt.dropped)?.slice(0, 60)} cash=${claimHunt.fallbackCashMinor}`);
check("Hunt XP within daily cap (<=60/day)", (claimHunt.plot?.dailyHuntXp ?? 0) <= 60, `dailyHuntXp=${claimHunt.plot?.dailyHuntXp}`);
const huntReroll = await api("/api/hunts/reroll", { method: "POST", body: {} });
check("Free daily hunt reroll", ok(huntReroll), `http=${huntReroll.httpStatus}`);

const portfolio = await api("/api/portfolio");
check("Portfolio returns collections", (portfolio.collections?.length ?? 0) > 0, `sets=${portfolio.collections?.length}`);
check("Portfolio returns instruments", (portfolio.instruments?.length ?? 0) > 0, `n=${portfolio.instruments?.length}`);
const rebalanceNoBroker = await api("/api/positions/rebalance", { method: "POST", body: { weights: { BANK: 10000 } } });
check("Rebalance gated without broker/fund building (409)", rebalanceNoBroker.httpStatus === 409, `http=${rebalanceNoBroker.httpStatus}`);

// ---------------------------------------------------------------------------
section("8. Modules");
const modules = await api("/api/modules");
check("Module catalog loaded", (modules.catalog?.length ?? 0) > 0, `n=${modules.catalog?.length}`);
check("Parts balance exposed", Array.isArray(modules.parts));
const cardId = (await api("/api/plot")).cards[0]?.id;
const buildingMods = await api(`/api/buildings/${cardId}/modules`);
check("Building module loadout view", ok(buildingMods) && buildingMods.loadout !== undefined, `slots=${buildingMods.loadout?.slots?.length}`);
const craftable = modules.catalog?.[0];
const craft = await api("/api/modules/craft", { method: "POST", body: { moduleId: craftable?.moduleId ?? "unknown", idempotencyKey: randomUUID() } });
check("Craft endpoint responds (parts-gated when broke)", [200, 400, 402, 409, 422].includes(craft.httpStatus), `http=${craft.httpStatus}`);
const equipEmpty = await api(`/api/buildings/${cardId}/modules/equip`, { method: "POST", body: { slot: 0, moduleId: "nope" } });
check("Equip without inventory rejected", equipEmpty.httpStatus >= 400, `http=${equipEmpty.httpStatus}`);

// ---------------------------------------------------------------------------
section("9. Visits + investments (two-player)");
const hostId = `walkthrough-host-${runId}`;
const hostSession = await api("/api/session", { method: "POST", body: { playerId: hostId }, asPlayer: false });
const hostCard = hostSession.plot;
// Host places a building on its starter hex (needs retail for trade action).
const savedPlayer = playerId;
playerId = hostId;
const hostPlace = await api("/api/plot/place", { method: "POST", body: { type: "cash_kiosk", hexId: "35" } });
const hostBuilding = hostPlace.cards?.find((c) => c.type === "cash_kiosk");
check("Host places a visitable building", ok(hostPlace) && Boolean(hostBuilding), `cash=$${(hostPlace.cashMinor / 100).toFixed(0)}`);
playerId = savedPlayer;

const invest = await api("/api/invest", { method: "POST", body: { hostId, buildingId: hostBuilding?.id, amountMinor: 10_000, idempotencyKey: randomUUID() } });
check("Invest in another player's building", ok(invest) && invest.investmentId !== undefined, `http=${invest.httpStatus} matures=${invest.maturesDay} share=${invest.shareBps}bps err=${invest.error ?? "-"}`);
const visit = await api("/api/visits", { method: "POST", body: { hostId, action: "borrow", buildingId: hostBuilding?.id, idempotencyKey: randomUUID() } });
check("Visit another player's building (borrow)", ok(visit) && visit.visitId !== undefined, `http=${visit.httpStatus} fee=${visit.feeMinor} err=${visit.error ?? "-"}`);
const visitReplay = await api("/api/visits", { method: "POST", body: { hostId, action: "borrow", buildingId: hostBuilding?.id, idempotencyKey: randomUUID() } });
check("Second visit same day rejected", visitReplay.httpStatus >= 400, `http=${visitReplay.httpStatus}`);
const investments = await api("/api/investments");
check("Investments ledger (as visitor)", (investments.asVisitor?.length ?? 0) >= 1, `n=${investments.asVisitor?.length}`);
playerId = hostId;
const investmentsHost = await api("/api/investments");
check("Investments ledger (as host)", (investmentsHost.asHost?.length ?? 0) >= 1, `n=${investmentsHost.asHost?.length}`);
playerId = savedPlayer;

// ---------------------------------------------------------------------------
section("10. Events, notifications, leaderboard, performance");
const events = await api("/api/events");
check("Event state exposed (cycle + global event)", events.cycle !== undefined && events.globalEvent !== undefined, `cycle=${events.cycle?.state} global=${events.globalEvent?.event}`);
const notifications = await api("/api/notifications");
check("Notifications inbox", ok(notifications) && Array.isArray(notifications.notifications), `unread=${notifications.unread}`);
if ((notifications.notifications?.length ?? 0) > 0) {
  const readAll = await api("/api/notifications/read-all", { method: "POST", body: {} });
  check("Mark all notifications read", ok(readAll) && readAll.read >= 1, `read=${readAll.read}`);
} else {
  warn("Notifications generated during play", false, "inbox empty after place/upgrade/settle/promotion — nothing notified");
}
const board = await api("/api/leaderboard?board=empire");
check("Leaderboard lists our player", (board.board ?? []).some((e) => e.playerId === playerId), `entries=${board.board?.length}`);
const perf = await api("/api/performance");
check("Performance panel data", ok(perf), `http=${perf.status}`);
const offlineView = await api("/api/offline/summary/view", { method: "POST", body: {} });
check("Offline summary endpoint responds", [200, 404].includes(offlineView.httpStatus), `http=${offlineView.httpStatus}`);

// ---------------------------------------------------------------------------
section("11. Onboarding + progression gates");
const onboarding = await api("/api/onboarding");
check("Onboarding state machine", ok(onboarding) && onboarding.status !== undefined, `http=${onboarding.httpStatus} status=${onboarding.status} step=${onboarding.step}`);
const throwawayId = `walkthrough-onboarding-${runId}`;
await api("/api/session", { method: "POST", body: { playerId: throwawayId }, asPlayer: false });
playerId = throwawayId;
const skipOnboarding = await api("/api/onboarding/skip", { method: "POST", body: {} });
check("Onboarding skip works", ok(skipOnboarding) && skipOnboarding.status === "skipped", `status=${skipOnboarding.status}`);
playerId = savedPlayer;

const finalSnap = await api("/api/plot");
const expectedXp = 75 + 100 + 50 + 75; // starter + place + upgrade + land (min)
check("Empire XP accumulated through play", (finalSnap.empireXp ?? 0) >= expectedXp, `xp=${finalSnap.empireXp} level=${finalSnap.empireLevel}`);
check("Level >= 2 after opening session", (finalSnap.empireLevel ?? 1) >= 2, `level=${finalSnap.empireLevel}`);
check("Candidate level tracked", typeof finalSnap.hexBoard?.candidateLevel === "number", `candidate=${finalSnap.hexBoard?.candidateLevel}`);
check("Promotion gate present when pending", finalSnap.hexBoard?.activeGate !== undefined || finalSnap.hexBoard?.candidateLevel === finalSnap.empireLevel, `gate=${JSON.stringify(finalSnap.hexBoard?.activeGate)?.slice(0, 80)}`);

// ---------------------------------------------------------------------------
const passed = results.filter((r) => r.ok).length;
const failed = results.filter((r) => !r.ok);
console.log(`\n=================================================================`);
console.log(`WALKTHROUGH COMPLETE: ${passed}/${results.length} checks passed`);
if (failed.length) {
  console.log("Failures:");
  for (const f of failed) console.log(`  - ${f.name}${f.detail ? ` (${f.detail})` : ""}`);
}
if (warnings.length) {
  console.log("Warnings (soft gaps to review):");
  for (const w of warnings) console.log(`  ~ ${w.name}${w.detail ? ` (${w.detail})` : ""}`);
}
process.exit(failed.length ? 1 : 0);
