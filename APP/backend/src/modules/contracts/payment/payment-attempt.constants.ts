import type { ContractPaymentAttemptStatus } from "@prisma/client";

/** Attempt statuses that may still produce or return a Checkout Session. */
export const ACTIVE_CHECKOUT_ATTEMPT_STATUSES: ContractPaymentAttemptStatus[] = [
  "PREPARING",
  "RECOVERING",
  "READY",
];

export const TERMINAL_CHECKOUT_ATTEMPT_STATUSES: ContractPaymentAttemptStatus[] = [
  "COMPLETED",
  "FAILED",
  "EXPIRED",
  "CANCELLED",
  "SUPERSEDED",
];
