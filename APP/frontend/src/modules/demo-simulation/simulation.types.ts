export type SimulatedLicenseScenario = "valid" | "expired" | "unreadable";
export type SimulatedPaymentScenario = "success" | "failed" | "pending";
export type SimulatedTarsPreset =
  | "notStarted"
  | "syncing"
  | "synced"
  | "partialFailure";

export type SimulationSurface = "license" | "contract" | "payment" | "tars";

export interface SimulatedLicenseState {
  verifying: boolean;
  scenario: SimulatedLicenseScenario;
  status: "VALID" | "EXPIRED" | "UNREADABLE" | null;
  licenseNumber: string | null;
  expiryDate: string | null;
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
  customer: SimulatedCustomerState | null;
  formPending: boolean;
  acceptPending: boolean;
  payment: SimulatedPaymentState;
  tarsPreset: SimulatedTarsPreset | null;
}

export const DEMO_SIMULATION_DELAYS = {
  licenseMs: 1100,
  formMs: 500,
  acceptMs: 700,
  paymentProcessingMs: 1400,
  paymentPendingMs: 1400,
  paymentConfirmedMs: 800,
} as const;
