import type { Tx } from "src/lib/db/transaction";
import { writeOutboxEvent } from "src/lib/db/outbox";
import { INVOICE_OUTBOX_ROAD_LIABILITY_CHARGE } from "src/modules/invoices/invoices.constants";

/** Schedule exactly-once road-liability invoice issuance after trusted payment confirmation. */
export async function enqueueRoadLiabilityInvoiceOutbox(
  tx: Tx,
  customerChargeId: string,
  contractId: string,
): Promise<void> {
  await writeOutboxEvent(tx, {
    eventType: INVOICE_OUTBOX_ROAD_LIABILITY_CHARGE,
    aggregateType: "road_liability_customer_charge",
    aggregateId: customerChargeId,
    dedupeKey: `${INVOICE_OUTBOX_ROAD_LIABILITY_CHARGE}:${customerChargeId}`,
    payload: { customerChargeId, contractId },
  });
}
