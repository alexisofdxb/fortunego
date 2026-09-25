# plot

The founder's 12×12 board: building place/move/rotate/upgrade/repair routes
(`plot.routes.ts`), board/card loading and placement math (`board.service.ts`), and the
shared placement/event audit writer (`audit.service.ts`). Building placement lives here
for now; a dedicated `buildings/` domain can be split out later when upgrade levers
arrive. `audit.service.ts` is written to from other domains (events, settlement) —
treat it as the plot-owned audit sink.
