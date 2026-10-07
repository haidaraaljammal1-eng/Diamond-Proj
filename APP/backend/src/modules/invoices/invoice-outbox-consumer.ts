import type { FastifyInstance } from "fastify";
import type { Prisma } from "@prisma/client";
import { createInvoiceIssuanceService } from "src/modules/invoices/invoice-issuance.service";
import {
  INVOICE_OUTBOX_EVENT_TYPES,
  INVOICE_OUTBOX_RECONCILIATION_FINALIZED,
  INVOICE_OUTBOX_ROAD_LIABILITY_CHARGE,
} from "src/modules/invoices/invoices.constants";

export function createInvoiceOutboxConsumer(app: FastifyInstance) {
  const prisma = app.prisma;
  const issuance = createInvoiceIssuanceService(app);

  async function handleEvent(ev: { eventType: string; payload: Prisma.JsonValue }): Promise<boolean> {
    const payload = (ev.payload ?? {}) as Prisma.JsonObject;

    if (ev.eventType === "contract.signed") {
      const contractId = String(payload.contractId ?? "");
      if (!contractId) return true;
      await issuance.ensureRentalInvoiceForContract(contractId);
      return true;
    }

    if (ev.eventType === INVOICE_OUTBOX_ROAD_LIABILITY_CHARGE) {
      const customerChargeId = String(payload.customerChargeId ?? "");
      if (!customerChargeId) return true;
      await issuance.ensureRoadLiabilityInvoiceForCustomerCharge(customerChargeId);
      return true;
    }

    if (ev.eventType === INVOICE_OUTBOX_RECONCILIATION_FINALIZED) {
      const reconciliationId = String(payload.reconciliationId ?? "");
      if (!reconciliationId) return true;
      await issuance.ensureReconciliationInvoicesForReconciliation(reconciliationId);
      return true;
    }

    return false;
  }

  async function runInvoiceOutboxCycle(): Promise<{ processed: number }> {
    const now = new Date();
    const staleCutoff = new Date(now.getTime() - 5 * 60_000);
    await prisma.domainOutboxEvent.updateMany({
      where: { status: "PROCESSING", lockedAt: { lt: staleCutoff } },
      data: { status: "PENDING", lockedAt: null },
    });

    const due = await prisma.domainOutboxEvent.findMany({
      where: {
        status: "PENDING",
        availableAt: { lte: now },
        eventType: { in: [...INVOICE_OUTBOX_EVENT_TYPES] },
      },
      orderBy: { id: "asc" },
      take: 100,
    });

    let processed = 0;
    for (const ev of due) {
      const claim = await prisma.domainOutboxEvent.updateMany({
        where: { id: ev.id, status: "PENDING" },
        data: { status: "PROCESSING", lockedAt: now },
      });
      if (claim.count === 0) continue;

      try {
        const handled = await handleEvent(ev);
        if (!handled) {
          await prisma.domainOutboxEvent.update({
            where: { id: ev.id },
            data: { status: "PROCESSED", processedAt: now, lockedAt: null },
          });
          continue;
        }
        await prisma.domainOutboxEvent.update({
          where: { id: ev.id },
          data: { status: "PROCESSED", processedAt: now, lockedAt: null },
        });
        processed += 1;
      } catch (err) {
        const attempt = ev.attemptCount + 1;
        const failed = attempt >= ev.maxAttempts;
        await prisma.domainOutboxEvent.update({
          where: { id: ev.id },
          data: {
            status: failed ? "FAILED" : "PENDING",
            attemptCount: attempt,
            lockedAt: null,
            availableAt: new Date(now.getTime() + Math.min(60, 2 ** attempt) * 60_000),
            lastErrorCode: String((err as Error)?.message ?? "").slice(0, 120),
          },
        });
        app.log.error({ err, outboxId: ev.id }, "invoice outbox event failed");
      }
    }

    return { processed };
  }

  return { runInvoiceOutboxCycle };
}
