import assert from "node:assert/strict";
import type { FastifyInstance } from "fastify";
import type { PrismaClient } from "@prisma/client";
import { isUniqueViolation } from "src/lib/db/prisma-error";
import { drainInvoiceOutbox } from "tests/helpers/invoice-integration";

export async function enqueueInvoiceOutboxEvent(
  prisma: PrismaClient,
  input: {
    eventType: string;
    dedupeKey: string;
    payload: Record<string, unknown>;
    aggregateType?: string;
    aggregateId?: string;
  },
): Promise<void> {
  await prisma.domainOutboxEvent.create({
    data: {
      eventType: input.eventType,
      aggregateType: input.aggregateType ?? "contract",
      aggregateId: input.aggregateId ?? String(input.payload.contractId ?? "unknown"),
      dedupeKey: input.dedupeKey,
      payload: input.payload,
      status: "PENDING",
      availableAt: new Date(),
      maxAttempts: 5,
    },
  });
}

export async function enqueuePaymentConfirmedOutbox(
  prisma: PrismaClient,
  payment: { id: string; contractId: string; purpose: string; targetId: string; amount: number },
): Promise<void> {
  await enqueueInvoiceOutboxEvent(prisma, {
    eventType: "payment.confirmed",
    dedupeKey: `payment.confirmed:${payment.id}:closure-${Date.now()}`,
    aggregateType: "contract_payment",
    aggregateId: payment.id,
    payload: {
      paymentId: payment.id,
      purpose: payment.purpose,
      contractId: payment.contractId,
      targetId: payment.targetId,
      amount: payment.amount,
    },
  });
}

export async function createSyntheticReconciliationPayment(
  prisma: PrismaClient,
  input: {
    contractId: string;
    reconciliationId: string;
    amount: number;
    status: "CONFIRMED" | "PENDING" | "FAILED";
  },
) {
  const now = new Date();
  const existing = await prisma.contractPayment.findFirst({
    where: {
      contractId: input.contractId,
      purpose: "RECONCILIATION",
      targetId: input.reconciliationId,
      status: "CONFIRMED",
    },
  });
  if (existing && input.status === "CONFIRMED") {
    return prisma.contractPayment.update({
      where: { id: existing.id },
      data: { amount: input.amount, confirmedAt: now },
    });
  }
  if (input.status === "CONFIRMED") {
    const pending = await prisma.contractPayment.findFirst({
      where: {
        contractId: input.contractId,
        purpose: "RECONCILIATION",
        targetId: input.reconciliationId,
        status: { in: ["PENDING", "PROCESSING"] },
      },
    });
    if (pending) {
      return prisma.contractPayment.update({
        where: { id: pending.id },
        data: { status: "CONFIRMED", amount: input.amount, confirmedAt: now, provider: "stripe" },
      });
    }
  }
  return prisma.contractPayment.create({
    data: {
      contractId: input.contractId,
      purpose: "RECONCILIATION",
      targetId: input.reconciliationId,
      amount: input.amount,
      currency: "AED",
      method: "CARD",
      status: input.status,
      confirmedAt: input.status === "CONFIRMED" ? now : null,
      failedAt: input.status === "FAILED" ? now : null,
      provider: input.status === "CONFIRMED" ? "stripe" : null,
    },
  });
}

export async function assertExactlyOneCurrentInvoice(
  prisma: PrismaClient,
  contractId: string,
): Promise<{ id: string; revisionNumber: number; balanceDueSnapshot: number; totalAmount: number }> {
  const current = await prisma.invoice.findMany({ where: { contractId, isCurrent: true } });
  assert.equal(current.length, 1, `expected one CURRENT invoice for ${contractId}`);
  const row = current[0]!;
  return {
    id: row.id,
    revisionNumber: row.revisionNumber,
    balanceDueSnapshot: row.balanceDueSnapshot,
    totalAmount: row.totalAmount,
  };
}

export async function drainAndAssertCurrent(
  app: FastifyInstance,
  prisma: PrismaClient,
  contractId: string,
) {
  await drainInvoiceOutbox(app);
  return assertExactlyOneCurrentInvoice(prisma, contractId);
}

/** Outbox backoff delays retries; tests must make failed events immediately due again. */
export async function primeInvoiceOutboxForImmediateRetry(
  prisma: PrismaClient,
  dedupeKey: string,
): Promise<void> {
  await prisma.domainOutboxEvent.updateMany({
    where: { dedupeKey, status: { in: ["PENDING", "FAILED"] } },
    data: { status: "PENDING", availableAt: new Date(), lockedAt: null },
  });
}

/** Proves PostgreSQL partial unique index rejects a second CURRENT row. */
export async function assertPartialUniqueCurrentInvoiceEnforced(
  prisma: PrismaClient,
  templateInvoiceId: string,
): Promise<void> {
  const template = await prisma.invoice.findUniqueOrThrow({ where: { id: templateInvoiceId } });
  assert.equal(template.isCurrent, true);
  let rejected = false;
  try {
    await prisma.invoice.create({
      data: {
        invoiceNumber: template.invoiceNumber + 10_000,
        invoiceType: template.invoiceType,
        status: "ISSUED",
        companyId: template.companyId,
        contractId: template.contractId,
        vehicleId: template.vehicleId,
        customerId: template.customerId,
        customerNameSnapshot: template.customerNameSnapshot,
        vehicleNameSnapshot: template.vehicleNameSnapshot,
        plateNumberSnapshot: template.plateNumberSnapshot,
        contractNumberSnapshot: template.contractNumberSnapshot,
        companyDisplayNameSnapshot: template.companyDisplayNameSnapshot,
        companyAddressSnapshot: template.companyAddressSnapshot,
        companyEmailSnapshot: template.companyEmailSnapshot,
        companyBrandKeySnapshot: template.companyBrandKeySnapshot,
        issueDate: template.issueDate,
        dueDate: template.dueDate,
        currency: template.currency,
        subtotalAmount: template.subtotalAmount,
        totalAmount: template.totalAmount,
        balanceDueSnapshot: template.balanceDueSnapshot,
        termsSnapshot: template.termsSnapshot,
        templateVersion: template.templateVersion,
        originEventKey: `${template.originEventKey}:dup-probe`,
        revisionNumber: template.revisionNumber + 99,
        isCurrent: true,
        contentFingerprint: `probe-${Date.now()}`,
      },
    });
  } catch (error) {
    rejected = isUniqueViolation(error);
  }
  assert.equal(rejected, true, "second isCurrent=true row must violate partial unique index");
}
