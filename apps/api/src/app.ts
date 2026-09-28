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
import { objectiveRoutes } from "./domains/objectives/objectives.routes";
import { landRoutes } from "./domains/land/land.routes";
import { notificationRoutes } from "./domains/notifications/notifications.routes";
import { jobRoutes } from "./infrastructure/tasks/job.routes";
import { ensureModuleConfig } from "./domains/modules/modules.service";
import { requirePlayer } from "./middleware/auth";
import { env } from "./shared/config";

export const app: Hono = new Hono();
const allowedOrigins = ["http://localhost:5173", "http://127.0.0.1:5173"];
if (env.webOrigin) allowedOrigins.push(env.webOrigin);
app.use(
  "*",
  cors({
    origin: allowedOrigins,
    allowHeaders: ["Content-Type", "x-player-id", "Authorization"],
  }),
);
app.use("*", securityHeaders);
// Rate limit after the security headers, before routes (spec sheet 24).
app.use("*", rateLimit);

// /api/session: open in dev mode (self-declared id creates the account); in
// privy mode it sits behind the verified-token middleware and returns the
// authenticated player's snapshot.
if (env.authMode === "privy") app.use("/api/session", requirePlayer);
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
app.route("/", objectiveRoutes);
app.route("/", landRoutes);
app.route("/", notificationRoutes);
app.route("/", jobRoutes);

registerErrorHandler(app);

await ensureModuleConfig();
