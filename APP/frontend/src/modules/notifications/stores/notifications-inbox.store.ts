"use client";

import { create } from "zustand";
import { normalizeApiError, type ApiRequestError } from "@/infrastructure/api/errors";
import {
  getMyUnreadNotificationCount,
  listMyNotifications,
  markAllNotificationsRead,
  markNotificationRead,
} from "../api/notifications.api";
import type {
  NotificationsInboxFilter,
  StaffNotificationDto,
} from "../types/notifications.types";

export type NotificationsInboxStatus = "idle" | "loading" | "ready" | "error";

interface NotificationsInboxState {
  items: StaffNotificationDto[];
  unreadCount: number;
  filter: NotificationsInboxFilter;
  status: NotificationsInboxStatus;
  error: ApiRequestError | null;
  setFilter: (filter: NotificationsInboxFilter) => void;
  load: () => Promise<void>;
  refresh: () => Promise<void>;
  markRead: (id: string) => Promise<void>;
  markAllRead: () => Promise<void>;
}

let requestSeq = 0;

export const useNotificationsInboxStore = create<NotificationsInboxState>((set, get) => ({
  items: [],
  unreadCount: 0,
  filter: "ALL",
  status: "idle",
  error: null,

  setFilter(filter) {
    set({ filter });
  },

  async load() {
    const requestId = ++requestSeq;
    set({ status: "loading", error: null });
    try {
      const [items, unreadCount] = await Promise.all([
        listMyNotifications({ page: 1, pageSize: 50 }),
        getMyUnreadNotificationCount(),
      ]);
      if (requestId !== requestSeq) return;
      set({ items, unreadCount, status: "ready", error: null });
    } catch (error) {
      if (requestId !== requestSeq) return;
      set({
        status: "error",
        error: normalizeApiError(error),
      });
    }
  },

  async refresh() {
    await get().load();
  },

  async markRead(id) {
    const previous = get().items;
    const wasUnread = previous.some((row) => row.id === id && row.readAt == null);
    set({
      items: previous.map((row) =>
        row.id === id ? { ...row, readAt: row.readAt ?? new Date().toISOString() } : row,
      ),
      unreadCount: wasUnread ? Math.max(0, get().unreadCount - 1) : get().unreadCount,
    });
    try {
      await markNotificationRead(id);
    } catch {
      await get().refresh();
    }
  },

  async markAllRead() {
    const previous = get().items;
    set({
      items: previous.map((row) => ({
        ...row,
        readAt: row.readAt ?? new Date().toISOString(),
      })),
      unreadCount: 0,
    });
    try {
      await markAllNotificationsRead();
    } catch {
      await get().refresh();
    }
  },
}));
