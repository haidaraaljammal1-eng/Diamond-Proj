import type { Tx } from "src/lib/db/transaction";
import { roadLiabilityCollectionError } from "src/modules/road-liabilities/road-liability-collection.errors";

/** Operational states that block a competing collection channel from starting. */
export const BLOCKING_OPERATIONAL_STATES = new Set([
  "PROCESSING",
  "REQUIRES_ACTION",
  "MANUAL_PENDING",
  "PAYMENT_LINK_READY",
]);

export function isBlockingOperationalState(state: string | null | undefined): boolean {
  return state != null && BLOCKING_OPERATIONAL_STATES.has(state);
}

export function assertChargeOpenForNewCollection(
  charge: { operationalState: string | null },
  options?: { allowPaymentLinkResume?: boolean; allowFailedRetry?: boolean },
): void {
  const state = charge.operationalState;
  if (state === "PAID") {
    throw roadLiabilityCollectionError.alreadySettled();
  }
  if (state === "FAILED" && options?.allowFailedRetry) {
    return;
  }
  if (state === "PAYMENT_LINK_READY" && options?.allowPaymentLinkResume) {
    return;
  }
  if (isBlockingOperationalState(state)) {
    throw roadLiabilityCollectionError.collectionInProgress();
  }
}

export async function assertNoActiveRoadLiabilityPayment(tx: Tx, chargeId: string): Promise<void> {
  const active = await tx.contractPayment.findFirst({
    where: {
      purpose: "ROAD_LIABILITY",
      targetId: chargeId,
      status: { in: ["PENDING", "PROCESSING"] },
    },
  });
  if (active) {
    throw roadLiabilityCollectionError.collectionInProgress();
  }
}
