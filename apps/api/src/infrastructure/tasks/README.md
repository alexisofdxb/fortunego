# tasks

In-process scheduler (`scheduler.ts`): jittered, idempotent, failure-isolated sweeps
for craft completion, hunt/event expiry, market-cycle checks, and the daily module
inventory reconcile. Local stand-in for the deferred Redis/BullMQ workers.
