"use client";

import { useCallback, useEffect, useMemo } from "react";
import { isUiDemoSimulationEnabled } from "@/modules/demo-simulation/simulation.enabled";
import { useNotificationsSimulationStore } from "./notifications-simulation.store";
import type { NotificationRecordTarget } from "./notifications-simulation.fixture";

export function useNotificationsSimulation() {
  const enabled = isUiDemoSimulationEnabled("notifications");
  const active = useNotificationsSimulationStore((state) => state.active);
  const notifications = useNotificationsSimulationStore((state) => state.notifications);
  const filter = useNotificationsSimulationStore((state) => state.filter);
  const activate = useNotificationsSimulationStore((state) => state.activate);
  const setFilter = useNotificationsSimulationStore((state) => state.setFilter);
  const markRead = useNotificationsSimulationStore((state) => state.markRead);
  const markAllRead = useNotificationsSimulationStore((state) => state.markAllRead);
  const registerTargets = useNotificationsSimulationStore((state) => state.registerTargets);

  useEffect(() => {
    if (enabled && !active) activate();
  }, [activate, active, enabled]);

  const registerNotificationTargets = useCallback(
    (targets: NotificationRecordTarget[]) => {
      if (enabled) registerTargets(targets);
    },
    [enabled, registerTargets],
  );

  const visibleNotifications = useMemo(() => {
    if (!enabled || !active) return [];
    return notifications.filter((item) => {
      if (filter === "UNREAD") return !item.read;
      if (filter === "ALL") return true;
      return item.category === filter;
    });
  }, [active, enabled, filter, notifications]);

  const unreadCount = enabled && active ? notifications.filter((item) => !item.read).length : 0;

  return {
    enabled,
    active: enabled && active,
    notifications: visibleNotifications,
    filter,
    unreadCount,
    setFilter,
    markRead,
    markAllRead,
    registerTargets: registerNotificationTargets,
  };
}
