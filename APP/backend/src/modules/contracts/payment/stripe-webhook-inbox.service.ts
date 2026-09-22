import type { PrismaClient } from "@prisma/client";
import { isUniqueViolation } from "src/lib/db/prisma-error";
import { withTransaction } from "src/lib/db/transaction";
import type { ParsedWebhookCardSetupEvent, ParsedWebhookPaymentEvent } from "src/modules/contracts/payment/payment-provider.types";

const MAX_WEBHOOK_ATTEMPTS = 8;
const WEBHOOK_BATCH_SIZE = 20;

export type InboxInsertInput =
  | ({ kind: "PAYMENT" } & ParsedWebhookPaymentEvent)
  | ({ kind: "CARD_SETUP" } & ParsedWebhookCardSetupEvent)
  | { kind: "IGNORED"; stripeEventId: string; eventType: string };

function backoffMs(attemptCount: number): number {
  const base = Math.min(60_000, 1_000 * 2 ** Math.max(0, attemptCount - 1));
  return base;
}

export function createStripeWebhookInboxService(prisma: PrismaClient) {
  async function insertEvent(input: InboxInsertInput): Promise<"stored" | "duplicate"> {
    try {
      await prisma.stripeWebhookEvent.create({
        data: {
          stripeEventId: input.stripeEventId,
          eventType: input.eventType,
          eventKind: input.kind,
          processingStatus: input.kind === "IGNORED" ? "IGNORED" : "PENDING",
          processedAt: input.kind === "IGNORED" ? new Date() : null,
          outcome: input.kind === "IGNORED" ? "ignored" : "received",
          ...(input.kind === "PAYMENT"
            ? {
                paymentId: input.paymentId,
                providerReference: input.providerReference,
                normalizedStatus: input.status,
                amountMinor: input.amountMinor ?? null,
                currency: input.currency ?? null,
              }
            : {}),
          ...(input.kind === "CARD_SETUP"
            ? {
                providerReference: input.providerReference,
                normalizedStatus: "CONFIRMED",
              }
            : {}),
        },
      });
      return "stored";
    } catch (error) {
      if (isUniqueViolation(error)) return "duplicate";
      throw error;
    }
  }

  async function claimBatch(now: Date = new Date()) {
    return withTransaction(prisma, async (tx) => {
      const rows = await tx.$queryRaw<
        Array<{ id: string }>
      >`
        SELECT id FROM stripe_webhook_events
        WHERE "processingStatus" IN ('PENDING', 'FAILED')
          AND "availableAt" <= ${now}
          AND "attemptCount" < ${MAX_WEBHOOK_ATTEMPTS}
        ORDER BY "receivedAt" ASC
        LIMIT ${WEBHOOK_BATCH_SIZE}
        FOR UPDATE SKIP LOCKED
      `;
      if (rows.length === 0) return [];

      const ids = rows.map((row) => row.id);
      await tx.stripeWebhookEvent.updateMany({
        where: { id: { in: ids } },
        data: { processingStatus: "PROCESSING" },
      });
      return tx.stripeWebhookEvent.findMany({ where: { id: { in: ids } } });
    });
  }

  async function markProcessed(id: string, outcome: string): Promise<void> {
    await prisma.stripeWebhookEvent.update({
      where: { id },
      data: {
        processingStatus: "PROCESSED",
        processedAt: new Date(),
        outcome,
      },
    });
  }

  async function markRetry(id: string, attemptCount: number, errorCode: string): Promise<void> {
    const next = new Date(Date.now() + backoffMs(attemptCount));
    await prisma.stripeWebhookEvent.update({
      where: { id },
      data: {
        processingStatus: "FAILED",
        attemptCount: { increment: 1 },
        availableAt: next,
        lastErrorCode: errorCode,
        error: errorCode,
      },
    });
  }

  async function markPermanentFailure(id: string, errorCode: string): Promise<void> {
    await prisma.stripeWebhookEvent.update({
      where: { id },
      data: {
        processingStatus: "FAILED",
        processedAt: new Date(),
        outcome: "failed",
        lastErrorCode: errorCode,
        error: errorCode,
        attemptCount: { increment: 1 },
      },
    });
  }

  return {
    insertEvent,
    claimBatch,
    markProcessed,
    markRetry,
    markPermanentFailure,
    MAX_WEBHOOK_ATTEMPTS,
  };
}
