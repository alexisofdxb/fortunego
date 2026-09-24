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
- Persistence by player id

Charge is for the **Plot**, $15–$25, later. Dev grants a Founder Plot on first session.

## Run

```bash
cd /Users/crayandre/Desktop/Development/PlotGo
pnpm install
pnpm dev
```

Web: http://localhost:5173  
API: http://localhost:8787

## Stack

Vite + TypeScript board, Hono API, SQLite ledger. PixiJS comes in when hunts need motion. Family `payments.charge` is the checkout adapter, not the save.
