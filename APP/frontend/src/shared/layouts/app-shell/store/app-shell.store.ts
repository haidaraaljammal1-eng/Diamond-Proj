"use client";

import { create } from "zustand";

/**
 * AppShell UI-only state.
 *
 * This store owns ONLY the interaction state of the shell itself
 * (mobile drawer). It intentionally does NOT store:
 * - current route          → comes from the URL (useNavigation).
 * - current user           → comes from the Auth/session infrastructure (useAuth).
 * - permissions            → come from the session (usePermissions).
 * - navigation items       → static, centralized in modules/navigation.
 */
interface AppShellState {
  /** Mobile drawer visibility (Demo rail becomes a drawer ≤ 900px). */
  mobileSidebarOpen: boolean;
  toggleSidebar: () => void;
  openMobileSidebar: () => void;
  closeMobileSidebar: () => void;
}

export const useAppShellStore = create<AppShellState>((set) => ({
  mobileSidebarOpen: false,
  toggleSidebar: () =>
    set((state) => ({ mobileSidebarOpen: !state.mobileSidebarOpen })),
  openMobileSidebar: () => set({ mobileSidebarOpen: true }),
  closeMobileSidebar: () => set({ mobileSidebarOpen: false }),
}));