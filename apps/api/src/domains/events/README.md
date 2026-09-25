# events

District event layer: the persisted market-cycle state machine and global-event pick
(`market-cycle.service.ts`), personal/global event issuance, timeout fallback, and event
missions (`events.service.ts`), plus the event choice/mission-claim routes
(`events.routes.ts`). The hunt-specific market machinery lives in the `hunts` domain.
