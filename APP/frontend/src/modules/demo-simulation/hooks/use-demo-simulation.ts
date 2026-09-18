"use client";

import { useDemoSimulationStore } from "../simulation.store";
import { isDemoSimulationEnabled } from "../simulation.enabled";
import type { SimulationSnapshot } from "../simulation.types";

/** Compatibility hook: legacy presentation simulations are retired. */
export function useDemoSimulation() {
  const store = useDemoSimulationStore();
  const enabled = isDemoSimulationEnabled();
  const snapshot: SimulationSnapshot = {
    active: store.active,
    generation: store.generation,
    tarsPreset: store.tarsPreset,
    gpsOverlay: store.gpsOverlay,
    roadLiabilitiesOverlay: store.roadLiabilitiesOverlay,
    financeOverlay: store.financeOverlay,
  };
  return {
    enabled,
    snapshot,
    active: enabled && store.active,
    simulateTars: store.simulateTars,
    simulateGps: store.simulateGps,
    tickGpsPath: store.tickGpsPath,
    clearGpsOverlay: store.clearGpsOverlay,
    simulateRoadLiabilities: store.simulateRoadLiabilities,
    attachSimulatedRoadLiabilityCharge: store.attachSimulatedRoadLiabilityCharge,
    clearRoadLiabilitiesOverlay: store.clearRoadLiabilitiesOverlay,
    simulateFinance: store.simulateFinance,
    patchFinanceOverlay: store.patchFinanceOverlay,
    clearFinanceOverlay: store.clearFinanceOverlay,
    reset: store.reset,
  };
}
