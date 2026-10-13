import { createHash } from "node:crypto";
import type { FastifyInstance } from "fastify";
import type {
  ContractStatus,
  Invoice,
  InvoiceLineType,
  OperatingCompany,
  Prisma,
} from "@prisma/client";
import { acquireAdvisoryLock } from "src/lib/db/advisory-lock";
import { isUniqueViolation } from "src/lib/db/prisma-error";
import { withTransaction, type Tx } from "src/lib/db/transaction";
import { invoiceBrandingForCompany } from "src/modules/invoices/invoice-company-branding";
import { auditInvoiceIssued } from "src/modules/invoices/invoice-audit";
import {
  addCalendarDaysUtc,
  deriveRentalQuantityAndRate,
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
  consolidatedContractInvoiceOriginKey,
} from "src/modules/invoices/invoices.constants";
import {
  invoiceDuplicateSourceError,
  invoiceNotFoundError,
  invoiceSourceIncompleteError,
} from "src/modules/invoices/invoices.errors";
const CONTRACT_INVOICE_LOCK_NS = "contract_invoice";

const ELIGIBLE_CONTRACT_STATUSES: ContractStatus[] = [
  "PAID",
  "ACTIVE",
  "RETOUT",
  "REVIEW",
  "CLOSED",
];

export type ConsolidatedLineInput = {
  lineType: InvoiceLineType;
  serviceLabel: string;
  description: string;
  quantity: number;
  unitRate: number;
  amount: number;
  sourceType: Prisma.InvoiceLineCreateWithoutInvoiceInput["sourceType"];
  sourceId: string;
};

function vehicleLabel(vehicle: { vehicleName: string | null; plateNumber: string | null }) {
  return {
    vehicleName: vehicle.vehicleName?.trim() || "Vehicle",
    plateNumber: vehicle.plateNumber?.trim() || "—",
  };
}

function requireCustomerName(name: string | null | undefined): string {
  const trimmed = name?.trim();
  if (!trimmed) throw invoiceSourceIncompleteError("Customer name is required to issue an invoice");
  return trimmed;
}

function fingerprintLines(lines: ConsolidatedLineInput[], balanceDue: number): string {
  const payload = {
    lines: lines
      .map((l) => ({
        sourceType: l.sourceType,
        sourceId: l.sourceId,
        amount: l.amount,
      }))
      .sort((a, b) => `${a.sourceType}:${a.sourceId}`.localeCompare(`${b.sourceType}:${b.sourceId}`)),
    balanceDue,
  };
  return createHash("sha256").update(JSON.stringify(payload)).digest("hex");
}

function resolveDocumentInvoiceType(lines: ConsolidatedLineInput[]): Prisma.InvoiceCreateInput["invoiceType"] {
  if (lines.some((l) => l.lineType === "RENTAL")) return "RENTAL";
  if (lines.some((l) => l.lineType === "RENEWAL")) return "RENEWAL";
  if (lines.some((l) => l.lineType.startsWith("ROAD_LIABILITY"))) return "ROAD_LIABILITY";
  return "RECONCILIATION";
}

async function sumConfirmedContractCollections(tx: Tx, contractId: string): Promise<number> {
  const payments = await tx.contractPayment.findMany({
    where: {
      contractId,
      status: "CONFIRMED",
      purpose: {
        in: ["RENTAL", "RENEWAL", "RECONCILIATION", "ROAD_LIABILITY", "POST_CLOSE_RECEIVABLE"],
      },
    },
    select: { amount: true },
  });
  return payments.reduce((sum, p) => sum + p.amount, 0);
}

export async function buildConsolidatedInvoiceLines(
  tx: Tx,
  contractId: string,
): Promise<ConsolidatedLineInput[]> {
  const contract = await tx.contract.findUnique({
    where: { id: contractId },
    include: {
      company: true,
      customer: true,
      vehicle: true,
      reconciliation: { include: { lines: true } },
      renewals: { orderBy: { createdAt: "asc" } },
    },
  });
  if (!contract) throw invoiceNotFoundError();
  if (!contract.customerId) throw invoiceSourceIncompleteError("Contract customer is required");

  const lines: ConsolidatedLineInput[] = [];
  const branding = invoiceBrandingForCompany(contract.company);

  if (ELIGIBLE_CONTRACT_STATUSES.includes(contract.status)) {
    const rentalPayment = await tx.contractPayment.findFirst({
      where: {
        contractId: contract.id,
        purpose: "RENTAL",
        status: "CONFIRMED",
      },
      orderBy: { confirmedAt: "desc" },
    });
    if (rentalPayment) {
      const rentalDate = contract.startAt ?? contract.activatedAt ?? new Date();
      const { quantity, unitRate } = deriveRentalQuantityAndRate({
        durationValue: contract.durationValue,
        durationUnit: contract.durationUnit,
        priceType: contract.priceType,
        agreedAmount: rentalPayment.amount,
      });
      lines.push({
        lineType: "RENTAL",
        serviceLabel: branding.serviceLabelRental,
        description: `Rental income from ${formatInvoiceDateDdMmYyyy(toUtcDateOnly(rentalDate))}`,
        quantity,
        unitRate,
        amount: rentalPayment.amount,
        sourceType: "CONTRACT_RENTAL",
        sourceId: contract.id,
      });
    }
  }

  for (const renewal of contract.renewals) {
    if (renewal.additionalAmount <= 0) continue;
    if (!renewal.approvedAt && !renewal.appliedAt) continue;
    lines.push({
      lineType: "RENEWAL",
      serviceLabel: "Contract Renewal",
      description: `Renewal extension through ${formatInvoiceDateDdMmYyyy(toUtcDateOnly(renewal.newEndAt))}`,
      quantity: 1,
      unitRate: renewal.additionalAmount,
      amount: renewal.additionalAmount,
      sourceType: "CONTRACT_RENEWAL",
      sourceId: renewal.id,
    });
  }

  const recon = contract.reconciliation;
  if (recon && (recon.finalizedAt || recon.approvedAt)) {
    for (const line of recon.lines) {
      if (line.roadLiabilityId) continue;
      if (line.amount <= 0) continue;
      const serviceLabel = reconciliationServiceLabel(line.type);
      lines.push({
        lineType: reconciliationLineToInvoiceLineType(line.type),
        serviceLabel,
        description: line.description?.trim() || serviceLabel,
        quantity: 1,
        unitRate: line.amount,
        amount: line.amount,
        sourceType: "RECONCILIATION_LINE",
        sourceId: line.id,
      });
    }
  }

  const rlCharges = await tx.roadLiabilityCustomerCharge.findMany({
    where: {
      contractId,
      destinationType: "DIRECT_COLLECTION",
      operationalState: { in: ["COLLECTIBLE", "PAID", "PROCESSING", "REQUIRES_ACTION", "PAYMENT_LINK_READY"] },
    },
    include: { roadLiability: true },
    orderBy: { confirmedAt: "asc" },
  });

  const reconRlIds = new Set(
    recon?.lines.filter((l) => l.roadLiabilityId).map((l) => l.roadLiabilityId!) ?? [],
  );

  const directChargeIds = new Set<string>();

  for (const charge of rlCharges) {
    if (reconRlIds.has(charge.roadLiabilityId)) continue;
    directChargeIds.add(charge.id);
    const rl = charge.roadLiability;
    const serviceLabel =
      rl.staffChargeCategory === "TRAFFIC_VIOLATION"
        ? "Traffic Violation"
        : rl.staffChargeCategory === "SALIK"
          ? "Salik"
          : roadLiabilityServiceLabel(rl.type);
    lines.push({
      lineType: roadLiabilityToInvoiceLineType(rl.type),
      serviceLabel,
      description: `${serviceLabel} related to Contract ${contract.contractNumber}`,
      quantity: 1,
      unitRate: charge.customerChargeAmount,
      amount: charge.customerChargeAmount,
      sourceType: "ROAD_LIABILITY_CUSTOMER_CHARGE",
      sourceId: charge.id,
    });
  }

  const postCloseReceivables = await tx.contractPostCloseReceivable.findMany({
    where: {
      contractId,
      status: { in: ["OPEN", "SETTLED"] },
    },
    include: { roadLiability: true },
    orderBy: { createdAt: "asc" },
  });

  for (const receivable of postCloseReceivables) {
    if (directChargeIds.has(receivable.customerChargeId)) continue;
    const rl = receivable.roadLiability;
    const serviceLabel =
      rl.staffChargeCategory === "TRAFFIC_VIOLATION"
        ? "Traffic Violation"
        : rl.staffChargeCategory === "SALIK"
          ? "Salik"
          : roadLiabilityServiceLabel(rl.type);
    lines.push({
      lineType: roadLiabilityToInvoiceLineType(rl.type),
      serviceLabel,
      description: `${serviceLabel} (post-close) related to Contract ${contract.contractNumber}`,
      quantity: 1,
      unitRate: receivable.amount,
      amount: receivable.amount,
      sourceType: "ROAD_LIABILITY_CUSTOMER_CHARGE",
      sourceId: receivable.customerChargeId,
    });
  }

  if (lines.length === 0) {
    throw invoiceSourceIncompleteError("No eligible invoice lines for contract");
  }

  return lines;
}

async function createRevisionInvoice(
  tx: Tx,
  input: {
    contract: {
      id: string;
      companyId: number;
      vehicleId: number;
      customerId: number;
      contractNumber: string;
      company: OperatingCompany;
      customer: { name: string | null };
      vehicle: { vehicleName: string | null; plateNumber: string | null };
    };
    lines: ConsolidatedLineInput[];
    revisionNumber: number;
    balanceDue: number;
    contentFingerprint: string;
    supersedesInvoiceId: string | null;
    issuedByUserId?: number | null;
  },
): Promise<Invoice> {
  const { vehicleName, plateNumber } = vehicleLabel(input.contract.vehicle);
  const branding = invoiceBrandingForCompany(input.contract.company);
  const issueDate = toUtcDateOnly(new Date());
  const paidInFull = input.balanceDue <= 0;
  const dueDate = paidInFull ? issueDate : addCalendarDaysUtc(issueDate, 30);
  const totalAmount = input.lines.reduce((sum, line) => sum + line.amount, 0);
  if (totalAmount <= 0) throw invoiceSourceIncompleteError("Invoice total must be positive");

  const originEventKey = consolidatedContractInvoiceOriginKey(input.contract.id, input.revisionNumber);
  const existingByOrigin = await tx.invoice.findUnique({ where: { originEventKey } });
  if (existingByOrigin) return existingByOrigin;

  const invoiceNumber = await allocateInvoiceNumber(tx, input.contract.companyId);

  try {
    const created = await tx.invoice.create({
      data: {
        invoiceNumber,
        invoiceType: resolveDocumentInvoiceType(input.lines),
        status: "ISSUED",
        companyId: input.contract.companyId,
        contractId: input.contract.id,
        vehicleId: input.contract.vehicleId,
        customerId: input.contract.customerId,
        issueDate,
        dueDate,
        termsSnapshot: paidInFull ? INVOICE_TERMS_PAID_IN_FULL : INVOICE_TERMS_NET_30,
        currency: INVOICE_CURRENCY,
        customerNameSnapshot: requireCustomerName(input.contract.customer.name),
        contractNumberSnapshot: input.contract.contractNumber,
        vehicleNameSnapshot: vehicleName,
        plateNumberSnapshot: plateNumber,
        companyDisplayNameSnapshot: branding.displayName,
        companyAddressSnapshot: branding.addressLine,
        companyEmailSnapshot: branding.email,
        companyBrandKeySnapshot: branding.brandKey,
        subtotalAmount: totalAmount,
        totalAmount,
        balanceDueSnapshot: Math.max(0, input.balanceDue),
        templateVersion: INVOICE_TEMPLATE_VERSION,
        originEventKey,
        revisionNumber: input.revisionNumber,
        isCurrent: true,
        supersedesInvoiceId: input.supersedesInvoiceId,
        contentFingerprint: input.contentFingerprint,
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
      originEventKey,
      sourceTypes: input.lines.map((line) => line.sourceType),
    });
    return created;
  } catch (err) {
    if (isUniqueViolation(err)) {
      throw invoiceDuplicateSourceError();
    }
    throw err;
  }
}

export function createContractInvoiceConsolidationService(fastify: FastifyInstance) {
  const prisma = fastify.prisma;

  return {
    async ensureConsolidatedContractInvoice(contractId: string, issuedByUserId?: number | null) {
      return withTransaction(prisma, async (tx) => {
        await acquireAdvisoryLock(tx, CONTRACT_INVOICE_LOCK_NS, contractId);

        const contract = await tx.contract.findUnique({
          where: { id: contractId },
          include: {
            company: true,
            customer: true,
            vehicle: true,
          },
        });
        if (!contract || !contract.customerId || !contract.customer) {
          throw invoiceSourceIncompleteError("Contract not found or incomplete for invoice");
        }

        const lines = await buildConsolidatedInvoiceLines(tx, contractId);
        const totalAmount = lines.reduce((sum, l) => sum + l.amount, 0);
        const collected = await sumConfirmedContractCollections(tx, contractId);
        const balanceDue = Math.max(0, totalAmount - collected);
        const fingerprint = fingerprintLines(lines, balanceDue);

        const current = await tx.invoice.findFirst({
          where: { contractId, isCurrent: true },
          orderBy: { revisionNumber: "desc" },
        });

        if (current?.contentFingerprint === fingerprint) {
          return current;
        }

        const maxRevision = await tx.invoice.aggregate({
          where: { contractId },
          _max: { revisionNumber: true },
        });
        const revisionNumber = (maxRevision._max.revisionNumber ?? 0) + 1;

        if (current) {
          await tx.invoice.update({
            where: { id: current.id },
            data: { isCurrent: false },
          });
        }

        return await createRevisionInvoice(tx, {
          contract: {
            id: contract.id,
            companyId: contract.companyId,
            vehicleId: contract.vehicleId,
            customerId: contract.customerId,
            contractNumber: contract.contractNumber,
            company: contract.company,
            customer: contract.customer,
            vehicle: contract.vehicle,
          },
          lines,
          revisionNumber,
          balanceDue,
          contentFingerprint: fingerprint,
          supersedesInvoiceId: current?.id ?? null,
          issuedByUserId,
        });
      });
    },
  };
}
