import "./shared/config";
import fs from "node:fs";
import path from "node:path";
import { serve } from "@hono/node-server";
import { serveStatic } from "@hono/node-server/serve-static";
import { env } from "./shared/config";
import { app } from "./app";
import { startScheduler, stopScheduler } from "./infrastructure/tasks/scheduler";

// ---------------------------------------------------------------------------
// Static frontend (production-style localhost deploy): when the web build
// exists next to the API (apps/web/dist), the API serves it as a single
// origin — no CORS, no separate web process. This is the same shape as the
// future VPS deploy (one service serving static + API). Dev mode (pnpm dev)
// runs Vite separately on :5173 and is unaffected.
// ---------------------------------------------------------------------------
const webDist = path.resolve(process.cwd(), "../web/dist");
if (fs.existsSync(path.join(webDist, "index.html"))) {
  app.use("*", serveStatic({ root: webDist }));
  // SPA fallback: non-API GETs that missed a file get index.html.
  app.get("*", (c) => {
    if (c.req.path.startsWith("/api/") || c.req.path === "/health") return c.notFound();
    return c.html(fs.readFileSync(path.join(webDist, "index.html"), "utf8"));
  });
  console.log(`Serving web build from ${webDist}`);
}

startScheduler();

const shutdown = () => {
  stopScheduler();
  process.exit(0);
};
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);

serve({ fetch: app.fetch, port: env.port }, () => {
  console.log(`PlotGo API http://localhost:${env.port}`);
});
