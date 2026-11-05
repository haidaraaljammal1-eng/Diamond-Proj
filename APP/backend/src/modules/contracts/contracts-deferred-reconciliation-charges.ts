import type { PrismaClient } from "@prisma/client";
import type { Tx } from "src/lib/db/transaction";
import { STAFF_MANUAL_SOURCE_KEY } from "src/modules/road-liabilities/road-liability.constants";

type Db = PrismaClient | Tx;

export type ContractDeferredReconciliationChargeRead = {
  id: string;
  type: "RTA_VIOLATION" | "SALIK_TOLL" | "SALIK_VIOLATION";
  referenceNumber: string;
  amount: number;
  currency: string;
  createdAt: Date;
  attachedToReconciliation: boolean;
};

/** Staff-deferred liabilities on a contract destined for final reconciliation (not post-close / direct cash). */
export async function listContractDeferredReconciliationCharges(
  db: Db,
  contractId: string,
): Promise<ContractDeferredReconciliationChargeRead[]> {
  const rows = await db.roadLiability.findMany({
    where: {
      attributedContractId: contractId,
      authoritativeSourceKey: STAFF_MANUAL_SOURCE_KEY,
      collectionStatus: { not: "SETTLED" },
      OR: [
        { customerCharge: { is: null } },
        {
          customerCharge: {
            is: {
              destinationType: "RECONCILIATION",
              operationalState: { not: "PAID" },
            },
          },
        },
      ],
      NOT: {
        customerCharge: {
          is: {
            destinationType: { in: ["POST_CLOSE_RECEIVABLE", "DIRECT_COLLECTION"] },
          },
        },
      },
    },
    orderBy: [{ staffEnteredAt: "asc" }, { createdAt: "asc" }],
    select: {
      id: true,
      type: true,
      amount: true,
      currency: true,
      staffEnteredAt: true,
      createdAt: true,
      authoritativeExternalReference: true,
      staffChargeDescription: true,
      customerCharge: {
        select: {
          destinationType: true,
          customerChargeAmount: true,
          reconciliationLineId: true,
        },
      },
    },
  });

  return rows.map((row) => {
    const referenceNumber =
      row.authoritativeExternalReference?.trim() ||
      row.staffChargeDescription?.trim() ||
      row.id;
    const amount = row.customerCharge?.customerChargeAmount ?? row.amount ?? 0;
    const attachedToReconciliation =
      row.customerCharge?.destinationType === "RECONCILIATION" &&
      Boolean(row.customerCharge.reconciliationLineId);
    return {
      id: row.id,
      type: row.type,
      referenceNumber,
      amount,
      currency: row.currency ?? "AED",
      createdAt: row.staffEnteredAt ?? row.createdAt,
      attachedToReconciliation,
    };
  });
}
