import type { FastifyInstance } from "fastify";
import type { Invoice, OperatingCompany, Prisma } from "@prisma/client";
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
  },
): Promise<Invoice> {
  const branding = invoiceBrandingForCompany(input.company);
  const issueDate = toUtcDateOnly(new Date());
  const dueDate = addCalendarDaysUtc(issueDate, 30);
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
        termsSnapshot: INVOICE_TERMS_NET_30,
        currency: INVOICE_CURRENCY,
        customerNameSnapshot: input.customerName.trim(),
        contractNumberSnapshot: input.contractNumber,
        vehicleNameSnapshot: input.vehicleName,
        plateNumberSnapshot: input.plateNumber,
        companyDisplayNameSnapshot: branding.displayName,
        companyAddressSnapshot: branding.addressLine,
        companyEmailSnapshot: branding.email,
        companyBrandKeySnapshot: branding.brandKey,
        subtotalAmount: totalAmount,
        totalAmount,
        balanceDueSnapshot: totalAmount,
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

function vehicleLabel(vehicle: { vehicleName: string | null; plateNumber: string | null }): {
  vehicleName: string;
  plateNumber: string;
} {
  return {
    vehicleName: vehicle.vehicleName?.trim() || "Vehicle",
    plateNumber: vehicle.plateNumber?.trim() || "—",
  };
}

export function createInvoiceIssuanceService(fastify: FastifyInstance) {
  const prisma = fastify.prisma;

  return {
    async ensureRentalInvoiceForContract(contractId: string, issuedByUserId?: number | null) {
      const originEventKey = rentalInvoiceOriginKey(contractId);
      return withTransaction(prisma, async (tx) => {
        const existing = await loadExistingByOrigin(tx, originEventKey);
        if (existing) return existing;

        const contract = await tx.contract.findUnique({
          where: { id: contractId },
          ...CONTRACT_FOR_INVOICE,
        });
        if (!contract) throw invoiceNotFoundError();
        if (!contract.customerId || !contract.customer) {
          throw invoiceSourceIncompleteError("Contract customer is required for rental invoice");
        }

        const { vehicleName, plateNumber } = vehicleLabel(contract.vehicle);
        const branding = invoiceBrandingForCompany(contract.company);
        const rentalDate = contract.startAt ?? contract.activatedAt ?? new Date();
        const { quantity, unitRate } = deriveRentalQuantityAndRate({
          durationValue: contract.durationValue,
          durationUnit: contract.durationUnit,
          priceType: contract.priceType,
          agreedAmount: contract.agreedAmount,
        });

        const description = `Rental income from ${formatInvoiceDateDdMmYyyy(
          toUtcDateOnly(rentalDate),
        )}`;

        return createIssuedInvoice(tx, {
          invoiceType: "RENTAL",
          originEventKey,
          companyId: contract.companyId,
          contractId: contract.id,
          vehicleId: contract.vehicleId,
          customerId: contract.customerId,
          customerName: requireCustomerName(contract.customer.name),
          contractNumber: contract.contractNumber,
          vehicleName,
          plateNumber,
          company: contract.company,
          issuedByUserId,
          lines: [
            {
              lineType: "RENTAL",
              serviceLabel: branding.serviceLabelRental,
              description,
              quantity,
              unitRate,
              amount: contract.agreedAmount,
              sourceType: "CONTRACT_RENTAL",
              sourceId: contract.id,
            },
          ],
        });
      });
    },

    async ensureRoadLiabilityInvoiceForCustomerCharge(customerChargeId: string) {
      const originEventKey = roadLiabilityInvoiceOriginKey(customerChargeId);
      return withTransaction(prisma, async (tx) => {
        const existing = await loadExistingByOrigin(tx, originEventKey);
        if (existing) return existing;

        const charge = await tx.roadLiabilityCustomerCharge.findUnique({
          where: { id: customerChargeId },
          include: {
            roadLiability: true,
            contract: { include: { company: true, customer: true, vehicle: true } },
          },
        });
        if (!charge) throw invoiceSourceIncompleteError("Road liability customer charge not found");
        if (!charge.contract.customerId || !charge.contract.customer) {
          throw invoiceSourceIncompleteError("Contract customer is required");
        }

        const { vehicleName, plateNumber } = vehicleLabel(charge.contract.vehicle);
        const serviceLabel = roadLiabilityServiceLabel(charge.roadLiability.type);
        const description = `${serviceLabel} related to Contract ${charge.contract.contractNumber}`;

        return createIssuedInvoice(tx, {
          invoiceType: "ROAD_LIABILITY",
          originEventKey,
          companyId: charge.contract.companyId,
          contractId: charge.contract.id,
          vehicleId: charge.contract.vehicleId,
          customerId: charge.contract.customerId,
          customerName: requireCustomerName(charge.contract.customer.name),
          contractNumber: charge.contract.contractNumber,
          vehicleName,
          plateNumber,
          company: charge.contract.company,
          lines: [
            {
              lineType: roadLiabilityToInvoiceLineType(charge.roadLiability.type),
              serviceLabel,
              description,
              quantity: 1,
              unitRate: charge.customerChargeAmount,
              amount: charge.customerChargeAmount,
              sourceType: "ROAD_LIABILITY_CUSTOMER_CHARGE",
              sourceId: charge.id,
            },
          ],
        });
      });
    },

    async ensureReconciliationInvoicesForReconciliation(reconciliationId: string) {
      return withTransaction(prisma, async (tx) => {
        const reconciliation = await tx.contractReconciliation.findUnique({
          where: { id: reconciliationId },
          include: {
            contract: { include: { company: true, customer: true, vehicle: true } },
            lines: true,
          },
        });
        if (!reconciliation) throw invoiceSourceIncompleteError("Reconciliation not found");
        if (!reconciliation.finalizedAt && !reconciliation.approvedAt) {
          throw invoiceSourceIncompleteError("Reconciliation is not finalized");
        }
        if (!reconciliation.contract.customerId || !reconciliation.contract.customer) {
          throw invoiceSourceIncompleteError("Contract customer is required");
        }

        const created: Invoice[] = [];
        const { vehicleName, plateNumber } = vehicleLabel(reconciliation.contract.vehicle);
        const customerName = requireCustomerName(reconciliation.contract.customer.name);

        for (const line of reconciliation.lines) {
          if (line.roadLiabilityId) continue;
          if (line.amount <= 0) continue;

          const originEventKey = reconciliationLineInvoiceOriginKey(line.id);
          const prior = await loadExistingByOrigin(tx, originEventKey);
          if (prior) {
            created.push(prior);
            continue;
          }

          const serviceLabel = reconciliationServiceLabel(line.type);
          const description = line.description?.trim() || serviceLabel;

          const invoice = await createIssuedInvoice(tx, {
            invoiceType: "RECONCILIATION",
            originEventKey,
            companyId: reconciliation.contract.companyId,
            contractId: reconciliation.contract.id,
            vehicleId: reconciliation.contract.vehicleId,
            customerId: reconciliation.contract.customerId,
            customerName,
            contractNumber: reconciliation.contract.contractNumber,
            vehicleName,
            plateNumber,
            company: reconciliation.contract.company,
            lines: [
              {
                lineType: reconciliationLineToInvoiceLineType(line.type),
                serviceLabel,
                description,
                quantity: 1,
                unitRate: line.amount,
                amount: line.amount,
                sourceType: "RECONCILIATION_LINE",
                sourceId: line.id,
              },
            ],
          });
          created.push(invoice);
        }

        return created;
      });
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
