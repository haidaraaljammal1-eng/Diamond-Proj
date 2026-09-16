import type { DashboardOverviewDto } from "../types/dashboard.types";

/**
 * Picks the presentation overview. Simulation never mixes with real values.
 * Real Dashboard code does not import this — only the removable overlay does.
 */
export function selectDashboardPresentation(
  real: DashboardOverviewDto | null,
  simulationActive: boolean,
  simulated: DashboardOverviewDto | null,
): DashboardOverviewDto | null {
  if (simulationActive && simulated) return simulated;
  return real;
}
