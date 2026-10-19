import type { ContractStatus } from "@prisma/client";
import type { Tx } from "src/lib/db/transaction";
import { writeOutboxEvent } from "src/lib/db/outbox";
import { INVOICE_OUTBOX_ROAD_LIABILITY_CHARGE } from "src/modules/invoices/invoices.constants";
import { contractError } from "src/modules/contracts/contracts.errors";
import {
  deriveCustomerChargeAdjustment,
  mapRoadLiabilityTypeToReconLineType,
  reconciliationTotalsFromLines,
  ROAD_LIABILITY_RECON_SOURCE_DOMAIN,
  roadLiabilityReconDescription,
} from "src/modules/contracts/contracts-road-liability-charge";

export type PersistRoadLiabilityChargeInput = {
  liability: {
    id: string;
    type: "RTA_VIOLATION" | "SALIK_TOLL" | "SALIK_VIOLATION";
    amount: number;
    attributedContractId: string;
    authoritativeExternalReference: string | null;
  };
  contract: {
    id: string;
    status: ContractStatus;
    reconciliation: { id: string; finalizedAt: Date | null } | null;
    carIn: { id: string } | null;
  };
  destination: "RECONCILIATION" | "POST_CLOSE_RECEIVABLE";
  derived: Extract<ReturnType<typeof deriveCustomerChargeAdjustment>, { ok: true }>;
  adjustmentNote: string | null;
  actorUserId: number;
};

export async function persistRoadLiabilityCustomerChargeInTx(
  tx: Tx,
  input: PersistRoadLiabilityChargeInput,
): Promise<string> {
  const now = new Date();
  const charge = await tx.roadLiabilityCustomerCharge.create({
    data: {
      roadLiabilityId: input.liability.id,
      contractId: input.contract.id,
      destinationType: input.destination,
      officialAmountSnapshot: input.derived.officialAmount,
      customerChargeAmount: input.derived.customerChargeAmount,
      adjustmentAmount: input.derived.adjustmentAmount,
      adjustmentReason: input.derived.adjustmentReason,
      adjustmentNote: input.adjustmentNote,
      confirmedByUserId: input.actorUserId,
      confirmedAt: now,
    },
  });

  if (input.destination === "RECONCILIATION") {
    if (!input.contract.carIn) throw contractError.carInRequired();
    let reconciliationId = input.contract.reconciliation?.id;
    if (!reconciliationId) {
      const created = await tx.contractReconciliation.create({
        data: {
          contractId: input.contract.id,
          chargesTotal: 0,
          depositAmount: 0,
          deductions: 0,
          finalAmount: 0,
        },
      });
      reconciliationId = created.id;
    }
    const line = await tx.contractReconciliationLine.create({
      data: {
        reconciliationId,
        type: mapRoadLiabilityTypeToReconLineType(input.liability.type),
        description: roadLiabilityReconDescription(input.liability.type),
        amount: input.derived.customerChargeAmount,
        externalReference: input.liability.authoritativeExternalReference,
        sourceDomain: ROAD_LIABILITY_RECON_SOURCE_DOMAIN,
        roadLiabilityId: input.liability.id,
        officialAmountSnapshot: input.derived.officialAmount,
        adjustmentAmount: input.derived.adjustmentAmount,
        adjustmentReason: input.derived.adjustmentReason,
        adjustmentNote: input.adjustmentNote,
        confirmedByUserId: input.actorUserId,
        confirmedAt: now,
      },
    });
    await tx.roadLiabilityCustomerCharge.update({
      where: { id: charge.id },
      data: { reconciliationLineId: line.id },
    });
    const allLines = await tx.contractReconciliationLine.findMany({ where: { reconciliationId } });
    await tx.contractReconciliation.update({
      where: { id: reconciliationId },
      data: {
        ...reconciliationTotalsFromLines(allLines),
        depositAmount: 0,
        deductions: 0,
      },
    });
    await writeOutboxEvent(tx, {
      eventType: INVOICE_OUTBOX_ROAD_LIABILITY_CHARGE,
      aggregateType: "road_liability_customer_charge",
      aggregateId: charge.id,
      dedupeKey: `${INVOICE_OUTBOX_ROAD_LIABILITY_CHARGE}:${charge.id}`,
      payload: { customerChargeId: charge.id, contractId: input.contract.id },
    });
    return charge.id;
  }

  await tx.contractPostCloseReceivable.create({
    data: {
      contractId: input.contract.id,
      customerChargeId: charge.id,
      roadLiabilityId: input.liability.id,
      amount: input.derived.customerChargeAmount,
      currency: "AED",
      status: "OPEN",
    },
  });
  await writeOutboxEvent(tx, {
    eventType: INVOICE_OUTBOX_ROAD_LIABILITY_CHARGE,
    aggregateType: "road_liability_customer_charge",
    aggregateId: charge.id,
    dedupeKey: `${INVOICE_OUTBOX_ROAD_LIABILITY_CHARGE}:${charge.id}`,
    payload: { customerChargeId: charge.id, contractId: input.contract.id },
  });
  return charge.id;
}
