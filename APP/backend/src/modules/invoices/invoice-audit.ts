import { Prisma, type Invoice } from "@prisma/client";
import type { Tx } from "src/lib/db/transaction";

export async function auditInvoiceIssued(
  tx: Tx,
  invoice: Invoice,
  input: { originEventKey: string; sourceTypes: string[] },
): Promise<void> {
  const metadata: Prisma.InputJsonObject = {
    invoiceNumber: invoice.invoiceNumber,
    companyId: invoice.companyId,
    contractId: invoice.contractId,
    invoiceType: invoice.invoiceType,
    originEventKey: input.originEventKey,
    sourceTypes: input.sourceTypes,
    totalAmount: invoice.totalAmount,
  };

  await tx.auditLog.create({
    data: {
      actorUserId: invoice.issuedByUserId,
      action: "INVOICE_ISSUED",
      entityType: "invoice",
      entityId: invoice.id,
      metadata,
      before: Prisma.JsonNull,
      after: Prisma.JsonNull,
    },
  });
}
