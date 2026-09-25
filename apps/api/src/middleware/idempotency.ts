import { z } from "zod";
import { newId } from "../shared/types";

/**
 * Zod fragment shared by mutation bodies that accept a client idempotency key
 * (8–128 chars, optional). Kept in one place so every route validates the key
 * identically.
 */
export const idempotencyKeySchema = z.string().min(8).max(128).optional();

/**
 * Resolve the effective idempotency key for a mutation: the client-supplied key
 * when present, otherwise a fresh random id (such a call is then naturally
 * non-replayable, matching pre-idempotency behavior).
 *
 * The idempotency pattern actually used across this API is deliberately plain —
 * no framework magic:
 *
 *  1. The request body carries a zod-validated `idempotencyKey`
 *     (idempotencyKeySchema), resolved here with a random fallback.
 *  2. The target table has a UNIQUE column for the key — either a dedicated
 *     key column (module_loadout_audit.idempotencyKey, plotgo_visits.idempotencyKey,
 *     plotgo_investments.idempotencyKey, module_craft_jobs.idempotencyKey) or a
 *     natural unique key derived from it (e.g. (playerId, source, sourceEventId)
 *     for module reward/parts grants).
 *  3. Before writing, the handler looks up an existing row by key and returns it
 *     (replay / safe retry). Otherwise the unique index closes the insert race
 *     and a P2002 surfaces as a 409 through the global error handler.
 */
export function idempotencyKey(body: { idempotencyKey?: string }): string {
  return body.idempotencyKey ?? newId();
}
