import type { FastifyInstance } from "fastify";
import type { Prisma } from "@prisma/client";
import { createContractInvoiceConsolidationService } from "src/modules/invoices/contract-invoice-consolidation.service";
import {
  INVOICE_OUTBOX_EVENT_TYPES,
  INVOICE_OUTBOX_RECONCILIATION_FINALIZED,
  INVOICE_OUTBOX_ROAD_LIABILITY_CHARGE,
} from "src/modules/invoices/invoices.constants";

export function createInvoiceOutboxConsumer(app: FastifyInstance) {
  const prisma = app.prisma;
  const consolidation = createContractInvoiceConsolidationService(app);

  async function resolveContractId(
    ev: { eventType: string; payload: Prisma.JsonValue },
  ): Promise<string | null> {
    const payload = (ev.payload ?? {}) as Prisma.JsonObject;
    const direct = payload.contractId;
    if (typeof direct === "string" && direct.length > 0) return direct;

    if (ev.eventType === INVOICE_OUTBOX_RECONCILIATION_FINALIZED) {
      const reconciliationId = String(payload.reconciliationId ?? "");
      if (!reconciliationId) return null;
      const recon = await prisma.contractReconciliation.findUnique({
        where: { id: reconciliationId },
        select: { contractId: true },
      });
      return recon?.contractId ?? null;
    }

    if (ev.eventType === INVOICE_OUTBOX_ROAD_LIABILITY_CHARGE) {
      const customerChargeId = String(payload.customerChargeId ?? "");
      if (!customerChargeId) return null;
      const charge = await prisma.roadLiabilityCustomerCharge.findUnique({
        where: { id: customerChargeId },
        select: { contractId: true },
      });
      return charge?.contractId ?? null;
    }

    return null;
  }

  async function handleEvent(ev: { eventType: string; payload: Prisma.JsonValue }): Promise<boolean> {
    if (ev.eventType === INVOICE_OUTBOX_ROAD_LIABILITY_CHARGE) {
      const payload = (ev.payload ?? {}) as Prisma.JsonObject;
      const customerChargeId = String(payload.customerChargeId ?? "");
      const simulatedFailId = process.env.INVOICE_ISSUANCE_INTEGRATION_FAIL_ONCE_CHARGE_ID;
      if (simulatedFailId && simulatedFailId === customerChargeId) {
        delete process.env.INVOICE_ISSUANCE_INTEGRATION_FAIL_ONCE_CHARGE_ID;
        throw new Error("INVOICE_ISSUANCE_INTEGRATION_SIMULATED_FAILURE");
      }
    }
    const contractId = await resolveContractId(ev);
    if (!contractId) return true;
    await consolidation.ensureConsolidatedContractInvoice(contractId);
    return true;
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
