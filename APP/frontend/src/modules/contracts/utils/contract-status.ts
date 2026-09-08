import type { ChipTone } from "@/shared/components/ui/chip";
import type { ContractStatus } from "../types/contract.types";

export interface ContractStatusPresentation {
  translationKey: ContractStatus;
  tone: ChipTone;
}

const PRESENTATION: Record<ContractStatus, ContractStatusPresentation> = {
  AWAITING: { translationKey: "AWAITING", tone: "warn" },
  FORM: { translationKey: "FORM", tone: "warn" },
  SIGNED: { translationKey: "SIGNED", tone: "gold" },
  PAID: { translationKey: "PAID", tone: "gold" },
  ACTIVE: { translationKey: "ACTIVE", tone: "ok" },
  RETOUT: { translationKey: "RETOUT", tone: "warn" },
  REVIEW: { translationKey: "REVIEW", tone: "gold" },
  CLOSED: { translationKey: "CLOSED", tone: "neutral" },
};

export function getContractStatusPresentation(
  status: ContractStatus,
): ContractStatusPresentation {
  return PRESENTATION[status];
}
