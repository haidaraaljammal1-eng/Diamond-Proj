export type RenewalHistoryState = "pending" | "confirmed";

export function renewalHistoryState(approvedAt: string | null): RenewalHistoryState {
  return approvedAt ? "confirmed" : "pending";
}
