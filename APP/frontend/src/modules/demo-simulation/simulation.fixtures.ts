/**
 * Presentation-only demo values. Never sent to Backend, Azure, Stripe, or TARS.
 */
import type { ContractTarsStateDto } from "@/modules/contracts/types/tars.types";
import type { TarsOperationStatus } from "@/modules/contracts/types/tars.types";

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

/**
 * Company is deliberately absent: a preset may fake integration state, never
 * the Contract's operating company. The real company is merged back in.
 */
export const DEMO_TARS_PRESETS: Record<
  "notStarted" | "syncing" | "synced" | "partialFailure",
  Omit<ContractTarsStateDto, "company">
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
