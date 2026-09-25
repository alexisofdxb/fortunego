# portfolio

The player's simulated instrument portfolio: stock-fragment holdings view and Phase 4
position allocation/rebalancing (`portfolio.routes.ts`). Positions are marked daily by
the session settle in the `player` domain's settle flow via the shared board service.
