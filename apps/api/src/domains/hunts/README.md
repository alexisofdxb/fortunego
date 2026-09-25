# hunts

Market hunts and their backing market mechanics: hunt slot issuance/claim
(`hunts.routes.ts`), oracle prices, the weekly stock reward pool (reserve/release/claim),
and hunt template selection/progress math (`hunts.service.ts`). The market-cycle and
global-event state machine lives in the `events` domain; this domain consumes it.
