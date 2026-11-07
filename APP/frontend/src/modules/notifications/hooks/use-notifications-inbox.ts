"use client";

import { useEffect, useMemo } from "react";
import { usePermissions } from "@/modules/auth/hooks/use-permissions";
import { useNotificationsInboxStore } from "../stores/notifications-inbox.store";

const POLL_MS = 30_000;

/**
 * Staff in-app inbox backed by `GET /notifications` (Pushover mirrors + other
 * IN_APP rows). Polls while the shell is open so new alerts appear without a
 * full page reload.
 */
export function useNotificationsInbox() {
  const { hasPermission, isSystemAdmin } = usePermissions();
  const canRead = isSystemAdmin || hasPermission("notifications.read");

  const items = useNotificationsInboxStore((state) => state.items);
  const unreadCount = useNotificationsInboxStore((state) => state.unreadCount);
  const filter = useNotificationsInboxStore((state) => state.filter);
  const status = useNotificationsInboxStore((state) => state.status);
  const setFilter = useNotificationsInboxStore((state) => state.setFilter);
  const load = useNotificationsInboxStore((state) => state.load);
  const refresh = useNotificationsInboxStore((state) => state.refresh);
  const markRead = useNotificationsInboxStore((state) => state.markRead);
  const markAllRead = useNotificationsInboxStore((state) => state.markAllRead);

  useEffect(() => {
    if (!canRead) return;
    void load();
  }, [canRead, load]);

  useEffect(() => {
    if (!canRead) return;
    const timer = window.setInterval(() => {
      if (document.visibilityState === "visible") void refresh();
    }, POLL_MS);
    const onFocus = () => void refresh();
    window.addEventListener("focus", onFocus);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener("focus", onFocus);
    };
  }, [canRead, refresh]);

  const notifications = useMemo(() => {
    if (filter === "UNREAD") return items.filter((row) => row.readAt == null);
    return items;
  }, [filter, items]);

  return {
    canRead,
    notifications,
    unreadCount: canRead ? unreadCount : 0,
    filter,
    status,
    setFilter,
    markRead,
    markAllRead,
    refresh,
  };
}
