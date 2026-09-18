"use client";

import { useDemoSimulationStore } from "../simulation.store";
import { isDemoSimulationEnabled, isUiDemoSimulationEnabled } from "../simulation.enabled";
import type { SimulationSnapshot } from "../simulation.types";

/** The legacy hook stays inert except for the explicit Road Liabilities demo. */
export function useDemoSimulation(surface?: "violations") {
  const store = useDemoSimulationStore();
  const enabled = surface === "violations"
    ? isUiDemoSimulationEnabled("roadLiabilities")
    : isDemoSimulationEnabled();
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
    active: enabled && (surface === "violations" ? store.roadLiabilitiesOverlay !== null : store.active),
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
