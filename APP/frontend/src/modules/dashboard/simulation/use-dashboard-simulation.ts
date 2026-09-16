"use client";

import { isDemoSimulationEnabled } from "@/modules/demo-simulation/simulation.enabled";
import { useDashboardSimulationStore } from "./dashboard-simulation.store";

export function useDashboardSimulation() {
  const enabled = isDemoSimulationEnabled();
  const active = useDashboardSimulationStore((s) => s.active);
  const overview = useDashboardSimulationStore((s) => s.overview);
  const activate = useDashboardSimulationStore((s) => s.activate);
  const reset = useDashboardSimulationStore((s) => s.reset);
  const disable = useDashboardSimulationStore((s) => s.disable);

  return {
    enabled,
    active: enabled && active,
    overview: enabled && active ? overview : null,
    activate,
    reset,
    disable,
  };
}
