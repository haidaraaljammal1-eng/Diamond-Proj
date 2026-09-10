"use client";

import { create } from "zustand";
import { DEMO_CUSTOMER } from "./simulation.fixtures";
import {
  DEMO_SIMULATION_DELAYS,
  type SimulatedLicenseScenario,
  type SimulatedPaymentScenario,
  type SimulatedTarsPreset,
  type SimulationSnapshot,
} from "./simulation.types";
import type { SimulatedGpsOverlay } from "@/modules/gps/utils/gps-simulation";
import { advanceGpsSimulationPath } from "@/modules/gps/utils/gps-simulation";
import type { SimulatedRoadLiabilitiesOverlay } from "@/modules/road-liabilities/utils/road-liability-simulation";
import {
  applySimulatedChargeReview,
} from "@/modules/road-liabilities/utils/road-liability-simulation";
import type { ConfirmRoadLiabilityChargePayload } from "@/modules/road-liabilities/types/road-liability-charge-review.types";
import type { PublicRentalFormValues } from "@/modules/public-rental/schemas/public-rental-form.schema";
import { licenseSimulationResult, paymentSimulationPhase } from "./simulation.utils";

interface DemoSimulationState extends SimulationSnapshot {
  simulateLicense: (scenario: SimulatedLicenseScenario) => Promise<void>;
  fillDemoCustomer: () => void;
  simulateFormSubmit: (values: PublicRentalFormValues) => Promise<boolean>;
  simulateAccept: () => Promise<boolean>;
  setPaymentScenario: (scenario: SimulatedPaymentScenario) => void;
  simulatePayment: (scenario?: SimulatedPaymentScenario) => Promise<void>;
  simulateTars: (preset: SimulatedTarsPreset) => void;
  simulateGps: (overlay: SimulatedGpsOverlay) => void;
  tickGpsPath: () => void;
  clearGpsOverlay: () => void;
  simulateRoadLiabilities: (overlay: SimulatedRoadLiabilitiesOverlay) => void;
  attachSimulatedRoadLiabilityCharge: (
    roadLiabilityId: string,
    payload: ConfirmRoadLiabilityChargePayload,
  ) => void;
  clearRoadLiabilitiesOverlay: () => void;
  clearRentalOverlay: () => void;
  reset: () => void;
}

const idleLicense = {
  verifying: false,
  scenario: "valid" as SimulatedLicenseScenario,
  status: null,
  licenseNumber: null,
  expiryDate: null,
};

const idlePayment = {
  scenario: "success" as SimulatedPaymentScenario,
  status: null,
  payPending: false,
  reference: null,
};

const empty: SimulationSnapshot = {
  active: false,
  generation: 0,
  flowStep: null,
  contractStatus: null,
  license: idleLicense,
  customer: null,
  formPending: false,
  acceptPending: false,
  payment: idlePayment,
  tarsPreset: null,
  gpsOverlay: null,
  roadLiabilitiesOverlay: null,
};

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

/** In-memory presentation state. Never persist. */
export const useDemoSimulationStore = create<DemoSimulationState>((set, get) => ({
  ...empty,

  async simulateLicense(scenario) {
    const generation = get().generation + 1;
    set({
      active: true,
      generation,
      license: {
        verifying: true,
        scenario,
        status: null,
        licenseNumber: null,
        expiryDate: null,
      },
    });
    await wait(DEMO_SIMULATION_DELAYS.licenseMs);
    if (get().generation !== generation) return;
    const result = licenseSimulationResult(scenario);
    set({
      license: result.license,
      flowStep: result.flowStep,
    });
  },

  fillDemoCustomer() {
    set({
      active: true,
      customer: { ...DEMO_CUSTOMER },
    });
  },

  async simulateFormSubmit(values) {
    const generation = get().generation + 1;
    set({ active: true, generation, formPending: true });
    await wait(DEMO_SIMULATION_DELAYS.formMs);
    if (get().generation !== generation) return false;
    set({
      formPending: false,
      contractStatus: "FORM",
      customer: {
        name: values.name,
        mobile: values.mobile,
        email: values.email,
        nationality: values.nationality,
        identityNumber: values.identityNumber,
        passportNumber: values.passportNumber,
        address: values.address,
      },
    });
    return true;
  },

  async simulateAccept() {
    const generation = get().generation + 1;
    set({ active: true, generation, acceptPending: true, contractStatus: "FORM" });
    await wait(DEMO_SIMULATION_DELAYS.acceptMs);
    if (get().generation !== generation) return false;
    set({
      acceptPending: false,
      contractStatus: "SIGNED",
      flowStep: "PAYMENT",
    });
    return true;
  },

  setPaymentScenario(scenario) {
    set({
      payment: { ...get().payment, scenario },
    });
  },

  async simulatePayment(scenario) {
    const chosen = scenario ?? get().payment.scenario;
    const generation = get().generation + 1;
    const processing = paymentSimulationPhase(chosen, "processing");
    set({
      active: true,
      generation,
      flowStep: processing.flowStep,
      payment: processing.payment,
    });
    await wait(DEMO_SIMULATION_DELAYS.paymentProcessingMs);
    if (get().generation !== generation) return;

    if (chosen === "failed") {
      const failed = paymentSimulationPhase(chosen, "failed");
      set({ payment: failed.payment, flowStep: failed.flowStep });
      return;
    }

    const pending = paymentSimulationPhase(chosen, "pending");
    set({ payment: pending.payment, flowStep: pending.flowStep });
    if (chosen === "pending") return;

    await wait(DEMO_SIMULATION_DELAYS.paymentPendingMs);
    if (get().generation !== generation) return;
    const confirmed = paymentSimulationPhase(chosen, "confirmed");
    set({ payment: confirmed.payment, flowStep: confirmed.flowStep });
    await wait(DEMO_SIMULATION_DELAYS.paymentConfirmedMs);
    if (get().generation !== generation) return;
    const handover = paymentSimulationPhase(chosen, "handover");
    set({
      contractStatus: handover.contractStatus,
      flowStep: handover.flowStep,
      payment: handover.payment,
    });
  },

  simulateTars(preset) {
    set({ active: true, tarsPreset: preset });
  },

  simulateGps(overlay) {
    set({
      active: true,
      gpsOverlay: overlay,
    });
  },

  tickGpsPath() {
    const overlay = get().gpsOverlay;
    if (!overlay) return;
    set({ gpsOverlay: advanceGpsSimulationPath(overlay) });
  },

  simulateRoadLiabilities(overlay) {
    set({
      active: true,
      roadLiabilitiesOverlay: overlay,
    });
  },

  attachSimulatedRoadLiabilityCharge(roadLiabilityId, payload) {
    const overlay = get().roadLiabilitiesOverlay;
    if (!overlay) return;
    set({
      roadLiabilitiesOverlay: applySimulatedChargeReview(overlay, roadLiabilityId, payload),
    });
  },

  clearRoadLiabilitiesOverlay() {
    set({
      roadLiabilitiesOverlay: null,
      active:
        get().tarsPreset != null ||
        get().flowStep != null ||
        get().license.status != null ||
        get().gpsOverlay != null,
    });
  },

  clearGpsOverlay() {
    const gpsCleared = null;
    set({
      gpsOverlay: gpsCleared,
      active:
        get().tarsPreset != null ||
        get().flowStep != null ||
        get().license.status != null ||
        get().roadLiabilitiesOverlay != null,
    });
  },

  clearRentalOverlay() {
    const generation = get().generation + 1;
    set({
      generation,
      flowStep: null,
      contractStatus: null,
      license: idleLicense,
      customer: null,
      formPending: false,
      acceptPending: false,
      payment: idlePayment,
      active:
        get().tarsPreset != null ||
        get().gpsOverlay != null ||
        get().roadLiabilitiesOverlay != null,
    });
  },

  reset() {
    set({ ...empty, generation: get().generation + 1 });
  },
}));
