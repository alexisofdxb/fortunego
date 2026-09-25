# settlement

Weekly settlement pipeline: freezing/finalizing a performance week, building the
weekly snapshot manifest with integrity checksums, and the admin finalize plus player
payout-claim endpoints (`settlement.service.ts` / `settlement.routes.ts`). The offline
summary "viewed" endpoint is grouped here with the other settlement mutations from the
old performance routes. Score inputs come from the `performance` domain.
