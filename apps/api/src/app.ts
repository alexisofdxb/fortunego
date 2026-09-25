import { Hono } from "hono";
import { cors } from "hono/cors";
import { registerErrorHandler, securityHeaders } from "./middleware/error-handler";
import { rateLimit } from "./middleware/rate-limit";
import { identityRoutes } from "./domains/player/player.routes";
import { onboardingRoutes } from "./domains/player/onboarding.routes";
import { plotRoutes } from "./domains/plot/plot.routes";
import { economyRoutes } from "./domains/economy/economy.routes";
import { visitRoutes } from "./domains/economy/visits.routes";
import { moduleRoutes } from "./domains/modules/modules.routes";
import { portfolioRoutes } from "./domains/portfolio/portfolio.routes";
import { huntRoutes } from "./domains/hunts/hunts.routes";
import { eventRoutes } from "./domains/events/events.routes";
import { performanceRoutes } from "./domains/performance/performance.routes";
import { leaderboardRoutes } from "./domains/performance/leaderboard.routes";
import { settlementRoutes } from "./domains/settlement/settlement.routes";
import { ensureModuleConfig } from "./domains/modules/modules.service";

export const app: Hono = new Hono();
app.use(
  "*",
  cors({
    origin: ["http://localhost:5173", "http://127.0.0.1:5173"],
    allowHeaders: ["Content-Type", "x-player-id"],
  }),
);
app.use("*", securityHeaders);
// Rate limit after the security headers, before routes (spec sheet 24). Keyed by
// x-player-id (the prototype identity header) or client IP.
app.use("*", rateLimit);

app.route("/", identityRoutes);
app.route("/", plotRoutes);
app.route("/", economyRoutes);
app.route("/", huntRoutes);
app.route("/", eventRoutes);
app.route("/", portfolioRoutes);
app.route("/", moduleRoutes);
app.route("/", performanceRoutes);
app.route("/", settlementRoutes);
app.route("/", leaderboardRoutes);
app.route("/", onboardingRoutes);
app.route("/", visitRoutes);

registerErrorHandler(app);

await ensureModuleConfig();
