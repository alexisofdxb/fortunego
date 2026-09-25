# PlotGo Repo Audit

**Date:** 2026-09-25
**Repo:** pnpm monorepo (`apps/api` Hono+SQLite, `apps/web` Vite+TS, `packages/game` shared logic). Branch `main`.
**Scope:** full read-only audit — architecture, code quality, correctness, security, dependencies, testing, hygiene.

**Overall verdict:** Clean local-dev prototype — no secrets, no SQL injection, pinned minimal dependency tree, well-factored deterministic game core. But it has real correctness gaps in the API's core economy endpoints, and it is not ready for anything beyond localhost.

---

## Critical

1. **No authentication at all.** Identity = self-asserted `x-player-id` header / `body.playerId` (`apps/api/src/index.ts:1749`, and ~14 other routes). Anyone who knows a player UUID has full read/write access — and `POST /api/session` will *create* a player for any supplied ID. UUIDs are unguessable but sit in plain `localStorage` over unencrypted HTTP.
2. **`/api/performance/finalize` is completely unauthenticated** (`index.ts:2816-2822`) — anyone can finalize a week and trigger global payout mutation for all players. It is also not idempotent: re-running rewrites `score/eligible/payout_plot` after players may have claimed.

## High

3. **Non-idempotent core economy endpoints.** Unlike the module endpoints (which use optimistic versions, idempotency keys, conditional UPDATEs inside transactions), the core routes use stale read-then-write cash:
   - `/api/session/settle` — check-then-act on `plotgo_session` with awaits in between; double-click = double payout (`index.ts:1900-2003`)
   - `/plot/place`, `/plot/upgrade`, `/event/choose` — `p.cashMinor < cost` check, then update with the stale value (`index.ts:2111-2137`, `2245-2256`, `2378`)
4. **The API is never type-checked.** No `tsc` script for `apps/api` (tsx only, no build, no CI); the 2,867-line god-file with 29 hand-rolled `as Record<string, unknown>` row casts relies on tsx runtime leniency. `packages/game` has no tsconfig at all.
5. **No rate limiting** on any of ~30 routes; **`GET /api/leaderboard`** does a full O(players) recompute per request and leaks partial player IDs (`index.ts:2846-2862`).

## Medium

6. **Zod validation errors -> HTTP 500**, not 400 — no `app.onError` handler anywhere.
7. **Latent stored-XSS trap in the web app:** heavy `innerHTML` templating with zero escaping (`apps/web/src/main.ts:642-838`), and toasts render raw API error messages. Not exploitable today (all strings come from static server catalogs, no user free-text persisted), but any future user-input feature is instantly exploitable.
8. **Schema drift:** `apps/api/src/schema.ts` (Drizzle) covers only 3 of ~28 tables with an incomplete `players`; the real schema is untyped raw SQL in one giant `exec`. Migrations = try/catch-swallowed `ALTER TABLE`s with no version tracking — the `catch {}` masks *any* failure, not just duplicate-column (`apps/api/src/db.ts:458-461`). Both query systems are used interchangeably.
9. **Economy has no value-level safety net:** `scripts/balance_regression.ts` only asserts monotonicity/caps (halving all revenue everywhere would still pass), and `scripts/simulate_performance.ts` calibrates production targets on **physically impossible overlapping boards** (buildings placed with 1-tile spacing regardless of 2x2-4x4 footprints).
10. **Dead/mismatched code:** `fragmentForHunt()` references hunt ids that don't exist in `MARKET_HUNTS` (unreachable branches); ~15 exported functions with no consumers; `stageMul` defined twice; FNV-1a hash reimplemented 5x; `weeklyScore` accumulated but never read.

## Low / hygiene

- Root `db:push` script dangles (no such script in `apps/api/package.json`).
- `engines: node >=20` is insufficient for vite 7 (needs `^20.19 || >=22.12`).
- `README.md` "Run" path points at a different machine (`/Users/crayandre/...`).
- Repo-root `largemap.png`/`map.png` are byte-identical duplicates of `apps/web/public/` copies (~4 MB dead git weight); 16 binary xlsx in `docs/` (~2 MB).
- `.gitignore` missing `*.log`, `.vite/`, `coverage/`, `*.tsbuildinfo`, `.env.*` variants.
- ~45 non-null assertions; a few unguarded `JSON.parse`s; error-message leakage in module catch blocks.
- No CI, no unit-test framework (only 3 tsx scripts; the onboarding one is the strongest).

## What's genuinely good

- **Money is integer `minor` units throughout** — no float money bugs.
- All raw SQL is parameterized — zero SQL injection surface.
- `packages/game` (placement, settlement, market) is cohesive, deterministic, well-documented.
- DB: WAL mode, ledger/audit tables, idempotency-key unique indexes, transactions for multi-statement mutations.
- Dependencies: exact-pinned via lockfile, minimal and reputable, build scripts restricted via `onlyBuiltDependencies`.
- No secrets committed, ever (verified via git history); DB correctly gitignored.

---

## Suggested hardening priority

1. Guard `finalize` + idempotency on settle/place/upgrade/choose
2. Add `tsc --noEmit` typecheck to CI/API build
3. `app.onError` -> 400 for Zod
4. Escaping helper in the web client
5. Schema consolidation
6. Delete dead code + duplicate PNGs
