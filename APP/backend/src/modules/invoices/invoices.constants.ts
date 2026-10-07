/** Approved initial per-company sequence (first issued number = this value). */
export const APPROVED_INVOICE_SEQUENCE_START = 1100;

export const INVOICE_TEMPLATE_VERSION = "v1";

export const INVOICE_TERMS_NET_30 = "Net 30";

export const INVOICE_CURRENCY = "AED";

/** Outbox event types consumed by the invoice issuance worker. */
export const INVOICE_OUTBOX_EVENT_TYPES = [
  "contract.signed",
  "reconciliation.finalized",
  "road_liability.customer_charge.confirmed",
] as const;

export type InvoiceOutboxEventType = (typeof INVOICE_OUTBOX_EVENT_TYPES)[number];

export const INVOICE_OUTBOX_RECONCILIATION_FINALIZED = "reconciliation.finalized";
export const INVOICE_OUTBOX_ROAD_LIABILITY_CHARGE = "road_liability.customer_charge.confirmed";

export function rentalInvoiceOriginKey(contractId: string): string {
  return `RENTAL:${contractId}`;
}

export function roadLiabilityInvoiceOriginKey(customerChargeId: string): string {
  return `ROAD_LIABILITY:${customerChargeId}`;
}

export function reconciliationLineInvoiceOriginKey(reconciliationLineId: string): string {
  return `RECONCILIATION_LINE:${reconciliationLineId}`;
}
