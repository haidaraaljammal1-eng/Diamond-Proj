import type { ContractStatus } from "../types/contract.types";

export type TimelineStepKey =
  | "offer"
  | "form"
  | "signed"
  | "paid"
  | "carOut"
  | "return"
  | "review"
  | "closed";

export type TimelineStepState = "done" | "current" | "upcoming";

export interface ContractTimelineStep {
  key: TimelineStepKey;
  state: TimelineStepState;
}

const STEPS: readonly TimelineStepKey[] = [
  "offer",
  "form",
  "signed",
  "paid",
  "carOut",
  "return",
  "review",
  "closed",
];

const STATUS_INDEX: Record<ContractStatus, number> = {
  AWAITING: 0,
  FORM: 1,
  SIGNED: 2,
  PAID: 3,
  ACTIVE: 4,
  RETOUT: 5,
  REVIEW: 6,
  CLOSED: 7,
};

/** Timeline is derived from Backend `contract.status` only. */
export function getContractTimeline(status: ContractStatus): ContractTimelineStep[] {
  const current = STATUS_INDEX[status];
  return STEPS.map((key, index) => {
    let state: TimelineStepState = "upcoming";
    if (index < current) state = "done";
    else if (index === current) state = "current";
    return { key, state };
  });
}
