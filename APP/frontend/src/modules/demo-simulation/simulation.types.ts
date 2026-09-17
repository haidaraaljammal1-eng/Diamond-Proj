import type { SimulatedGpsOverlay } from "@/modules/gps/utils/gps-simulation";
import type { SimulatedRoadLiabilitiesOverlay } from "@/modules/road-liabilities/utils/road-liability-simulation";
import type { FinanceSimulationOverlay } from "@/modules/finance/utils/finance-simulation";
import type { PublicPassportFields } from "@/modules/public-rental/types/public-rental.types";

export type SimulatedLicenseScenario = "valid" | "expired" | "unreadable";
export type SimulatedPassportScenario = "ready" | "notRecognized";
export type SimulatedPaymentScenario = "success" | "failed" | "pending";
export type SimulatedTarsPreset =
  | "notStarted"
  | "syncing"
  | "synced"
  | "partialFailure";

export type SimulationSurface = "license" | "passport" | "contract" | "payment" | "tars" | "gps" | "violations" | "finance";

export interface SimulatedLicenseState {
  verifying: boolean;
  scenario: SimulatedLicenseScenario;
  status: "VALID" | "EXPIRED" | "UNREADABLE" | null;
  licenseNumber: string | null;
  expiryDate: string | null;
}

/** Normalized passport result shape, identical to the Backend identity projection. */
export interface SimulatedPassportState {
  processing: boolean;
  scenario: SimulatedPassportScenario;
  status: "READY" | "NOT_RECOGNIZED" | null;
  fields: PublicPassportFields | null;
}

export interface SimulatedCustomerState {
  name: string;
  mobile: string;
  email: string;
  nationality: string;
  identityNumber: string;
  passportNumber: string;
  address: string;
}

export interface SimulatedPaymentState {
  scenario: SimulatedPaymentScenario;
  status: "PENDING" | "PROCESSING" | "CONFIRMED" | "FAILED" | null;
  payPending: boolean;
  reference: string | null;
}

export interface SimulationSnapshot {
  active: boolean;
  generation: number;
  flowStep: "LICENSE_VERIFICATION" | "CONTRACT" | "PAYMENT" | "READY_FOR_HANDOVER" | null;
  contractStatus: "AWAITING" | "FORM" | "SIGNED" | "PAID" | null;
  license: SimulatedLicenseState;
  passport: SimulatedPassportState;
  customer: SimulatedCustomerState | null;
  formPending: boolean;
  acceptPending: boolean;
  payment: SimulatedPaymentState;
  tarsPreset: SimulatedTarsPreset | null;
  gpsOverlay: SimulatedGpsOverlay | null;
  roadLiabilitiesOverlay: SimulatedRoadLiabilitiesOverlay | null;
  financeOverlay: FinanceSimulationOverlay | null;
}

export const DEMO_SIMULATION_DELAYS = {
  licenseMs: 1100,
  passportMs: 1100,
  formMs: 500,
  acceptMs: 700,
  paymentProcessingMs: 1400,
  paymentPendingMs: 1400,
  paymentConfirmedMs: 800,
} as const;
