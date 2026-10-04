# liveops

LiveOps item bag for events, earned cases, and later packs/pass
(`Fortune_Go_LiveOps_Events_Gacha_Packs_Design_v1.0`).

Phase 0: catalog + grant/spend inventory.
Phase 1: overlapping campaign windows, `scoreAction` on place/upgrade/land/hunt/settle,
milestone Cash + item grants.
Phase 2: Daily / Business / Market cases (`POST /api/liveops/cases/open`), server RNG,
pity 12 for keyed cases, duplicate modules → shards.
Phase 3: hunt-ticket copy on the HUD (hunts stay startable without a ticket);
milestone + case-ready inbox notifications; `pnpm test:liveops`.
Phase 4: Event/Executive/Tycoon cases (pity 20/20/30), 28-day season pass (30 levels,
premium flag until $PLOT), campaign leaderboard by empire-level bracket.
Phase 5: deterministic $PLOT packs, USD-anchored quotes (15m TTL, 5% reprice),
shop rotation, pass unlock spends 666 $PLOT, dev faucet.
Market-cycle events stay in `domains/events`.
