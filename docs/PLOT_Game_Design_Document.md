# PLOT — Game Design Document

**Version:** 0.1  
**Format:** 2D financial empire-building game  
**Host:** Family app mini app via iframe  
**Primary platform:** Mobile-first web experience  
**Core fantasy:** Start with a tiny financial kiosk and grow it into a powerful financial empire.

---

## 1. Executive Summary

**PLOT** is a 2D financial empire-building game where players own a **12×12 Plot**, place illustrated financial business cards on the board, attract customers, generate economic activity, earn in-game Cash, collect tokenized stock rewards, and compete for a fixed weekly **$PLOT payout pool** based on a **Performance Score**.

The game begins with humble financial businesses such as a cash kiosk, currency booth, mini brokerage desk, micro-loan stand, market information stall, and small savings booth. Over time, players upgrade and evolve these businesses into offices, branches, institutions, headquarters, and finally global financial powerhouses.

PLOT should feel playful and collectible, but not childish. It is a game first, not a DeFi dashboard. Finance gives the game its theme, strategy, progression, and reward structure.

The central loop is:

> **Own land → place businesses → attract customers → generate activity → earn Cash → reinvest → unlock better businesses → complete Market Hunts → collect tokenized stocks → improve Performance Score → earn a share of the weekly $PLOT pool → grow into a tycoon.**

---

# 2. Product Pillars

PLOT should be designed around six pillars.

### 2.1 Humble Beginnings

Every empire starts small.

The player should visually begin with tiny kiosks, booths, stands, lockers, desks, and micro-businesses. Early progression must feel modest so that later progression feels meaningful.

### 2.2 Visible Growth

Growth must be visible on the board.

The player should be able to look at an old screenshot of their Plot and immediately see how far they have come.

A tiny booth eventually becomes an office, branch, financial institution, headquarters, and major financial landmark.

### 2.3 Activity Creates Value

Buildings should not simply print money because time passes.

Customers, transactions, volume, capacity, reputation, events, and business quality should create economic activity. The more productive the financial ecosystem becomes, the more Cash and Performance Score the player generates.

### 2.4 Three Distinct Reward Layers

The game has three major value layers:

- **Cash** — main in-game progression currency.
- **Tokenized stock rewards** — collectible financial assets earned through Market Hunts and game activity.
- **$PLOT** — weekly ecosystem reward distributed from a fixed payout pool according to Performance Score.

These three must always feel different.

### 2.5 Strategy Through Limited Land

A Plot is only **12×12 tiles**.

Players cannot build everything immediately. Placement, building footprints, capacity, synergies, specialization, and upgrades create strategic tradeoffs.

### 2.6 Lightweight 2D Experience

PLOT is a 2D iframe-based mini app.

The game should not depend on complex 3D rendering, large maps, expensive physics, or desktop-class hardware. The visual identity should be strong because of illustration, layout, progression, cards, and animation rather than 3D complexity.

---

# 3. Player Fantasy

The player fantasy is:

> “I started with a tiny cash kiosk and a few customers. Now I own banks, brokerages, funds, exchanges, and global financial institutions. My district serves thousands of customers, my portfolio contains tokenized stocks, and my empire competes for weekly $PLOT rewards.”

The player should feel like:

- a founder,
- an operator,
- an investor,
- a collector,
- a strategist,
- and eventually a financial tycoon.

The player should **not** feel like they are simply clicking a yield dashboard.

---

# 4. Core Gameplay Loop

## 4.1 Minute-to-Minute Loop

1. Open PLOT.
2. Collect or inspect current business revenue.
3. Review customer/activity changes.
4. Place or move a card.
5. Upgrade a business.
6. Complete a task or Market Hunt.
7. Claim a Cash or stock reward.
8. Review Empire Value and Performance Score.

## 4.2 Daily Loop

1. Check daily Market Hunts.
2. Review customer growth.
3. Manage capacity bottlenecks.
4. Upgrade or expand businesses.
5. Complete financial events.
6. Collect stock fragments.
7. Improve district efficiency.
8. Check leaderboard movement.

## 4.3 Weekly Loop

1. Build Performance Score.
2. Compete in weekly events.
3. Improve activity, revenue, customer base, and efficiency.
4. Reach weekly payout cutoff.
5. Receive proportional share of the fixed $PLOT pool.
6. Review performance breakdown.
7. Reinvest and prepare for the next epoch.

## 4.4 Long-Term Loop

1. Expand the 12×12 Plot.
2. Unlock higher-tier buildings.
3. Complete stock collections.
4. Merge compatible Plots.
5. Enter higher leagues.
6. Build rare financial institutions.
7. Reach Tycoon status.
8. Compete for seasonal prestige, rare cards, and top rankings.

---

# 5. Board Design

## 5.1 Base Plot

Every standard Plot contains:

- **12 columns**
- **12 rows**
- **144 tiles total**

The board is completely 2D.

It should look like a premium illustrated financial strategy board rather than a city map.

There are:

- no roads,
- no fake 3D streets,
- no 3D buildings,
- no need for realistic urban planning.

The board is a visual canvas for placing financial asset cards.

## 5.2 Visual Style

The board should use:

- flat 2D illustration,
- bold outlines,
- clean tile boundaries,
- a premium limited palette,
- subtle financial motifs,
- decorative borders,
- low visual clutter in playable areas,
- more detail around edges and special tiles.

Suggested visual language:

- cream/light stone base,
- deep navy or charcoal framing,
- muted green for growth,
- gold for wealth/premium states,
- blue for finance/liquidity,
- burnt orange/red for volatility/events,
- purple for rarity/special rewards.

The board should still look attractive when mostly empty.

## 5.3 Tile Types

Most tiles are normal placement tiles.

Special tile types may be introduced gradually:

- **Standard Tile** — normal building placement.
- **Growth Tile** — small bonus to customer growth.
- **Market Tile** — slight boost to trading businesses.
- **Treasury Tile** — slight bonus to capital efficiency.
- **Research Tile** — improves research-related activity.
- **Event Tile** — occasionally hosts temporary events.
- **Premium Tile** — rare enhanced tile.
- **Locked Tile** — unlockable through progression.

Special tiles must remain subtle. The game should not become dependent on tile RNG.

## 5.4 Placement Rules

Each building card has a footprint.

Examples:

- 1×1 — kiosk, locker, small stand.
- 1×2 — mini brokerage, info booth.
- 2×2 — finance shop, small office.
- 2×3 — regional office, fund.
- 3×3 — exchange center, institution.
- 4×4 — major headquarters or landmark.

Placement rules:

- Cards snap to the grid.
- Cards cannot overlap.
- The player can reposition cards outside cooldown-restricted scenarios.
- Rotation may be supported where useful.
- Grid highlights show valid placement.
- Build Mode clearly separates placement from normal gameplay.

## 5.5 Merging Plots

Players can eventually merge multiple Plots.

A merged system should:

- preserve ownership of the underlying land units,
- visually create a larger continuous board,
- keep each original Plot identifiable internally,
- allow larger institutions and more strategic layouts,
- unlock advanced district-level bonuses.

Merged Plot design should feel like a larger financial empire canvas rather than a larger empty checkerboard.

---

# 6. Building System

## 6.1 Building Philosophy

Buildings are illustrated 2D cards placed on the board.

They represent financial businesses and infrastructure.

A building should answer:

1. What service does it provide?
2. What customers does it attract?
3. What economic activity does it create?
4. How does it generate Cash?
5. What limits its growth?
6. What buildings does it synergize with?
7. What risks does it carry?
8. What Market Hunts can it unlock?

## 6.2 Building Progression

Buildings evolve visually and mechanically.

Progression should generally feel like:

> **Kiosk → Booth → Shop → Office → Branch → Firm → Institution → HQ → Global Institution → Empire Landmark**

Not every building needs all ten stages, but the progression philosophy should be consistent.

## 6.3 Example 50-Building Progression

### Humble Tier

1. Cash Kiosk  
2. Trading Booth  
3. Savings Stand  
4. Mini Brokerage Desk  
5. Market Info Kiosk  
6. Micro Loan Booth  
7. Currency Exchange Stand  
8. Insurance Desk  
9. Investment Advice Booth  
10. Secure Cash Locker  

### Starter Tier

11. Neighborhood Finance Shop  
12. Small Brokerage Office  
13. Local Savings Office  
14. Microfinance Office  
15. Trading Room  
16. Small Research Office  
17. Local Insurance Office  
18. Treasury Office  
19. Small Fund Office  
20. Financial Services Hub  

### Growing Tier

21. Community Bank Branch  
22. Brokerage House  
23. Investment Advisory Firm  
24. Asset Management Office  
25. Market Research Center  
26. Lending Center  
27. Wealth Management Office  
28. Digital Finance Hub  
29. Trading House  
30. Private Vault Facility  

### Established Tier

31. Regional Bank  
32. Stock Brokerage Center  
33. Investment Fund HQ  
34. Insurance Company HQ  
35. Financial Data Center  
36. Market Maker Office  
37. Private Banking Center  
38. Corporate Treasury Center  
39. Securities Exchange  
40. Investment Bank  

### Elite and Tycoon Tier

41. Global Brokerage Tower  
42. Major Asset Manager  
43. Institutional Trading Center  
44. Global Wealth Center  
45. Financial Exchange Tower  
46. International Bank HQ  
47. Global Investment Bank  
48. Sovereign Fund Tower  
49. World Financial Exchange  
50. Financial Empire Headquarters  

---

# 7. Building Stats

Each building can contain the following data:

- **Building ID**
- **Category**
- **Tier**
- **Footprint**
- **Construction cost**
- **Upgrade cost**
- **Operating cost**
- **Customer capacity**
- **Transaction capacity**
- **Base reputation**
- **Revenue model**
- **Risk rating**
- **Customer types**
- **Required unlock**
- **Synergy tags**
- **Market Hunt tags**
- **Stock reward affinity**
- **Visual stage**
- **Maintenance requirement**
- **Staff requirement**
- **Empire Value contribution**

Not every stat must be shown to the user.

---

# 8. Customers

## 8.1 Customer Philosophy

Customers are the core economic engine.

Players do not buy customers.

They **attract customers** through:

- reputation,
- quality,
- capacity,
- pricing,
- location/synergy,
- promotions,
- market conditions,
- business type,
- progression,
- and district attractiveness.

Customers are primarily simulated NPCs.

Real-player activity may later act as a premium activity source.

## 8.2 Customer Segments

Possible NPC segments:

### General Consumers
Use savings, currency exchange, insurance, basic lending, and banking.

### Retail Investors
Use brokerages, funds, research, and exchanges.

### Active Traders
Generate high transaction volume.

### Small Businesses
Use lending, banking, treasury, and insurance.

### Corporate Clients
Use investment banking, treasury, capital markets, and large lending.

### High-Net-Worth Customers
Use private banking, wealth management, funds, and alternative investments.

### Institutional Customers
Use exchanges, market makers, asset managers, and investment banks.

## 8.3 Customer Acquisition

A simplified conceptual formula:

`New Customers = Market Demand × Reputation × Service Quality × Capacity Availability × Promotion Modifier × Event Modifier`

The user does not need to see the raw formula.

They should see meaningful outputs such as:

- Customers: 1,840
- New this week: +212
- Capacity: 78%
- Satisfaction: 84%
- Reputation: 72
- Growth: +8.4%

## 8.4 Customer Retention

Customers can leave if:

- service quality is poor,
- capacity is overloaded,
- pricing is too aggressive,
- risk events are mishandled,
- reputation falls,
- competitors or events affect demand.

Retention creates management pressure without making the game punishing.

## 8.5 Customer Flow Between Businesses

Customers can mature into other services.

Examples:

- Savings customer → brokerage investor.
- Brokerage investor → fund investor.
- Business banking customer → investment banking client.
- Wealth customer → private fund participant.

This allows the player's financial ecosystem to compound.

---

# 9. Capacity

Every business has finite capacity.

Examples:

- Cash Kiosk: 150 customers.
- Finance Shop: 700 customers.
- Community Bank: 3,000 customers.
- Regional Bank: 15,000 customers.
- International Bank HQ: 100,000+ customers.

Capacity creates reasons to:

- upgrade,
- expand,
- build complementary locations,
- improve technology,
- hire staff,
- or specialize.

When capacity exceeds a threshold:

- wait times rise,
- customer satisfaction falls,
- growth slows,
- operational risk may increase.

---

# 10. Staff and Operations

Staff should exist but remain lightweight.

Players should not manually hire hundreds of individual employees.

Use departments or staffing scores.

Example for an Exchange:

- Operations: 6/10
- Technology: 8/10
- Compliance: 5/10
- Research: 7/10

Improving departments costs Cash.

Effects may include:

- more capacity,
- lower operating risk,
- better customer satisfaction,
- improved Market Hunt rewards,
- better reputation,
- lower downtime.

---

# 11. Cash Economy

## 11.1 Purpose

Cash is the primary in-game currency.

Cash represents business-generated game money.

It is used for:

- construction,
- upgrades,
- capacity expansion,
- staffing,
- promotions,
- research,
- licenses,
- maintenance,
- event participation,
- unlocks,
- special card crafting,
- plot expansion.

## 11.2 Cash Generation

Buildings should generate Cash from economic activity rather than only time.

Examples:

### Bank
`Customers × deposit activity × lending activity × margin × efficiency`

### Exchange
`Trading volume × exchange fee × efficiency`

### Brokerage
`Active traders × trade frequency × commission`

### Fund
`AUM × management income + performance income`

### Insurance
`Policies × premium − claims`

### Market Maker
`Volume × spread − losses`

The formulas can be simplified in early versions.

## 11.3 Cash Sinks

The economy needs strong Cash sinks.

Primary sinks:

- building construction,
- upgrades,
- staffing,
- marketing,
- capacity expansion,
- repairs,
- licenses,
- research,
- event entry,
- premium strategic actions.

Cash supply must not endlessly inflate without meaningful spending.

---

# 12. Activity System

## 12.1 Why Activity Matters

PLOT should reward productive empires, not idle land ownership.

Activity includes:

- active customers,
- transactions,
- trading volume,
- loans,
- deposits,
- AUM,
- customer growth,
- event participation,
- stock missions,
- operational efficiency.

## 12.2 Examples of Activity Metrics

A Brokerage may show:

- 8,000 customers
- 2,400 active traders
- 31,000 weekly trades
- $18M simulated trading volume
- $140K weekly revenue

An Exchange may show:

- $84M trading volume
- 140,000 transactions
- $230K fees
- 11,800 active traders

A Bank may show:

- $26M deposits
- $14M loans
- 7,800 customers
- $160K net income

Activity feeds directly into Performance Score.

---

# 13. Reputation

Reputation represents trust and prestige.

It affects:

- customer acquisition,
- customer quality,
- high-value opportunities,
- Market Hunt quality,
- institution unlocks,
- event eligibility.

Reputation increases through:

- stable operations,
- customer satisfaction,
- successful events,
- responsible risk management,
- sustained activity,
- business milestones.

Reputation decreases through:

- repeated capacity failures,
- poor risk outcomes,
- severe service issues,
- failed special events.

---

# 14. Risk

Risk gives the game strategic tension.

Possible risk categories:

- Credit Risk
- Market Risk
- Liquidity Risk
- Operational Risk
- Concentration Risk
- Reputation Risk

Risk should create setbacks, not destroy months of progress.

Examples:

- Bank suffers temporary loan defaults.
- Fund experiences a drawdown.
- Exchange has reduced activity during a liquidity shock.
- Insurance company experiences increased claims.

Players mitigate risk using:

- diversification,
- insurance,
- research,
- treasury,
- capital reserves,
- staffing,
- specific buildings.

---

# 15. Building Synergies

Synergies should make financial sense.

Examples:

### Exchange + Market Maker
Improves liquidity and trading volume.

### Brokerage + Exchange
Increases transaction activity.

### Fund + Research Center
Improves investment performance and Market Hunt quality.

### Bank + Insurance
Improves risk profile and customer retention.

### Vault + Treasury
Improves capital efficiency.

### Data Center + Exchange
Improves transaction capacity.

### Wealth Management + Private Bank
Improves high-net-worth customer acquisition.

### Investment Bank + Corporate Treasury
Improves corporate client opportunities.

Synergies should encourage strategy without forcing one optimal layout.

---

# 16. Upgrades

## 16.1 Upgrade Philosophy

Upgrades should change:

- appearance,
- capacity,
- customer quality,
- operational efficiency,
- services,
- event access,
- stock reward access.

Avoid simple “+20% revenue” progression only.

## 16.2 Milestone Upgrades

At key milestones, a building can unlock specialization.

Example: Bank specialization

- Retail Bank
- Digital Bank
- Private Bank
- Investment Bank

Example: Brokerage specialization

- Retail Brokerage
- Active Trading Brokerage
- Institutional Brokerage
- Tokenized Asset Brokerage

Specialization creates differentiated empires.

## 16.3 Cost Curve

Upgrade costs should generally rise faster than raw revenue.

This prevents endless linear upgrading.

Illustrative model:

- Upgrade cost growth: ~1.5–1.7×
- Base revenue growth: ~1.25–1.4×

Milestone unlocks compensate through capability and synergy.

Exact values require playtesting.

---

# 17. Tokenized Stock System

## 17.1 Purpose

Tokenized stocks are a collectible financial reward layer.

They should be highly visible and feel valuable.

Examples:

- AAPL
- NVDA
- TSLA
- MSFT
- AMZN
- GOOGL
- META
- COIN
- NFLX
- SPY

The supported list can expand over time.

## 17.2 Stock Fragments

Players collect fractional stock rewards.

Example portfolio:

- AAPL: 0.032
- NVDA: 0.018
- TSLA: 0.044
- AMZN: 0.021

The actual implementation can evolve from in-game representation to real tokenized integrations depending on legal, technical, and liquidity requirements.

## 17.3 Stock Rarity

Stock drops can use game rarity independent of company quality.

Example:

- Common
- Uncommon
- Rare
- Epic
- Legendary

Rarity controls frequency and reward size.

---

# 18. Market Hunts

Market Hunts are the main stock-discovery mechanic.

They replace real-world walking/location mechanics.

Players can participate anywhere.

## 18.1 Example Market Hunts

### Tech Rally

**Requirement:** Generate $500K Exchange volume.  
**Reward:** Mystery technology stock fragment.

### Earnings Day

**Requirement:** Complete 3 Brokerage actions.  
**Reward:** AAPL fragment.

### Investor Rush

**Requirement:** Acquire 200 new Brokerage customers.  
**Reward:** Mystery stock fragment + Cash.

### Research Breakthrough

**Requirement:** Reach target Research efficiency.  
**Reward:** Increased chance of a rare stock fragment.

### Liquidity Week

**Requirement:** Reach a specified Exchange + Market Maker activity score.  
**Reward:** Stock fragment + Performance Score bonus.

## 18.2 Market Hunt Sources

Different buildings unlock different missions.

- Brokerage → stock and retail-investor missions.
- Research Center → discovery and analysis missions.
- Exchange → trading-volume missions.
- Fund → portfolio missions.
- Investment Bank → corporate/IPO-style missions.
- Market Maker → liquidity missions.

---

# 19. Stock Collections

Stock collection provides a parallel long-term progression path.

Examples:

### Technology Set
AAPL, NVDA, MSFT, GOOGL, META

Reward:
- unique card,
- special building,
- cosmetic,
- Market Hunt bonus.

### Consumer Set
AMZN and other supported names.

### Market Infrastructure Set
COIN and related assets.

Collections should reward engagement without becoming mandatory for basic progression.

---

# 20. Events

Events keep the economy dynamic.

## 20.1 Market Events

Examples:

- Bull Market
- Market Correction
- Earnings Season
- IPO Week
- Rate Cut
- Rate Hike
- Liquidity Crunch
- Credit Boom
- Bank Run
- Technology Rally
- Dividend Week
- M&A Boom
- Regulatory Approval
- Volatility Spike

## 20.2 Example Effects

### Rate Cut

- loan demand +20%
- bank margin -8%
- fund inflows +15%
- growth-stock activity +10%

### Market Correction

- brokerage activity +15%
- fund returns temporarily lower
- cash demand rises
- risk-management buildings become more valuable

### IPO Week

- investment banks gain corporate opportunities
- brokerages gain retail activity
- Market Hunts may offer special rewards

Events should encourage adaptation.

---

# 21. Missions

Mission types:

- Daily
- Weekly
- Building-specific
- Event-specific
- Stock-specific
- Customer-growth
- Activity-volume
- Upgrade
- Collection

Mission rewards:

- Cash
- Stock fragments
- Reputation
- temporary boosts
- card packs
- cosmetic items
- Performance Score bonuses

---

# 22. Empire Value

Empire Value is a visible measure of overall progression.

Possible inputs:

- building value,
- business levels,
- Cash,
- stock collection value,
- reputation,
- unlocked institutions,
- plot upgrades.

Empire Value is not necessarily the same as Performance Score.

Empire Value answers:

> “How large is this empire?”

Performance Score answers:

> “How well did this empire perform this week?”

---

# 23. Weekly Performance Score

Performance Score is the basis of $PLOT payout.

## 23.1 Design Goal

Reward:

- real activity,
- productive businesses,
- customers,
- efficient capital use,
- growth,
- events,
- active management.

Do not reward:

- passive land ownership alone,
- Cash hoarding,
- one dominant building strategy,
- bot farming,
- infinite compounding without diminishing returns.

## 23.2 Example Score Components

Illustrative weighting:

| Component | Weight |
|---|---:|
| Economic Activity | 30% |
| Business Revenue | 20% |
| Active Customers | 15% |
| Customer Growth | 10% |
| Capital Efficiency | 10% |
| Market Hunts | 5% |
| Reputation | 5% |
| Risk Management | 5% |

These are starting assumptions, not final values.

## 23.3 Cash Spending Does Not Reduce Score

Performance Score records activity when it happens.

If the player generates $5M Cash and spends $4M upgrading buildings, the economic activity already generated remains part of their weekly score.

This prevents Cash hoarding.

---

# 24. Weekly $PLOT Payout

## 24.1 Fixed Pool

PLOT has a predetermined weekly payout pool.

Example:

**Weekly Pool: 2,000,000 $PLOT**

The total Cash generated in the game does not directly change this pool.

## 24.2 Distribution Formula

Basic formula:

`Player Payout = Weekly Payout Pool × (Player Adjusted Performance Score / Total Eligible Adjusted Performance Score)`

Example:

- Weekly pool: 2,000,000 $PLOT
- Total eligible score: 500,000,000
- Player score: 500,000
- Player share: 0.10%
- Player payout: 2,000 $PLOT

## 24.3 Eligibility

Possible requirements:

- minimum weekly activity,
- minimum account age,
- minimum Plot activation period,
- no cheating flags,
- required engagement threshold,
- valid wallet,
- completed minimum number of actions.

## 24.4 Diminishing Returns

Raw scale should not produce perfectly linear payout dominance.

Possible techniques:

- logarithmic score adjustment,
- score soft caps,
- category caps,
- diminishing marginal contribution,
- league-based pool allocation.

This keeps large players strong without making new competition impossible.

---

# 25. Leagues

Possible league structure:

1. Starter
2. Bronze
3. Silver
4. Gold
5. Platinum
6. Diamond
7. Tycoon

Leagues can use:

- Empire Value,
- historical Performance Score,
- reputation,
- building tier,
- Plot size.

Possible payout model:

The weekly pool is divided across leagues, and each player competes mainly within their league.

This should be tested carefully.

---

# 26. Seasons

Weekly payout is the short cycle.

Seasons create medium-term goals.

Suggested season length:

**4–8 weeks**

Season rewards may include:

- exclusive building art,
- rare cards,
- profile frames,
- titles,
- special Market Hunts,
- limited cosmetics,
- unique board skins,
- prestige badges.

Core owned progress should not reset.

---

# 27. Real Player Activity

NPCs form the baseline economy.

Real-player activity can later become more valuable.

Examples:

- another player visits your Exchange,
- another player interacts with your Brokerage,
- player-to-player financial events,
- cooperative Market Hunts,
- group tournaments,
- community trading challenges.

Real-player activity may receive a higher Performance Score multiplier because it represents actual network use.

This must be protected against sybil abuse.

---

# 28. Social Systems

Potential social systems:

- visit other Plots,
- compare Empire Value,
- inspect public portfolios,
- leaderboard,
- friend challenges,
- weekly leagues,
- cooperative events,
- district showcases,
- shareable Plot image,
- seasonal competitions.

Social should support the core game, not overwhelm it.

---

# 29. Monetization

Monetization should prioritize ownership and optional acceleration without direct guaranteed victory.

Possible monetization:

- Plot purchases
- Founder Plot
- board skins
- cosmetic card art
- special visual themes
- card packs
- optional premium event access
- marketplace fees
- cosmetic Module skins/frames
- extra Plot ownership
- expansion unlocks

Avoid making the best Performance Score purchasable directly.

---

# 30. Founder / MVP Offer

A minimum paid version can be:

### Founder Plot

Includes:

- one 12×12 Plot,
- starter building pack,
- starter Cash,
- Founder badge,
- daily Market Hunts,
- stock-fragment collection,
- Empire Value,
- leaderboard,
- early access to future payout systems.

Possible pricing can be tested rather than fixed permanently.

The first paid experience should communicate:

> “This Plot is mine. I started small. My customers are growing. My businesses are producing Cash. I found a stock fragment. My empire is becoming more valuable.”

---

# 31. MVP Scope

The MVP should not attempt the entire vision.

## 31.1 MVP Board

- 12×12 board
- drag/tap placement
- simple movement
- save layout
- basic card footprints

## 31.2 MVP Buildings

Start with approximately 8:

1. Cash Kiosk
2. Trading Booth
3. Savings Stand
4. Mini Brokerage
5. Market Info Kiosk
6. Micro Loan Booth
7. Small Fund Desk
8. Secure Vault

## 31.3 MVP Customer System

- basic customer counts
- simple customer growth formula
- building capacity
- reputation multiplier
- customer saturation

## 31.4 MVP Cash

- simple business formulas
- construction
- upgrades
- 2–3 major Cash sinks

## 31.5 MVP Stock System

- 5–10 supported stock fragments
- 1–3 Market Hunts per day
- basic portfolio page
- collection progress

## 31.6 MVP Performance

- record activity
- calculate test Performance Score
- leaderboard
- no real $PLOT payout initially if balancing data is insufficient

## 31.7 MVP Events

- 3–5 event templates
- temporary modifiers
- event missions

---

# 32. Suggested MVP Formulas

These are illustrative starting points only.

## Customer Growth

`New Customers = Base Demand × Reputation Modifier × Capacity Modifier × Event Modifier`

## Revenue

`Revenue = Active Customers × Activity Rate × Revenue Per Activity × Efficiency`

## Capacity Penalty

- <80% capacity: no penalty
- 80–95%: mild slowdown
- 95–100%: strong slowdown
- >100% attempted demand: rejected/lost customers

## Performance Activity Score

`Activity Score = sqrt(Eligible Activity) × Quality Modifier`

The square root or similar curve is one possible way to introduce diminishing returns.

---

# 33. Balancing Philosophy

Balance around decisions, not grind.

The player should regularly choose between:

- upgrade vs expand,
- Cash retention vs reinvestment,
- safe vs risky businesses,
- customer growth vs margin,
- specialization vs diversification,
- immediate reward vs long-term capacity.

Avoid one obvious dominant strategy.

## 33.1 Important Balance Questions

- How fast should a new Plot become productive?
- How long should it take to leave the kiosk stage?
- When should capacity become meaningful?
- How quickly should customer growth compound?
- How much Cash should leave the system through sinks?
- How much do Market Hunts contribute to Performance Score?
- How much can one whale dominate?
- How much should an inactive player earn?
- How valuable should real-player activity be?
- How many stock fragments should be available weekly?

---

# 34. Economy Safety

Because $PLOT may have real market value, the game economy must be treated carefully.

Core principles:

- Cash is not pegged to $PLOT.
- Weekly $PLOT payout is fixed or controlled.
- Performance Score determines allocation.
- Player count growth does not automatically increase token emissions.
- Bot behavior is penalized.
- Economic activity must be server authoritative.
- Reward rules can be tuned between epochs.

---

# 35. Anti-Cheat and Abuse Prevention

The backend should calculate:

- revenue,
- customer growth,
- activity,
- Market Hunt completion,
- Performance Score,
- payout eligibility.

The client should never be trusted to declare rewards.

Possible protection:

- rate limits,
- action validation,
- impossible-pattern detection,
- multi-account heuristics,
- wallet clustering review,
- anomaly detection,
- cooldowns,
- server timestamps,
- signed reward claims.

---

# 36. Technical Architecture

## Client

2D web client embedded in Family via iframe.

Responsibilities:

- board rendering,
- card placement,
- UI,
- animation,
- mission display,
- portfolio display.

## Game Backend

Responsibilities:

- account state,
- layout state,
- customers,
- revenue,
- activity,
- events,
- Market Hunts,
- Performance Score,
- leaderboards.

## Blockchain Layer

Potentially responsible for:

- Plot ownership,
- Plot NFT transfers,
- $PLOT claims,
- tokenized stock integrations where applicable,
- rare onchain assets,
- marketplace settlement.

Do not put every card movement or routine upgrade onchain.

---

# 37. UI Structure

Suggested primary navigation:

### Home / Plot
Main 12×12 board.

### Build
Card inventory, placement, upgrade.

### Market
Events, Market Hunts, stock opportunities.

### Portfolio
Collected tokenized stocks.

### Empire
Customers, revenue, reputation, activity, capacity.

### Rewards
Performance Score, weekly payout estimate, payout history.

### Leaderboard
League and global rankings.

---

# 38. Main HUD

Always-visible or easily accessible information:

- Cash
- Stock Portfolio Value
- $PLOT balance
- Empire Value
- Current Performance Score
- Weekly payout countdown

Optional secondary indicators:

- Reputation
- Active customers
- Market Hunt alerts

---

# 39. Art Direction

PLOT is intentionally 2D.

Visual principles:

- flat illustration,
- bold outlines,
- clean silhouettes,
- premium board-game feel,
- no fake 3D buildings,
- no roads,
- no heavy neon crypto look,
- collectible card art,
- board and cards share one visual language.

The early board should look sparse.

The endgame board should look dense and prestigious.

---

# 40. Animation

Use lightweight animation only.

Examples:

- subtle card pulse,
- Cash pop,
- customer icon flow,
- event flash,
- upgrade transformation,
- stock reward reveal,
- Performance Score increase,
- payout celebration.

The iframe should remain fast on mobile.

---

# 41. Audio

Canonical spec: `docs/PLOT_Sound_System_v1.0.md`.

Premium, restrained district audio: looping bed, short stingers (upgrade, close day, hunt claim, level up), board and UI SFX. Web Audio mixer in `apps/web`. Economy stays silent on the server.

---

# 42. Onboarding

First session:

1. Receive empty 12×12 Plot.
2. Place first Cash Kiosk.
3. Attract first customers.
4. Earn first Cash.
5. Upgrade kiosk.
6. Unlock second business.
7. Complete first Market Hunt.
8. Receive first stock fragment.
9. Introduce Empire Value.
10. Introduce weekly Performance Score.

Do not explain every system at once.

---

# 43. First 5 Minutes

The first five minutes must deliver the minimum emotional hook:

- ownership,
- first placement,
- first customer,
- first Cash,
- first upgrade,
- first visual transformation,
- first Market Hunt,
- first stock reward.

The player should understand the core promise before the first session reaches five minutes: “This Plot is mine, my businesses serve customers, and my activity creates valuable progress.”

The remaining 25 minutes should deepen the loop with:

- a second business,
- a meaningful capacity choice,
- another upgrade or layout decision,
- Empire Value comparison,
- a clearer view of the next unlock,
- and a reason to return for the next daily Market Hunt.

---

# 44. First 7 Days

Target progression:

- multiple small businesses,
- meaningful customer base,
- first specialization choice,
- several stock fragments,
- first leaderboard participation,
- first weekly Performance Score,
- first payout or simulated payout preview.

---

# 45. Endgame

Endgame should not mean “game complete.”

Endgame players pursue:

- giant merged Plots,
- Tycoon league,
- rare institutions,
- stock collections,
- top weekly Performance Score,
- seasonal rewards,
- prestige,
- efficient layouts,
- social competition.

---

# 46. Key Metrics

Important metrics to track:

### Engagement
- DAU/WAU
- session frequency
- average session length
- Market Hunt completion
- daily actions

### Progression
- time to first upgrade
- time to first office
- time to first institution
- Cash generation
- Cash spend ratio
- customer growth rate

### Economy
- Cash emitted
- Cash burned
- stock fragments distributed
- Performance Score distribution
- concentration of weekly $PLOT payout

### Retention
- D1
- D7
- D30
- weekly payout return rate

### Monetization
- Plot conversion
- cosmetic conversion
- ARPPU
- repeat purchase behavior

---

# 47. Open Design Questions

These require testing:

1. How many free starter buildings?
2. How quickly should customers grow?
3. How many stock fragments per player per week?
4. How large should the first weekly $PLOT pool be?
5. Should leagues split the payout pool?
6. How aggressive should diminishing returns be?
7. How many Market Hunts should appear daily?
8. Should stock fragments be immediately transferable?
9. How should merged Plot layouts work visually?
10. When should real-player activity enter the score?
11. How much idle progress should exist?
12. What is the optimal number of building tiers?
13. Should all players receive the same events?
14. How often should special market events occur?

---

# 48. Recommended Development Phases

## Phase 1 — Playable Core

- 12×12 board
- 8 starter buildings
- placement
- Cash
- customer counts
- capacity
- upgrades
- simple Empire Value

## Phase 2 — Financial Activity

- transaction activity
- reputation
- customer segments
- synergies
- basic events
- improved revenue models

## Phase 3 — Stock Collection

- Market Hunts
- stock fragments
- portfolio
- stock collections
- stock-related missions

## Phase 4 — Performance Economy

- weekly Performance Score
- leaderboard
- diminishing returns
- payout simulation
- anti-cheat instrumentation

## Phase 5 — $PLOT Payout

- fixed weekly pool
- eligibility
- onchain claim
- payout history
- league testing

## Phase 6 — Expansion

- larger building library
- plot merging
- seasons
- social activity
- real-player interaction
- premium institutions

---

# 49. One-Sentence Product Definition

> **PLOT is a 2D financial empire game where players start with tiny financial kiosks, attract customers, build increasingly powerful institutions, earn Cash and tokenized stocks through real game activity, and compete for a fixed weekly $PLOT payout based on Performance Score.**

---

# 50. Design North Star

Every major feature should reinforce at least one of these feelings:

> **I started small.**  
> **I built this.**  
> **My customers use it.**  
> **My businesses are growing.**  
> **My board looks more powerful.**  
> **I discovered something valuable.**  
> **My financial decisions matter.**  
> **My activity improved my weekly performance.**  
> **My empire earned its share of the $PLOT pool.**

If a feature does not strengthen this progression, it probably does not belong in the core game.
