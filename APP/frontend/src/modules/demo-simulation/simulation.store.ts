"use client";

import { create } from "zustand";
import { isDemoSimulationEnabled, isUiDemoSimulationEnabled } from "./simulation.enabled";
import type { SimulatedTarsPreset, SimulationSnapshot } from "./simulation.types";
import type { SimulatedGpsOverlay } from "@/modules/gps/utils/gps-simulation";
import { advanceGpsSimulationPath } from "@/modules/gps/utils/gps-simulation";
import type { SimulatedRoadLiabilitiesOverlay } from "@/modules/road-liabilities/utils/road-liability-simulation";
import { applySimulatedChargeReview } from "@/modules/road-liabilities/utils/road-liability-simulation";
import type { ConfirmRoadLiabilityChargePayload } from "@/modules/road-liabilities/types/road-liability-charge-review.types";
import type { FinanceSimulationOverlay } from "@/modules/finance/utils/finance-simulation";

interface LegacyPresentationState extends SimulationSnapshot {
  simulateTars: (preset: SimulatedTarsPreset) => void;
  simulateGps: (overlay: SimulatedGpsOverlay) => void;
  tickGpsPath: () => void;
  clearGpsOverlay: () => void;
  simulateRoadLiabilities: (overlay: SimulatedRoadLiabilitiesOverlay) => void;
  attachSimulatedRoadLiabilityCharge: (id: string, payload: ConfirmRoadLiabilityChargePayload) => void;
  clearRoadLiabilitiesOverlay: () => void;
  simulateFinance: (overlay: FinanceSimulationOverlay) => void;
  patchFinanceOverlay: (updater: (overlay: FinanceSimulationOverlay) => FinanceSimulationOverlay) => void;
  clearFinanceOverlay: () => void;
  reset: () => void;
}

const empty: SimulationSnapshot = {
  active: false,
  generation: 0,
  tarsPreset: null,
  gpsOverlay: null,
  roadLiabilitiesOverlay: null,
  financeOverlay: null,
};

/** Browser-only presentation state. Only Road Liabilities is currently enabled here. */
export const useDemoSimulationStore = create<LegacyPresentationState>((set, get) => ({
  ...empty,
  simulateTars(preset) { if (isDemoSimulationEnabled()) set({ active: true, tarsPreset: preset }); },
  simulateGps(overlay) { if (isDemoSimulationEnabled()) set({ active: true, gpsOverlay: overlay }); },
  tickGpsPath() {
    if (!isDemoSimulationEnabled()) return;
    const current = get().gpsOverlay;
    if (current) set({ gpsOverlay: advanceGpsSimulationPath(current) });
  },
  clearGpsOverlay() { set({ gpsOverlay: null, active: false }); },
  simulateRoadLiabilities(overlay) { if (isUiDemoSimulationEnabled("roadLiabilities")) set({ active: true, roadLiabilitiesOverlay: overlay }); },
  attachSimulatedRoadLiabilityCharge(id, payload) {
    if (!isUiDemoSimulationEnabled("roadLiabilities")) return;
    const current = get().roadLiabilitiesOverlay;
    if (current) set({ roadLiabilitiesOverlay: applySimulatedChargeReview(current, id, payload) });
  },
  clearRoadLiabilitiesOverlay() { set({ roadLiabilitiesOverlay: null, active: false }); },
  simulateFinance(overlay) { if (isDemoSimulationEnabled()) set({ active: true, financeOverlay: overlay }); },
  patchFinanceOverlay(updater) {
    if (!isDemoSimulationEnabled()) return;
    const current = get().financeOverlay;
    if (current) set({ financeOverlay: updater(current) });
  },
  clearFinanceOverlay() { set({ financeOverlay: null, active: false }); },
  reset() { set({ ...empty, generation: get().generation + 1 }); },
}));
