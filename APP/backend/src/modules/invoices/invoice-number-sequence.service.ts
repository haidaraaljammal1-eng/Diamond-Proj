import type { Tx } from "src/lib/db/transaction";
import { invoiceSequenceNotConfiguredError } from "src/modules/invoices/invoices.errors";

/**
 * Allocates the next invoice number for a company inside the current transaction.
 * Requires a configured InvoiceNumberSequence row (production must set starting values explicitly).
 */
export async function allocateInvoiceNumber(tx: Tx, companyId: number): Promise<number> {
  const seq = await tx.invoiceNumberSequence.findUnique({ where: { companyId } });
  if (!seq) throw invoiceSequenceNotConfiguredError();
  const assigned = seq.nextNumber;
  await tx.invoiceNumberSequence.update({
    where: { companyId },
    data: { nextNumber: assigned + 1 },
  });
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
