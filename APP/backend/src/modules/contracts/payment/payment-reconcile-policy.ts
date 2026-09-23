import type { ContractPayment, ContractPaymentStatus } from "@prisma/client";

/** Minimum interval between provider status lookups for the same in-flight payment. */
export const PAYMENT_PROVIDER_RECONCILE_COOLDOWN_MS = 30_000;

const lastProviderReconcileAt = new Map<string, number>();

export type ReconcileCandidate = Pick<
  ContractPayment,
  | "id"
  | "status"
  | "providerReference"
  | "checkoutExpiresAt"
  | "processingStartedAt"
  | "failedAt"
  | "confirmedAt"
>;

/**
 * DB-first reads must not fan out to Stripe on every rental reload.
 * Reconcile only unresolved in-flight payments, with a per-payment cooldown.
 */
export function shouldReconcilePaymentWithProvider(
  payment: ReconcileCandidate,
  now = Date.now(),
): boolean {
  if (!payment.providerReference) return false;
  if (payment.confirmedAt || payment.failedAt) return false;
  if (payment.status !== "PENDING" && payment.status !== "PROCESSING") return false;

  const last = lastProviderReconcileAt.get(payment.id);
  if (last !== undefined && now - last < PAYMENT_PROVIDER_RECONCILE_COOLDOWN_MS) {
    return false;
  }

  return true;
}

export function markPaymentProviderReconciled(paymentId: string, now = Date.now()): void {
  lastProviderReconcileAt.set(paymentId, now);
}

export function resetPaymentProviderReconcileCooldown(): void {
  lastProviderReconcileAt.clear();
}

export function isTerminalPaymentStatus(status: ContractPaymentStatus): boolean {
  return status === "CONFIRMED" || status === "FAILED" || status === "CANCELLED";
}
