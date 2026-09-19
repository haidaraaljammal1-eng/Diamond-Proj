"use client";

import { create } from "zustand";
import { isUiDemoSimulationEnabled } from "@/modules/demo-simulation/simulation.enabled";
import {
  buildNotificationsFixture,
  type DemoNotification,
  type NotificationFilter,
} from "./notifications-simulation.fixture";

interface NotificationsSimulationState {
  active: boolean;
  notifications: DemoNotification[];
  filter: NotificationFilter;
  activate: () => void;
  reset: () => void;
  disable: () => void;
  setFilter: (filter: NotificationFilter) => void;
  markRead: (id: string) => void;
  markAllRead: () => void;
}

const isEnabled = () => isUiDemoSimulationEnabled("notifications");

export const useNotificationsSimulationStore = create<NotificationsSimulationState>((set, get) => ({
  active: false,
  notifications: [],
  filter: "ALL",

  activate() {
    if (!isEnabled()) return;
    set({ active: true, notifications: buildNotificationsFixture(), filter: "ALL" });
  },

  reset() {
    if (!isEnabled() || !get().active) return;
    set({ notifications: buildNotificationsFixture(), filter: "ALL" });
  },

  disable() {
    set({ active: false, notifications: [], filter: "ALL" });
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
}));
