import type { Tx } from "src/lib/db/transaction";
import { contractError } from "src/modules/contracts/contracts.errors";
import { listPendingRoadLiabilities } from "src/modules/contracts/contracts-reconciliation";
import { deriveCustomerChargeAdjustment } from "src/modules/contracts/contracts-road-liability-charge";
import { isChargeableRoadLiability } from "src/modules/road-liabilities/road-liability.mapper";
import { persistRoadLiabilityCustomerChargeInTx } from "src/modules/road-liabilities/road-liability-customer-charge.persist";

/**
 * When a contract enters REVIEW, attach every pending chargeable road liability
 * (including staff-deferred registrations) to editable reconciliation exactly once.
 */
export async function attachPendingRoadLiabilitiesForReconciliationInTx(
  tx: Tx,
  contractId: string,
  actorUserId: number,
): Promise<number> {
  const contract = await tx.contract.findUnique({
    where: { id: contractId },
    include: {
      carIn: { select: { id: true } },
      reconciliation: { select: { id: true, finalizedAt: true, settledAt: true } },
    },
  });
  if (!contract) throw contractError.notFound();
  if (contract.status !== "REVIEW" || !contract.carIn) return 0;
  if (contract.reconciliation?.finalizedAt || contract.reconciliation?.settledAt) return 0;

  const pending = await listPendingRoadLiabilities(tx, contractId);
  let attached = 0;

  for (const row of pending) {
    const liability = await tx.roadLiability.findUnique({ where: { id: row.id } });
    if (!liability || !isChargeableRoadLiability(liability) || liability.amount == null) continue;
    if (liability.attributedContractId !== contractId) continue;

    const existing = await tx.roadLiabilityCustomerCharge.findUnique({
      where: { roadLiabilityId: liability.id },
    });
    if (existing) continue;

    const derived = deriveCustomerChargeAdjustment({
      officialAmount: liability.amount,
      customerChargeAmount: liability.amount,
    });
    if (!derived.ok) continue;

    await persistRoadLiabilityCustomerChargeInTx(tx, {
      liability: {
        id: liability.id,
        type: liability.type,
        amount: liability.amount,
        attributedContractId: contractId,
        authoritativeExternalReference: liability.authoritativeExternalReference,
      },
      contract: {
        id: contract.id,
        status: contract.status,
        reconciliation: contract.reconciliation,
        carIn: contract.carIn,
      },
      destination: "RECONCILIATION",
      derived,
      adjustmentNote: null,
      actorUserId,
    });
    attached += 1;
  }

  return attached;
}
