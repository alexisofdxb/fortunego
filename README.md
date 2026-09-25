# PlotGo — Founder Plot

Buy a Plot → open your 12×12 → place financial Building Cards → earn Cash → complete a Market Hunt → collect stock fragments → grow Empire Value.

This is the first paid product, not the full city map and not `$PLOT` redemption.

## What ships

- One 12×12 board
- 50-building catalog with 3 upgrade stages
- Server-authoritative placement, rotation, relocation downtime, synergies, districts, congestion, and special tiles
- Activity-based Cash (one server-settled district action per UTC day)
- One daily Market Hunt
- Ten in-game stock fragments
- Empire Value
- Weekly Empire Score with calibrated payout flow
- Phase 5 player economy: visit another founder's plot (trade / deposit / borrow, one per visitor-host UTC day, fee + notional credited to the host in one transaction) and visitor investment (revenue share, principal guaranteed, host keeps the capital, 3-day term) with a privacy-filtered public board read model and empire / cash_7d / reputation leaderboards
- Persistence by player id

Charge is for the **Plot**, $15–$25, later. Dev grants a Founder Plot on first session.

## Stack

Monorepo (pnpm workspaces), aligned with `docs/PLOT_Technology_Stack_Architecture_v1.0.xlsx`:

- `apps/web` — React 18 app shell + TanStack Query + Zustand, PixiJS v8 board renderer (Vite)
- `apps/api` — Hono modular monolith: `domains/` (thin `<name>.routes.ts` over domain services), `middleware/`, `infrastructure/` (postgres, tasks; redis/pubsub/blockchain/providers deferred), `shared/` — Zod validation, Prisma ORM
- `packages/game` — pure deterministic simulation (no I/O): the canonical customer/economic model from `docs/PLOT_Customer_Economic_Simulation_v0.1.xlsx` (7 persistent customer segments, affinity-weighted demand, acquisition/churn steady-state, congestion bands, maturation flows, 12 economic event families, doc-calibrated building economics); imported by api + web
- `packages/shared` — Zod DTO contracts shared between api and web
- PostgreSQL 16 via Docker Compose; migrations via Prisma

## Run

Prereqs: Node ≥ 20.19, pnpm 10, Docker.

```bash
cp .env.example .env          # then edit ADMIN_TOKEN
docker compose up -d db       # PostgreSQL on localhost:5434 (+ Adminer on 8080)
pnpm install
pnpm db:push                  # prisma migrate dev
pnpm dev                      # api :8787 + web :5173
```

Web: http://localhost:5173
API: http://localhost:8787
Adminer: http://localhost:8080 (server `db`, user `plotgo`, password `plotgo`)

Other scripts: `pnpm typecheck` · `pnpm test:balance` · `pnpm test:onboarding` · `pnpm test:visits` · `pnpm test:retention` · `pnpm test:customers` · `pnpm simulate:performance` · `pnpm build`

## Architecture notes

- **Customer model** (`PLOT_Customer_Economic_Simulation_v0.1`, canonical): per-player persistent segment counts advance daily through acquisition/churn dynamics toward affinity-weighted building targets; the 24h new-player boost (3×) guarantees first customers; offline catch-up steps the same dynamics at band efficiencies. Deviation kept by decision: offline cap stays 12h (retention-loop canonical supersedes the doc's 8h).
- **Server-authoritative**: all economy state lives in the API; the client renders and validates placement client-side via `packages/game`.
- **Ledger-first**: every cash/fragment mutation is an append-only ledger entry.
- **Idempotent settlements**: daily settle is guarded by a unique `(player, day)` session row; weekly finalize is admin-gated, re-runnable, and stamps a frozen snapshot manifest (`weekly_snapshots`: source cursors, FNV-1a checksums, module lineage refs) onto `weekly_performance` rows.
- **Scheduler**: in-process job runner — daily 00:00 UTC reset (3 hunt offers, 3 objectives, expiry, active-day finalize), craft completion, hunt/event expiry, weekly countdown, notification dispatch, and a daily module-inventory reconcile — all idempotent with jittered intervals.
- **Retention loop** (per `docs/PLOT_Daily_Weekly_Retention_Loop_v1.0.xlsx`): 3 hunt offers/day (max 5 active, 1 free reroll), 3 daily business objectives (Operations/Growth/Market, Cash-only ≤5% of median stage earnings, server-evidence completion), eligible active-day rule (10 engaged min + 1 meaningful action; heartbeat never counts), cosmetic Operating Streak, weekly epoch with Pending→Final settlement state, deterministic announced event calendar, and a bounded notification inbox (no login rewards, no streak-loss pushes, no profit language).
- **Rate limits**: in-memory sliding window — 120/min default, 20/min settle/claims/event choices, 30/min layout mutations (single-process; Redis later).
- **Module lineage**: settlement ledger entries pin `moduleLoadoutVersions` + `moduleConfigVersion` whenever equipped modules affect the outcome.
- **Identity is prototype-grade**: `x-player-id` header = the whole auth model, kept only for local dev. Replace with real auth (FamilySDK) before any deployment.
- Admin endpoints (`POST /api/performance/finalize`) require `Authorization: Bearer $ADMIN_TOKEN`.

## Roadmap (deferred from the target architecture doc)

- FamilySDK auth bridge (signed sessions + wallet linking) — the one deliberately un-closed spec gap
- Redis + BullMQ durable queue (the in-process scheduler is the local stand-in)
- Socket.IO realtime pushes (currently 10s polling)
- Blockchain settlement (`$PLOT` ERC-20, stock-fragment ERC-1155)
- External stock prices (docs/PlotGo.md Phase 7) and friends/deals/market cycles (Phase 8)
- Investor cancel, investment insurance, invest-into-portfolio (fund marks)
- GCP → VPS deployment (compose file is local-dev shaped)
- Phase 5 follow-up: weight `playerRevenueMinor` (1.5× per spec) and `investYieldMinor` into the performance score (columns are recorded; recalibrating `PERFORMANCE_RUNTIME_TARGETS` + balance tests is deferred)
- Spec P1+ scope: 6-category risk model, leagues/seasons/rating, integrity-case workflow, phased settlement state machine (snapshot→reconcile→finalize runs inline today)
- CI: onboarding acceptance needs a Postgres service container

See `docs/AUDIT.md` for the full audit and `docs/` for the design workbooks.
