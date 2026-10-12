import { useDashboardStore } from "../stores/dashboard.store";

/** Lightweight cross-module refresh when fleet or contract data changes elsewhere in the app. */
export function requestDashboardRefresh(): void {
  const state = useDashboardStore.getState();
  if (state.status === "idle" && state.overview == null) return;
  void state.refresh();
}
