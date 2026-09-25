import { createMiddleware } from "hono/factory";
import { PrivyClient } from "@privy-io/node";
import type { AppEnv } from "../shared/types";
import { env } from "../shared/config";
import { prisma } from "../infrastructure/postgres/client";
import { createPlayer } from "../domains/player/onboarding.service";

const privy = env.authMode === "privy" && env.privyAppId && env.privyAppSecret
  ? new PrivyClient({ appId: env.privyAppId, appSecret: env.privyAppSecret })
  : null;

function bearerToken(header: string | undefined): string | null {
  return header?.startsWith("Bearer ") ? header.slice("Bearer ".length) : null;
}

/**
 * Standalone (privy mode): verifies the Privy access token (ES256 JWT; the SDK
 * validates signature, iss/aud/exp) and resolves the player by Privy DID,
 * auto-creating the account on first login. Dev mode keeps the prototype
 * x-player-id header so local runs and the acceptance suites need no Privy app.
 */
export const requirePlayer = createMiddleware<AppEnv>(async (c, next) => {
  if (env.authMode === "privy") {
    const token = bearerToken(c.req.header("Authorization"));
    if (!token) return c.json({ error: "Authorization bearer token required" }, 401);
    if (!privy) return c.json({ error: "auth not configured" }, 503);
    let userId: string;
    try {
      const claims = await privy.utils().auth().verifyAccessToken(token);
      userId = claims.user_id;
    } catch {
      return c.json({ error: "invalid or expired token" }, 401);
    }
    let player = await prisma.player.findUnique({ where: { privyUserId: userId } });
    if (!player) {
      // First login: create the account. The unique key makes concurrent
      // first-requests race-safe (loser re-reads the winner's row).
      try {
        player = await createPlayer({ privyUserId: userId });
      } catch (error) {
        player = await prisma.player.findUnique({ where: { privyUserId: userId } });
        if (!player) throw error;
      }
    }
    c.set("player", player);
    await next();
    return;
  }

  // dev mode
  const id = c.req.header("x-player-id");
  if (!id) return c.json({ error: "x-player-id required" }, 401);
  const player = await prisma.player.findUnique({ where: { id } });
  if (!player) return c.json({ error: "no plot" }, 404);
  c.set("player", player);
  await next();
});

export const requireAdmin = createMiddleware(async (c, next) => {
  const token = bearerToken(c.req.header("Authorization"));
  if (!token || token !== env.adminToken) return c.json({ error: "forbidden" }, 403);
  await next();
});
