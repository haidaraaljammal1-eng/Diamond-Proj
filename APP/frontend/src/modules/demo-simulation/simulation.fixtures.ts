/**
 * Presentation-only demo values. Never sent to Backend, Azure, Stripe, or TARS.
 */
import type { SimulatedCustomerState } from "./simulation.types";
import type { ContractTarsStateDto } from "@/modules/contracts/types/tars.types";
import type { TarsOperationStatus } from "@/modules/contracts/types/tars.types";

export const DEMO_LICENSE_VALID = {
  licenseNumber: "DXB-DEMO-482731",
  expiryDate: "2028-06-15",
} as const;

export const DEMO_LICENSE_EXPIRED = {
  licenseNumber: "DXB-DEMO-482731",
  expiryDate: "2020-01-12",
} as const;

/** Synthetic passport identity (not a real person). */
export const DEMO_PASSPORT_READY = {
  fullName: "DEMO CUSTOMER",
  passportNumber: "P1234567",
  nationality: "United Arab Emirates",
  dateOfBirth: "1990-01-01",
  sex: null,
  passportIssueDate: null,
  passportExpiryDate: "2031-12-31",
  issuingCountry: null,
} as const;

export const DEMO_CUSTOMER: SimulatedCustomerState = {
  name: "Demo Customer",
  mobile: "050 123 4567",
  email: "demo.customer@example.com",
  nationality: "UAE",
  identityNumber: "DEMO-784-XXXX",
  passportNumber: "",
  address: "Dubai, UAE",
};

export const DEMO_PAYMENT_REFERENCE = "DEMO-PAY-00001";

function ops(
  values: Partial<Record<keyof ContractTarsStateDto["operations"], TarsOperationStatus>>,
): ContractTarsStateDto["operations"] {
  return {
    registerContract: "NOT_STARTED",
    contractAcceptance: "NOT_STARTED",
    handover: "NOT_STARTED",
    returnDocumentation: "NOT_STARTED",
    completeContract: "NOT_STARTED",
    ...values,
  };
}

export const DEMO_TARS_PRESETS: Record<
  "notStarted" | "syncing" | "synced" | "partialFailure",
  ContractTarsStateDto
> = {
  notStarted: {
    configured: true,
    externalContractId: null,
    lastSuccessfulSyncAt: null,
    operations: ops({}),
  },
  syncing: {
    configured: true,
    externalContractId: null,
    lastSuccessfulSyncAt: null,
    operations: ops({
      registerContract: "SUCCEEDED",
      contractAcceptance: "PROCESSING",
    }),
  },
  synced: {
    configured: true,
    externalContractId: "DEMO-TARS-STATUS",
    lastSuccessfulSyncAt: "2026-09-09T10:00:00.000Z",
    operations: ops({
      registerContract: "SUCCEEDED",
      contractAcceptance: "SUCCEEDED",
      handover: "SUCCEEDED",
    }),
  },
  partialFailure: {
    configured: true,
    externalContractId: "DEMO-TARS-STATUS",
    lastSuccessfulSyncAt: "2026-09-09T10:00:00.000Z",
    operations: ops({
      registerContract: "SUCCEEDED",
      contractAcceptance: "SUCCEEDED",
      handover: "FAILED",
    }),
  },
};
