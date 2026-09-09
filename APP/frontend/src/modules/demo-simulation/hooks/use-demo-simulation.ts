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
    customer: store.customer,
    formPending: store.formPending,
    acceptPending: store.acceptPending,
    payment: store.payment,
    tarsPreset: store.tarsPreset,
  };

  return {
    enabled,
    snapshot,
    active: enabled && store.active,
    simulateLicense: store.simulateLicense,
    fillDemoCustomer: store.fillDemoCustomer,
    simulateFormSubmit: store.simulateFormSubmit,
    simulateAccept: store.simulateAccept,
    setPaymentScenario: store.setPaymentScenario,
    simulatePayment: store.simulatePayment,
    simulateTars: store.simulateTars,
    clearRentalOverlay: store.clearRentalOverlay,
    reset: store.reset,
  };
}
