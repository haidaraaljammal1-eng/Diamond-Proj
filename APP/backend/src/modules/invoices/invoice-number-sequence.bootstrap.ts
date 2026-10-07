import type { PrismaClient } from "@prisma/client";
import { APPROVED_INVOICE_SEQUENCE_START } from "src/modules/invoices/invoices.constants";

/** Per-company next allocator value when seeding a missing sequence row. */
export function safeInvoiceSequenceNextNumber(maxExistingInvoiceNumber: number | null): number {
  const max = maxExistingInvoiceNumber ?? 0;
  if (max < APPROVED_INVOICE_SEQUENCE_START) {
    return APPROVED_INVOICE_SEQUENCE_START;
  }
  return max + 1;
}

export type InvoiceSequenceBootstrapResult = {
  companyCode: string;
  companyId: number;
  action: "created" | "aligned_dev" | "unchanged" | "human_review_required";
  nextNumber: number;
  issuedInvoices: number;
};

/**
 * Idempotent development bootstrap for per-company invoice sequences.
 * Does not hard-code business logic elsewhere — only seeds/configuration rows.
 */
export async function ensureDevelopmentInvoiceNumberSequences(
  prisma: PrismaClient,
): Promise<InvoiceSequenceBootstrapResult[]> {
  const companies = await prisma.operatingCompany.findMany({
    where: { code: { in: ["ELITE", "UNIQUE"] } },
    select: { id: true, code: true },
  });

  const results: InvoiceSequenceBootstrapResult[] = [];

  for (const company of companies) {
    const issuedInvoices = await prisma.invoice.count({ where: { companyId: company.id } });
    const existing = await prisma.invoiceNumberSequence.findUnique({
      where: { companyId: company.id },
    });

    if (!existing) {
      const maxIssued = await prisma.invoice.aggregate({
        where: { companyId: company.id },
        _max: { invoiceNumber: true },
      });
      const nextNumber = safeInvoiceSequenceNextNumber(maxIssued._max.invoiceNumber);
      await prisma.invoiceNumberSequence.create({
        data: {
          companyId: company.id,
          nextNumber,
          configuredAt: new Date(),
        },
      });
      results.push({
        companyCode: company.code,
        companyId: company.id,
        action: "created",
        nextNumber,
        issuedInvoices,
      });
      continue;
    }

    if (issuedInvoices > 0) {
      const maxIssued = await prisma.invoice.aggregate({
        where: { companyId: company.id },
        _max: { invoiceNumber: true },
      });
      const floor = (maxIssued._max.invoiceNumber ?? 0) + 1;
      if (existing.nextNumber < floor) {
        results.push({
          companyCode: company.code,
          companyId: company.id,
          action: "human_review_required",
          nextNumber: existing.nextNumber,
          issuedInvoices,
        });
      } else {
        results.push({
          companyCode: company.code,
          companyId: company.id,
          action: "unchanged",
          nextNumber: existing.nextNumber,
          issuedInvoices,
        });
      }
      continue;
    }

    if (existing.nextNumber !== APPROVED_INVOICE_SEQUENCE_START) {
      await prisma.invoiceNumberSequence.update({
        where: { companyId: company.id },
        data: {
          nextNumber: APPROVED_INVOICE_SEQUENCE_START,
          configuredAt: new Date(),
        },
      });
      results.push({
        companyCode: company.code,
        companyId: company.id,
        action: "aligned_dev",
        nextNumber: APPROVED_INVOICE_SEQUENCE_START,
        issuedInvoices,
      });
    } else {
      results.push({
        companyCode: company.code,
        companyId: company.id,
        action: "unchanged",
        nextNumber: existing.nextNumber,
        issuedInvoices,
      });
    }
  }

  return results;
}
