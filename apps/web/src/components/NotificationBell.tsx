import { useEffect, useRef, useState } from "react";
import { useNotificationRead, useNotificationReadAll, useNotifications } from "../api/hooks";
import { scrollToSelector } from "../utils";

/** Deep-link-ish target per notification type (scroll only; no fake urgency). */
const DEEP_LINK: Record<string, string> = {
  payout_ready: '[data-onboarding-target="performance-panel"]',
  week_24h: '[data-onboarding-target="performance-panel"]',
  week_6h: '[data-onboarding-target="performance-panel"]',
  hunt_expiry: '[data-onboarding-target="hunt-strip"]',
  event_push: ".event-panel",
  risk_alert: '[data-onboarding-target="settle"]',
};

function timeLabel(createdAt: number) {
  return new Date(createdAt).toLocaleString([], { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
}

/** Inbox list content — shared by the header bell dropdown and the dock sheet. */
export function InboxList() {
  const inbox = useNotifications();
  const markRead = useNotificationRead();
  const markAllRead = useNotificationReadAll();
  const notifications = inbox.data?.notifications ?? [];
  return (
    <div className="inbox-list">
      <div className="bell-dropdown-head">
        <b>Notifications</b>
        {notifications.length ? (
          <button className="verb" type="button" disabled={markAllRead.isPending} onClick={() => markAllRead.mutate()}>
            Mark all read
          </button>
        ) : null}
      </div>
      {inbox.isLoading ? <small className="settled">Loading…</small> : null}
      {!inbox.isLoading && !notifications.length ? (
        <small className="settled">Nothing to review. Alerts only appear when something material changed.</small>
      ) : null}
      {notifications.map((notification) => {
        const unreadItem = notification.state !== "read";
        return (
          <button
            className={`bell-item ${unreadItem ? "unread" : ""}`}
            type="button"
            key={notification.id}
            onClick={() => {
              const target = DEEP_LINK[notification.type];
              if (target) scrollToSelector(target);
              if (unreadItem) markRead.mutate(notification.id);
            }}
          >
            <b>{notification.title}</b>
            <span>{notification.body}</span>
            <small>{timeLabel(notification.createdAt)}</small>
          </button>
        );
      })}
    </div>
  );
}

/** Header bell + in-app inbox (spec sheet 12): newest first, read actions, no pressure copy. */
export function NotificationBell({ unread }: { unread?: number }) {
  const [open, setOpen] = useState(false);
  const inbox = useNotifications();
  const rootRef = useRef<HTMLDivElement>(null);
  const badge = unread ?? inbox.data?.unread ?? 0;

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: PointerEvent) => {
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [open]);

  return (
    <div className="notification-bell" ref={rootRef}>
      <button
        className="bell-button"
        type="button"
        aria-label={badge ? `Notifications (${badge} unread)` : "Notifications"}
        onClick={() => setOpen((value) => !value)}
      >
        🔔
        {badge ? <span className="bell-badge">{badge > 99 ? "99+" : badge}</span> : null}
      </button>
      {open ? (
        <div className="bell-dropdown">
          <InboxList />
        </div>
      ) : null}
    </div>
  );
}
