"use client";

import { useDemoSimulationStore } from "../simulation.store";
import { isDemoSimulationEnabled } from "../simulation.enabled";
import type { SimulationSnapshot } from "../simulation.types";

export function useDemoSimulation() {
  const enabled = isDemoSimulationEnabled();
  const store = useDemoSimulationStore();

  const snapshot: SimulationSnapshot = {
    active: store.active,
    generation: store.generation,
    flowStep: store.flowStep,
    contractStatus: store.contractStatus,
    license: store.license,
    passport: store.passport,
    customer: store.customer,
    formPending: store.formPending,
    acceptPending: store.acceptPending,
    payment: store.payment,
    tarsPreset: store.tarsPreset,
    gpsOverlay: store.gpsOverlay,
    roadLiabilitiesOverlay: store.roadLiabilitiesOverlay,
    financeOverlay: store.financeOverlay,
  };

  return {
    enabled,
    snapshot,
    active: enabled && store.active,
    simulateLicense: store.simulateLicense,
    simulatePassport: store.simulatePassport,
    fillDemoCustomer: store.fillDemoCustomer,
    simulateFormSubmit: store.simulateFormSubmit,
    simulateAccept: store.simulateAccept,
    setPaymentScenario: store.setPaymentScenario,
    simulatePayment: store.simulatePayment,
    simulateTars: store.simulateTars,
    simulateGps: store.simulateGps,
    tickGpsPath: store.tickGpsPath,
    clearGpsOverlay: store.clearGpsOverlay,
    simulateRoadLiabilities: store.simulateRoadLiabilities,
    attachSimulatedRoadLiabilityCharge: store.attachSimulatedRoadLiabilityCharge,
    clearRoadLiabilitiesOverlay: store.clearRoadLiabilitiesOverlay,
    simulateFinance: store.simulateFinance,
    clearFinanceOverlay: store.clearFinanceOverlay,
    clearRentalOverlay: store.clearRentalOverlay,
    reset: store.reset,
  };
}
