import type { Tx } from "src/lib/db/transaction";
import { invoiceSequenceNotConfiguredError } from "src/modules/invoices/invoices.errors";

/**
 * Allocates the next invoice number for a company inside the current transaction.
 * Requires a configured InvoiceNumberSequence row (production must set starting values explicitly).
 */
export async function allocateInvoiceNumber(tx: Tx, companyId: number): Promise<number> {
  // One atomic UPDATE serializes concurrent issuers on the sequence row.
  // RETURNING is the value after the increment, so the assigned number is one less.
  const rows = await tx.$queryRaw<Array<{ nextNumber: number }>>`
    UPDATE "invoice_number_sequences"
    SET "nextNumber" = "nextNumber" + 1,
        "updatedAt" = CURRENT_TIMESTAMP
    WHERE "companyId" = ${companyId}
    RETURNING "nextNumber"
  `;
  const updated = rows[0]?.nextNumber;
  if (updated == null) throw invoiceSequenceNotConfiguredError();
  const assigned = Number(updated) - 1;
  if (!Number.isInteger(assigned) || assigned < 1) throw invoiceSequenceNotConfiguredError();
  return assigned;
}

/** Test/dev helper — not exposed on staff routes. */
export async function configureInvoiceNumberSequence(
  tx: Tx,
  companyId: number,
  nextNumber: number,
): Promise<void> {
  if (!Number.isInteger(nextNumber) || nextNumber < 1) {
    throw new Error("nextNumber must be a positive integer");
  }
  await tx.invoiceNumberSequence.upsert({
    where: { companyId },
    create: { companyId, nextNumber, configuredAt: new Date() },
    update: { nextNumber, configuredAt: new Date() },
  });
}
