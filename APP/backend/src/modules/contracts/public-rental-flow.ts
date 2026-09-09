import type {
  ContractPaymentStatus,
  ContractStatus,
  DrivingLicenseVerificationStatus,
} from "@prisma/client";
import type { PublicRentalFlowStep } from "src/modules/contracts/contracts.constants";

export function derivePublicRentalFlowStep(input: {
  status: ContractStatus;
  licenseStatus: DrivingLicenseVerificationStatus | null;
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
  if (input.status === "FORM") return "CONTRACT";
  if (input.licenseStatus === "VALID") return "CONTRACT";
  return "LICENSE_VERIFICATION";
}
