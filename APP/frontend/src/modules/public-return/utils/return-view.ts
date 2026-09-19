import type { PublicReturnStatus } from "../types/public-return.types";

export function isReturnReceivedStatus(status: PublicReturnStatus): boolean {
  return status === "REVIEW" || status === "CLOSED";
}

/** Only an ACTIVE contract can still be returned (or, instead, renewed by the office). */
export function canConfirmReturn(status: PublicReturnStatus): boolean {
  return status === "ACTIVE";
}

export function isReturnConfirmedStatus(status: PublicReturnStatus): boolean {
  return status === "RETOUT";
}
