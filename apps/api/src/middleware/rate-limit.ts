import { createMiddleware } from "hono/factory";

/**
 * Lightweight in-memory sliding-window rate limiter (spec sheet 24: "Rate Limit? Yes").
 *
 * CAVEAT: this is single-process only. Counts live in process memory, are lost on
 * restart, and are not shared across replicas. Swap for a Redis-backed limiter
 * (e.g. token bucket per key) when the API runs more than one instance.
 */

const WINDOW_MS = 60_000;
const DEFAULT_LIMIT_PER_MIN = 120;

// High-value mutations get a strict bucket; layout mutations their own (spec sheet 14).
const STRICT_PATHS = new Set(["/api/session/settle", "/api/hunt/claim", "/api/performance/claim", "/api/event/choose"]);
const LAYOUT_PATHS = new Set(["/api/plot/place", "/api/plot/move", "/api/plot/rotate", "/api/plot/upgrade"]);

type Bucket = { limit: number; hits: number[] };
const buckets = new Map<string, Bucket>();

function bucketSpec(method: string, path: string): { name: string; limit: number } {
  if (method === "POST" && STRICT_PATHS.has(path)) return { name: "strict", limit: 20 };
  if (method === "POST" && LAYOUT_PATHS.has(path)) return { name: "layout", limit: 30 };
  return { name: "default", limit: DEFAULT_LIMIT_PER_MIN };
}

function identityKey(c: { req: { header: (name: string) => string | undefined } }): string {
  // Prototype auth self-declares via x-player-id; fall back to the client IP.
  return c.req.header("x-player-id")?.trim() || c.req.header("x-forwarded-for")?.split(",")[0]?.trim() || "anonymous";
}

export const rateLimit = createMiddleware(async (c, next) => {
  const { name, limit } = bucketSpec(c.req.method, c.req.path);
  const key = `${name}:${identityKey(c)}`;
  const now = Date.now();
  const windowStart = now - WINDOW_MS;
  let bucket = buckets.get(key);
  if (!bucket) {
    bucket = { limit, hits: [] };
    buckets.set(key, bucket);
  }
  bucket.hits = bucket.hits.filter((hit) => hit > windowStart);
  if (bucket.hits.length >= bucket.limit) {
    const oldest = bucket.hits[0] ?? now;
    c.header("Retry-After", String(Math.max(1, Math.ceil((oldest + WINDOW_MS - now) / 1000))));
    return c.json({ error: "rate limit exceeded" }, 429);
  }
  bucket.hits.push(now);
  // Opportunistic sweep so abandoned keys do not accumulate unbounded memory.
  if (buckets.size > 10_000) {
    for (const [candidate, value] of buckets) {
      if (value.hits.length === 0 || (value.hits[value.hits.length - 1] ?? 0) < windowStart) buckets.delete(candidate);
    }
  }
  await next();
});
