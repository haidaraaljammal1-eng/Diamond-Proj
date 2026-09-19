"use client";

import { create } from "zustand";
import { isUiDemoSimulationEnabled } from "@/modules/demo-simulation/simulation.enabled";
import {
  buildNotificationsFixture,
  type DemoNotification,
  type NotificationFilter,
  type NotificationRecordTarget,
} from "./notifications-simulation.fixture";

interface NotificationsSimulationState {
  active: boolean;
  notifications: DemoNotification[];
  targets: NotificationRecordTarget[];
  filter: NotificationFilter;
  activate: () => void;
  reset: () => void;
  disable: () => void;
  setFilter: (filter: NotificationFilter) => void;
  markRead: (id: string) => void;
  markAllRead: () => void;
  registerTargets: (targets: NotificationRecordTarget[]) => void;
}

const isEnabled = () => isUiDemoSimulationEnabled("notifications");

export const useNotificationsSimulationStore = create<NotificationsSimulationState>((set, get) => ({
  active: false,
  notifications: [],
  targets: [],
  filter: "ALL",

  activate() {
    if (!isEnabled()) return;
    set((state) => ({
      active: true,
      notifications: buildNotificationsFixture(state.targets),
      filter: "ALL",
    }));
  },

  reset() {
    if (!isEnabled() || !get().active) return;
    set((state) => ({
      notifications: buildNotificationsFixture(state.targets),
      filter: "ALL",
    }));
  },

  disable() {
    set({ active: false, notifications: [], targets: [], filter: "ALL" });
  },

  setFilter(filter) {
    set({ filter });
  },

  markRead(id) {
    set((state) => ({
      notifications: state.notifications.map((item) =>
        item.id === id ? { ...item, read: true } : item,
      ),
    }));
  },

  markAllRead() {
    set((state) => ({
      notifications: state.notifications.map((item) => ({ ...item, read: true })),
    }));
  },

  registerTargets(targets) {
    if (!isEnabled() || targets.length === 0) return;
    set((state) => {
      const next = new Map(state.targets.map((target) => [`${target.entityType}:${target.entityId}`, target]));
      for (const target of targets) next.set(`${target.entityType}:${target.entityId}`, target);
      const allTargets = [...next.values()];
      const previousRead = new Map(state.notifications.map((item) => [item.id, item.read]));
      const nextNotifications = buildNotificationsFixture(allTargets).map((item) =>
        previousRead.has(item.id) ? { ...item, read: previousRead.get(item.id) ?? item.read } : item,
      );
      return {
        targets: allTargets,
        notifications: state.active ? nextNotifications : state.notifications,
      };
    });
  },
}));
