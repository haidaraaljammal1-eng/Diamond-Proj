import type { ContractPaymentStatus, ContractStatus } from "@prisma/client";
import type { PublicRentalFlowStep } from "src/modules/contracts/contracts.constants";

export function derivePublicRentalFlowStep(input: {
  status: ContractStatus;
  /** Backend identity gate: VALID driving license AND READY passport. */
  identityReady: boolean;
  paymentStatus: ContractPaymentStatus | null;
}): PublicRentalFlowStep {
  if (
    input.status === "PAID" ||
    input.status === "ACTIVE" ||
    input.status === "RETOUT" ||
    input.status === "REVIEW" ||
    input.status === "CLOSED"
  ) {
    return "READY_FOR_HANDOVER";
  }
  if (input.status === "SIGNED" || input.paymentStatus === "PENDING" || input.paymentStatus === "PROCESSING") {
    return "PAYMENT";
  }
  // FORM contracts already passed the document stage; they stay on the contract step.
  if (input.status === "FORM") return "CONTRACT";
  if (input.identityReady) return "CONTRACT";
  return "LICENSE_VERIFICATION";
}
