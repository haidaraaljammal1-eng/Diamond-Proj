import type { ContractRenewalDto } from "../types/contract.types";

export type RenewalCollectionState = NonNullable<ContractRenewalDto["collectionState"]>;

export function renewalCollectionState(renewal: ContractRenewalDto): RenewalCollectionState {
  if (renewal.collectionState) return renewal.collectionState;
  if (renewal.additionalAmount <= 0) {
    return renewal.appliedAt ? "COMPLETED_NO_CHARGE" : "PENDING";
  }
  if (renewal.settledPaymentId) return "PAID";
  if (renewal.appliedAt) return "OFFICE_UNPAID";
  if (renewal.approvedAt) return "AWAITING_PAYMENT";
  return "PENDING";
}

export function renewalHistoryLabelKey(state: RenewalCollectionState): string {
  return `detail.renewalCollectionState.${state}`;
}
