import type { FastifyInstance } from "fastify";
import type { ContractStatus, Invoice, OperatingCompany, Prisma } from "@prisma/client";
import { withTransaction, type Tx } from "src/lib/db/transaction";
import { isUniqueViolation } from "src/lib/db/prisma-error";
import { invoiceBrandingForCompany } from "src/modules/invoices/invoice-company-branding";
import {
  deriveRentalQuantityAndRate,
  addCalendarDaysUtc,
  formatInvoiceDateDdMmYyyy,
  toUtcDateOnly,
} from "src/modules/invoices/invoice-money";
import {
  reconciliationLineToInvoiceLineType,
  reconciliationServiceLabel,
  roadLiabilityServiceLabel,
  roadLiabilityToInvoiceLineType,
} from "src/modules/invoices/invoice-line-labels";
import { allocateInvoiceNumber } from "src/modules/invoices/invoice-number-sequence.service";
import {
  INVOICE_CURRENCY,
  INVOICE_TEMPLATE_VERSION,
  INVOICE_TERMS_NET_30,
  INVOICE_TERMS_PAID_IN_FULL,
  rentalInvoiceOriginKey,
  reconciliationLineInvoiceOriginKey,
  roadLiabilityInvoiceOriginKey,
} from "src/modules/invoices/invoices.constants";
import {
  invoiceCustomerPhoneMissingError,
  invoiceDuplicateSourceError,
  invoiceNotFoundError,
  invoiceSourceIncompleteError,
} from "src/modules/invoices/invoices.errors";
import { auditInvoiceIssued } from "src/modules/invoices/invoice-audit";

const CONTRACT_FOR_INVOICE = {
  include: {
    company: true,
    customer: true,
    vehicle: true,
  },
} as const;

async function loadExistingByOrigin(tx: Tx, originEventKey: string): Promise<Invoice | null> {
  return tx.invoice.findUnique({ where: { originEventKey } });
}

async function createIssuedInvoice(
  tx: Tx,
  input: {
    invoiceType: Prisma.InvoiceCreateInput["invoiceType"];
    originEventKey: string;
    companyId: number;
    contractId: string;
    vehicleId: number;
    customerId: number;
    customerName: string;
    contractNumber: string;
    vehicleName: string;
    plateNumber: string;
    company: OperatingCompany;
    lines: Array<{
      lineType: Prisma.InvoiceLineCreateWithoutInvoiceInput["lineType"];
      serviceLabel: string;
      description: string;
      quantity: number;
      unitRate: number;
      amount: number;
      sourceType: Prisma.InvoiceLineCreateWithoutInvoiceInput["sourceType"];
      sourceId: string;
    }>;
    issuedByUserId?: number | null;
    rentalCollectedInFull?: boolean;
  },
): Promise<Invoice> {
  const branding = invoiceBrandingForCompany(input.company);
  const issueDate = toUtcDateOnly(new Date());
  const collectedInFull = input.rentalCollectedInFull === true;
  const dueDate = collectedInFull ? issueDate : addCalendarDaysUtc(issueDate, 30);
  const totalAmount = input.lines.reduce((sum, line) => sum + line.amount, 0);
  if (totalAmount <= 0) throw invoiceSourceIncompleteError("Invoice total must be positive");

  const invoiceNumber = await allocateInvoiceNumber(tx, input.companyId);

  try {
    const created = await tx.invoice.create({
      data: {
        invoiceNumber,
        invoiceType: input.invoiceType,
        status: "ISSUED",
        companyId: input.companyId,
        contractId: input.contractId,
        vehicleId: input.vehicleId,
        customerId: input.customerId,
        issueDate,
        dueDate,
        termsSnapshot: collectedInFull ? INVOICE_TERMS_PAID_IN_FULL : INVOICE_TERMS_NET_30,
        currency: INVOICE_CURRENCY,
        customerNameSnapshot: input.customerName.trim(),
        contractNumberSnapshot: input.contractNumber,
        vehicleNameSnapshot: input.vehicleName,
        plateNumberSnapshot: input.plateNumber,
        companyDisplayNameSnapshot: branding.legalHeaderEn,
        companyAddressSnapshot: branding.addressLine,
        companyEmailSnapshot: branding.email,
        companyBrandKeySnapshot: branding.brandKey,
        subtotalAmount: totalAmount,
        totalAmount,
        balanceDueSnapshot: collectedInFull ? 0 : totalAmount,
        templateVersion: INVOICE_TEMPLATE_VERSION,
        originEventKey: input.originEventKey,
        issuedByUserId: input.issuedByUserId ?? null,
        lines: {
          create: input.lines.map((line, index) => ({
            position: index + 1,
            lineType: line.lineType,
            serviceLabel: line.serviceLabel,
            description: line.description,
            quantity: line.quantity,
            unitRate: line.unitRate,
            amount: line.amount,
            sourceType: line.sourceType,
            sourceId: line.sourceId,
          })),
        },
      },
      include: { lines: true },
    });
    await auditInvoiceIssued(tx, created, {
      originEventKey: input.originEventKey,
      sourceTypes: input.lines.map((line) => line.sourceType),
    });
    return created;
  } catch (err) {
    if (isUniqueViolation(err)) {
      const existing = await loadExistingByOrigin(tx, input.originEventKey);
      if (existing) return existing;
      throw invoiceDuplicateSourceError();
    }
    throw err;
  }
}

function requireCustomerName(name: string | null | undefined): string {
  const trimmed = name?.trim();
  if (!trimmed) throw invoiceSourceIncompleteError("Customer name is required to issue an invoice");
  return trimmed;
}

const RENTAL_INVOICE_ELIGIBLE_STATUSES: ContractStatus[] = [
  "PAID",
  "ACTIVE",
  "RETOUT",
  "REVIEW",
  "CLOSED",
];

/** Guard for RENTAL invoice issuance — exported for unit tests. */
export async function assertRentalInvoicePaymentConfirmed(
  tx: Tx,
  contract: { id: string; status: ContractStatus; agreedAmount: number },
): Promise<void> {
  if (!RENTAL_INVOICE_ELIGIBLE_STATUSES.includes(contract.status)) {
    throw invoiceSourceIncompleteError("Rental invoice requires a paid contract");
  }
  const payment = await tx.contractPayment.findFirst({
    where: {
      contractId: contract.id,
      purpose: "RENTAL",
      status: "CONFIRMED",
    },
    orderBy: { confirmedAt: "desc" },
  });
  if (!payment) {
    throw invoiceSourceIncompleteError("Confirmed RENTAL payment is required before issuing invoice");
  }
  if (payment.amount !== contract.agreedAmount) {
    throw invoiceSourceIncompleteError("Confirmed payment amount does not match contract agreed amount");
  }
}

function vehicleLabel(vehicle: { vehicleName: string | null; plateNumber: string | null }): {
  vehicleName: string;
  plateNumber: string;
} {
  return {
    vehicleName: vehicle.vehicleName?.trim() || "Vehicle",
    plateNumber: vehicle.plateNumber?.trim() || "—",
  };
}

async function consolidationService(fastify: FastifyInstance) {
  const { createContractInvoiceConsolidationService } = await import(
    "src/modules/invoices/contract-invoice-consolidation.service"
  );
  return createContractInvoiceConsolidationService(fastify);
}

export function createInvoiceIssuanceService(fastify: FastifyInstance) {
  const prisma = fastify.prisma;

  return {
    async ensureRentalInvoiceForContract(contractId: string, issuedByUserId?: number | null) {
      return (await consolidationService(fastify)).ensureConsolidatedContractInvoice(
        contractId,
        issuedByUserId,
      );
    },

    async ensureRoadLiabilityInvoiceForCustomerCharge(customerChargeId: string) {
      const simulatedFailId = process.env.INVOICE_ISSUANCE_INTEGRATION_FAIL_ONCE_CHARGE_ID;
      if (simulatedFailId && simulatedFailId === customerChargeId) {
        delete process.env.INVOICE_ISSUANCE_INTEGRATION_FAIL_ONCE_CHARGE_ID;
        throw new Error("INVOICE_ISSUANCE_INTEGRATION_SIMULATED_FAILURE");
      }
      const charge = await prisma.roadLiabilityCustomerCharge.findUnique({
        where: { id: customerChargeId },
        select: { contractId: true },
      });
      if (!charge) throw invoiceSourceIncompleteError("Road liability customer charge not found");
      return (await consolidationService(fastify)).ensureConsolidatedContractInvoice(charge.contractId);
    },

    async ensureReconciliationInvoicesForReconciliation(reconciliationId: string) {
      const reconciliation = await prisma.contractReconciliation.findUnique({
        where: { id: reconciliationId },
        select: { contractId: true },
      });
      if (!reconciliation) throw invoiceSourceIncompleteError("Reconciliation not found");
      const invoice = await (await consolidationService(fastify)).ensureConsolidatedContractInvoice(
        reconciliation.contractId,
      );
      return [invoice];
    },

    async getById(id: string) {
      const row = await prisma.invoice.findUnique({
        where: { id },
        include: {
          lines: { orderBy: { position: "asc" } },
          company: { select: { id: true, code: true, displayName: true } },
          deliveries: { orderBy: { createdAt: "desc" }, take: 5 },
        },
      });
      if (!row) throw invoiceNotFoundError();
      return row;
    },

    resolveCustomerPhone(customerId: number): Promise<string> {
      return prisma.customer
        .findUnique({ where: { id: customerId }, select: { mobile: true, name: true } })
        .then((row) => {
          const phone = row?.mobile?.trim();
          if (!phone) throw invoiceCustomerPhoneMissingError();
          return phone;
        });
    },
  };
}
