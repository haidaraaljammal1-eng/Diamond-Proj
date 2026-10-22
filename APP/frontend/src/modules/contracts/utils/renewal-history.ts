import type { DateTimeFormatOptions } from "use-intl";
import type { ContractRenewalDto } from "../types/contract.types";
import type { RentalDuration } from "./format-rental-duration";

export type RenewalCollectionState = NonNullable<ContractRenewalDto["collectionState"]>;

export const RENEWAL_DATE_TIME_FORMAT: DateTimeFormatOptions = {
  dateStyle: "medium",
  timeStyle: "short",
};

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

/** Authoritative stored duration; falls back to legacy additionalDays as days. */
export function renewalStoredDuration(renewal: ContractRenewalDto): RentalDuration {
  const value = renewal.additionalDurationValue ?? renewal.additionalDays;
  const unit = renewal.additionalDurationUnit === "HOUR" ? "HOUR" : "DAY";
  return { durationValue: value, durationUnit: unit };
}

export function renewalDurationUnitLabelKey(
  renewal: ContractRenewalDto,
): "detail.renewalDurationUnitHours" | "detail.renewalDurationUnitDays" {
  return renewalStoredDuration(renewal).durationUnit === "HOUR"
    ? "detail.renewalDurationUnitHours"
    : "detail.renewalDurationUnitDays";
}

export function compareRenewalsChronological(
  a: ContractRenewalDto,
  b: ContractRenewalDto,
): number {
  const prevDiff =
    new Date(a.previousEndAt).getTime() - new Date(b.previousEndAt).getTime();
  if (prevDiff !== 0) return prevDiff;
  return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
}

export function sortRenewalsChronologically(
  renewals: ContractRenewalDto[],
): ContractRenewalDto[] {
  return [...renewals].sort(compareRenewalsChronological);
}

export function isFirstChronologicalRenewal(
  renewals: ContractRenewalDto[],
  renewalId: string,
): boolean {
  const sorted = sortRenewalsChronologically(renewals);
  return sorted[0]?.id === renewalId;
}

export function renewalStartSourceLabelKey(
  renewals: ContractRenewalDto[],
  renewalId: string,
): "detail.renewalStartFromOriginalContract" | "detail.renewalStartFromPriorExtension" {
  return isFirstChronologicalRenewal(renewals, renewalId)
    ? "detail.renewalStartFromOriginalContract"
    : "detail.renewalStartFromPriorExtension";
}

/** Stable semantic endpoints for timeline UI (previous = start, new = end). */
export function renewalTimelineEndpoints(
  renewal: Pick<ContractRenewalDto, "previousEndAt" | "newEndAt">,
): {
  startAt: string;
  endAt: string;
} {
  return { startAt: renewal.previousEndAt, endAt: renewal.newEndAt };
}
