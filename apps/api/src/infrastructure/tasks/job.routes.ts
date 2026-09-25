import { Hono } from "hono";
import { isoWeek } from "@plotgo/game";
import type { AppEnv } from "../../shared/types";
import { requireAdmin } from "../../middleware/auth";
import { runDailyReset } from "../../shared/retention";
import {
  dispatchDueNotifications,
  produceEventStartAlerts,
  produceHuntExpiryAlerts,
  produceWeeklyCountdownAlerts,
} from "../../domains/notifications/notifications.service";
import { ensurePendingWeeklySnapshot } from "../../domains/settlement/settlement.service";

/**
 * Admin job triggers (idempotent) — the local stand-in for ops runbooks; also
 * used by the retention acceptance script to drive time-based jobs
 * deterministically.
 */
export const jobRoutes = new Hono<AppEnv>();

jobRoutes.post("/api/admin/jobs/:job", requireAdmin, async (c) => {
  const job = c.req.param("job");
  const now = Date.now();
  switch (job) {
    case "daily-reset": {
      const result = await runDailyReset(now);
      return c.json({ ok: true, job, ...result });
    }
    case "weekly-close": {
      const priorWeek = isoWeek(new Date(now - 7 * 86_400_000));
      const pending = await ensurePendingWeeklySnapshot(priorWeek);
      return c.json({ ok: true, job, week: pending.week, snapshotId: pending.snapshotId, manifestStatus: pending.status });
    }
    case "weekly-countdown": {
      const week = isoWeek(new Date(now));
      await produceWeeklyCountdownAlerts(week, now);
      await produceEventStartAlerts(week, now);
      return c.json({ ok: true, job, week });
    }
    case "notification-dispatch": {
      return c.json({ ok: true, job, sent: await dispatchDueNotifications(now) });
    }
    case "hunt-expiry-alerts": {
      await produceHuntExpiryAlerts(now);
      return c.json({ ok: true, job });
    }
    default:
      return c.json({ error: `unknown job ${job}` }, 404);
  }
});
