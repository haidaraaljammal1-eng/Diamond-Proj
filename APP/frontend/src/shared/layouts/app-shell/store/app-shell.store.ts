"use client";

import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

/**
 * AppShell UI-only state.
 *
 * This store owns ONLY the interaction state of the shell itself
 * (mobile drawer + desktop rail expansion). It intentionally does NOT store:
 * - current route          → comes from the URL (useNavigation).
 * - current user           → comes from the Auth/session infrastructure (useAuth).
 * - permissions            → come from the session (usePermissions).
 * - navigation items       → static, centralized in modules/navigation.
 */
interface AppShellState {
  /** Mobile drawer visibility (Demo rail becomes a drawer ≤ 900px). */
  mobileSidebarOpen: boolean;
  /** Desktop rail expansion — icon dock (collapsed) ↔ labelled rail (expanded). */
  sidebarExpanded: boolean;
  /**
   * True once the persisted preference has been applied on the client.
   * Server render is always collapsed, so consumers must gate the expanded
   * layout behind this flag to keep the first client render identical.
   */
  hydrated: boolean;
  toggleSidebar: () => void;
  openMobileSidebar: () => void;
  closeMobileSidebar: () => void;
  toggleSidebarExpanded: () => void;
  setSidebarExpanded: (expanded: boolean) => void;
  markHydrated: () => void;
}

const STORAGE_KEY = "diamond.app-shell";

export const useAppShellStore = create<AppShellState>()(
  persist(
    (set) => ({
      mobileSidebarOpen: false,
      sidebarExpanded: false,
      hydrated: false,
      toggleSidebar: () =>
        set((state) => ({ mobileSidebarOpen: !state.mobileSidebarOpen })),
      openMobileSidebar: () => set({ mobileSidebarOpen: true }),
      closeMobileSidebar: () => set({ mobileSidebarOpen: false }),
      toggleSidebarExpanded: () =>
        set((state) => ({ sidebarExpanded: !state.sidebarExpanded })),
      setSidebarExpanded: (expanded) => set({ sidebarExpanded: expanded }),
      markHydrated: () =>
        set((state) => (state.hydrated ? state : { hydrated: true })),
    }),
    {
      name: STORAGE_KEY,
      storage: createJSONStorage(() => localStorage),
      /** Only the persistent user preference is stored — never session UI state. */
      partialize: (state) => ({ sidebarExpanded: state.sidebarExpanded }),
    },
  ),
);

/**
 * Expanded rail selector — false until the persisted preference is applied,
 * so server HTML and the first client render always agree.
 */
export const selectSidebarExpanded = (state: AppShellState): boolean =>
  state.hydrated && state.sidebarExpanded;
