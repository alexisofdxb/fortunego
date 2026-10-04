# Manual Playtest Checklist

Play the game **in the browser** like a player. Check each box only if what you
*see and feel* matches "Expected". If anything differs, note the hex/building
number and what happened instead — that is a gameplay bug, regardless of what
the API says.

Setup: game at http://localhost:8787 · hard-refresh (Ctrl+F5) before a pass.
One pass = Part A (~15 min, single session) + Part B (needs a new UTC day).

---

## PART A — First session (no waiting)

### A1. Login & first impression
- [ ] Privy login screen appears; logging in creates a fresh plot and drops you on the map
- [ ] You can see: your **starter parcel** (with a building chip once placed), 🔒 locks on locked parcels, 🔓 on frontier parcels, gold **Lv tags** on level-gated frontier
- [ ] Header shows avatar, **Lv pill**, XP, 💵 cash, 🏛️ empire value, bell, logout

### A2. Understand the board without reading docs
- [ ] The **quest icon** (📜, left under avatar) opens the tracker showing: Getting Started, Daily Operations (3 lanes), **Next Unlocks** (buildings + parcels with Lv/price), Promotion gate when pending
- [ ] "Next Unlocks" answers "what do I get next and when" at a glance
- [ ] Locked parcels show 🔒 + Lv tag; open frontier shows 🔓 + price/deed tag

### A3. Place your first building
- [ ] Tap **Cash Kiosk** in the hand → hint appears, valid parcels glow green
- [ ] The green glow **traces the painted plot exactly** (not a giant/shifted hex)
- [ ] Tap your starter parcel → kiosk placed, **building chip** (medal + name) appears on that parcel
- [ ] Cash dropped by the card's price; XP increased (+100)

### A4. Drag & drop
- [ ] **Drag** Trading Booth from the hand onto the board: gold arc follows your cursor, ghost card floats, dropping on a valid parcel places it
- [ ] Dragging onto a locked/unowned parcel shows a clear message, doesn't place
- [ ] Tap-without-drag still selects then places

### A5. Catalog
- [ ] **Catalog** deck button (tail of the hand) opens the full-screen gallery
- [ ] Rows: **Available / Placed / Locked / Modules**, each with count
- [ ] Locked cards show 🔒 Lv N; hovering a card shows its tooltip (net/day, cost, slots)
- [ ] Filter chips (All/Available/Placed/Locked) and sort dropdown work
- [ ] Tapping an **Available** card closes the catalog and starts placement
- [ ] Tapping a **Placed** card starts placement of **another copy** (multiple copies allowed)

### A6. Hex drawer
- [ ] Click any parcel → right drawer shows: grade chip, coordinates, stats grid, **attribute bars**, price, required level, Acquire button
- [ ] Acquire button states make sense: enabled / 🔒 Requires Level N / Not on your frontier / Owned
- [ ] At Lv1–3, acquiring frontier correctly says **Requires Level N** (first deed opens at Lv4)

### A7. Upgrade & economy
- [ ] Click your kiosk's chip → inspect sheet opens with **Upgrade** button and module slots
- [ ] Upgrading to stage 2 debits cash, stage pips on the chip increase
- [ ] **Close Day** (settle) shows a receipt explaining the day's result; cash changes accordingly

### A8. Hunts, objectives, portfolio (dock icons, right side)
- [ ] 🎯 Hunts: 3 offers, start one, claim it — reward (fragments/cash) arrives, XP capped fairly
- [ ] 📋 Objectives panel: 3 lanes with progress; playing completes them; rewards land
- [ ] 💼 Portfolio: collections/stocks visible after hunt claims
- [ ] Each dock panel opens/closes cleanly and doesn't trap the board

---

## PART B — Multi-day (return after UTC midnight, or next calendar day)

### B1. New day
- [ ] Hunt offers refreshed; objective lanes replaced; daily XP caps reset
- [ ] **Operating Streak** increments (⚠️ known gap: verify this — it stayed 0 in testing)
- [ ] Settle again → receipt for the new day; empire earns without placing anything new

### B2. Level 4 — first land expansion
- [ ] Reach Lv4 (play daily objectives/hunts) → the 🔓 **Lv4 deed parcel** becomes acquire-able
- [ ] Acquire it: ownership transfers, price/deed handled, +XP, new parcel glows as yours
- [ ] Place a building on the new parcel; adjacency/ synergy with the neighbor kiosk is visible in inspect (fit %)

### B3. Social (needs a second account — second browser/incognito)
- [ ] Other player's board viewable; **visit** their building (fee shown) — one per day
- [ ] **Invest** in their building: amount, 25% share, maturity day shown in ledger
- [ ] Your side: their visit/investment appears in your investments ledger

### B4. Progression & pressure
- [ ] Level-ups feel paced; promotion gate panel shows exactly what's missing (hexes/businesses/upgrades/stocks)
- [ ] Week countdown visible (weekStatus); performance panel shows ranking
- [ ] ⚠️ Verify notifications: bell should light up on events (known gap: inbox stayed empty in testing)

---

## Known gaps to watch for (from API walkthrough — confirm/refute by playing)
| # | Gap | Where it shows |
|---|-----|----------------|
| 1 | First land expansion needs Lv4 but day-1 caps at ~Lv2 — map game frozen for days | A6 / B2 pacing |
| 2 | Notifications never fire on place/upgrade/settle/promotion | A8/B4 bell |
| 3 | Operating streak may not increment | B1 |
| 4 | Invest-after-visit same day rejected (ordering constraint?) | B3 |
| 5 | Buildings settle at full output — no maturation ramp yet | B2 (spec feature, not built) |
