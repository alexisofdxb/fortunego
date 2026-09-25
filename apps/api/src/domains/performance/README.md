# performance

Weekly performance scoring read model: score calculation and the accumulator upserts
onto `weekly_performance` (`performance.service.ts`), `GET /api/performance`
(`performance.routes.ts`), and the cross-player leaderboard (`leaderboard.routes.ts`).
The leaderboard is a player-ranking read model; it can move to a `retention/` domain
later. Finalization, snapshot manifests, and payout claims live in `settlement/`.
