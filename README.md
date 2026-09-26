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

## Auth (standalone)

PlotGo is a standalone web game — no host app. Accounts use [Privy](https://privy.io) (`@privy-io/react-auth` on the web, `@privy-io/node` token verification in the API). The player row is auto-created on first login (unique `privyUserId`); every request carries `Authorization: Bearer <privy access token>`, verified server-side (signature + iss/aud/exp), with the player resolved by DID. Login methods: email, Google, Discord; an embedded wallet is created for users without one (keeps the on-chain roadmap open).

Local/CI runs default to `PLOTGO_AUTH_MODE=dev`, which keeps the prototype `x-player-id` identity so no Privy dashboard app is needed. To go live with real accounts:

1. Create an app in the [Privy dashboard](https://dashboard.privy.io); copy the App ID and App Secret.
2. Set `PLOTGO_AUTH_MODE=privy`, `PRIVY_APP_ID`, `PRIVY_APP_SECRET` in `.env`, and `VITE_PRIVY_APP_ID=<app id>` for the web build (e.g. in `apps/web/.env`).
3. Set `WEB_ORIGIN` to your deployed frontend origin.

Manual smoke with real credentials: sign in on the landing screen → the game loads → sign out via the header button → landing returns. `pnpm test:auth` covers fail-fast config, 401s, and the account mapping without needing a Privy app.

## Deploy (local / VPS)

The API serves the built web build (`apps/web/dist`) on the same origin — one process, one port, no CORS. This is also the VPS deploy shape.

```bash
pnpm build                                  # build the web into apps/web/dist
docker compose up -d db                     # database
pm2 start ecosystem.config.cjs              # persistent process (pm2 save / pm2 resurrect)
# -> http://localhost:8787
```

Without pm2, a plain foreground deploy is `cd apps/api && pnpm start` after `pnpm build`. Dev mode (`pnpm dev`) keeps Vite on :5173 with the API on :8787.

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

Other scripts: `pnpm typecheck` · `pnpm test:balance` · `pnpm test:onboarding` · `pnpm test:visits` · `pnpm test:retention` · `pnpm test:customers` · `pnpm test:auth` · `pnpm simulate:performance` · `pnpm build`

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
