import type { PublicReturnStatus } from "../types/public-return.types";

export function isReturnReceivedStatus(status: PublicReturnStatus): boolean {
  return status === "REVIEW" || status === "CLOSED";
}
