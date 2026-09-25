import "./shared/config";
import { serve } from "@hono/node-server";
import { env } from "./shared/config";
import { app } from "./app";
import { startScheduler, stopScheduler } from "./infrastructure/tasks/scheduler";

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
