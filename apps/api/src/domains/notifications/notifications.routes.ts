import { Hono } from "hono";
import type { AppEnv } from "../../shared/types";
import { requirePlayer } from "../../middleware/auth";
import { inboxFor, markAllRead, markRead } from "./notifications.service";

export const notificationRoutes = new Hono<AppEnv>();

/** Pending + unread sent notifications (in-app inbox), newest first. */
notificationRoutes.get("/api/notifications", requirePlayer, async (c) => {
  const id = c.get("player").id;
  const notifications = await inboxFor(id);
  return c.json({ notifications, unread: notifications.length });
});

notificationRoutes.post("/api/notifications/:id/read", requirePlayer, async (c) => {
  const id = c.get("player").id;
  const read = await markRead(id, c.req.param("id"));
  if (!read) return c.json({ error: "Notification not found or already read" }, 404);
  return c.json({ read: true });
});

notificationRoutes.post("/api/notifications/read-all", requirePlayer, async (c) => {
  const id = c.get("player").id;
  return c.json({ read: await markAllRead(id) });
});
