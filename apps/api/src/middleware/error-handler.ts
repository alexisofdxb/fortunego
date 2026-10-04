import type { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { createMiddleware } from "hono/factory";
import { ZodError } from "zod";
import { LiveopsError } from "../domains/liveops/liveops.service";

export const securityHeaders = createMiddleware(async (c, next) => {
  await next();
  c.header("X-Content-Type-Options", "nosniff");
  c.header("X-Frame-Options", "DENY");
  c.header("Referrer-Policy", "no-referrer");
});

export function registerErrorHandler(app: Hono) {
  app.onError((error, c) => {
    if (error instanceof ZodError) {
      return c.json({ error: error.issues[0]?.message ?? "invalid request" }, 400);
    }
    if (error instanceof HTTPException) {
      return c.json({ error: error.message }, error.status);
    }
    if (error instanceof LiveopsError) {
      return c.json({ error: error.message }, error.status);
    }
    // Prisma known-request errors (unique violations, not-found, etc.)
    const code = (error as { code?: string }).code;
    if (code === "P2002") return c.json({ error: "Conflict" }, 409);
    if (code === "P2025") return c.json({ error: "Not Found" }, 404);
    console.error(error);
    return c.json({ error: "Internal Server Error" }, 500);
  });
}
