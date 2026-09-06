import type { ChipTone } from "@/shared/components/ui/chip";
import type { ContractStatus } from "../types/dashboard.types.ts";

export interface ContractStatusPresentation {
  /** Key under the `Dashboard.status` message namespace. */
  translationKey: ContractStatus;
  tone: ChipTone;
}

/** Demo `ST` — label key + chip tone per contract status. */
const PRESENTATION: Record<ContractStatus, ContractStatusPresentation> = {
  awaiting: { translationKey: "awaiting", tone: "warn" },
  form: { translationKey: "form", tone: "warn" },
  signed: { translationKey: "signed", tone: "gold" },
  paid: { translationKey: "paid", tone: "ok" },
  active: { translationKey: "active", tone: "ok" },
  retout: { translationKey: "retout", tone: "warn" },
  review: { translationKey: "review", tone: "gold" },
  closed: { translationKey: "closed", tone: "neutral" },
};

export function contractStatusPresentation(
  status: ContractStatus,
): ContractStatusPresentation {
  return PRESENTATION[status];
}
