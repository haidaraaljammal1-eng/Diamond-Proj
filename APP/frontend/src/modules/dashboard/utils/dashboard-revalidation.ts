import {
  startContractsRevalidation,
  type RevalidationEnvironment,
} from "@/modules/contracts/utils/contracts-revalidation";

/** Dashboard operational refresh while the tab is visible — same pattern as Contracts. */
export const DASHBOARD_REVALIDATE_INTERVAL_MS = 30_000;

export function startDashboardRevalidation(
  refresh: () => Promise<void>,
  env: RevalidationEnvironment,
): () => void {
  return startContractsRevalidation(refresh, env, {
    intervalMs: DASHBOARD_REVALIDATE_INTERVAL_MS,
  });
}
