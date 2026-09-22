import type { FastifyInstance } from "fastify";
import { createContractPaymentService } from "src/modules/contracts/payment/contract-payment.service";
import { createStripeWebhookInboxService } from "src/modules/contracts/payment/stripe-webhook-inbox.service";

export function createStripeWebhookWorker(app: FastifyInstance) {
  const inbox = createStripeWebhookInboxService(app.prisma);
  const payments = createContractPaymentService(app.prisma);

  async function runStripeWebhookCycle(): Promise<{ processed: number }> {
    const batch = await inbox.claimBatch();
    let processed = 0;
    for (const row of batch) {
      try {
        if (row.eventKind === "PAYMENT") {
          await payments.applyInboxPaymentEvent(row);
        } else if (row.eventKind === "CARD_SETUP") {
          await payments.applyInboxCardSetupEvent(row);
        } else {
          await inbox.markProcessed(row.id, "ignored");
          processed += 1;
          continue;
        }
        await inbox.markProcessed(row.id, "processed");
        processed += 1;
      } catch (error) {
        const code = error instanceof Error ? error.message : "unknown";
        if (row.attemptCount + 1 >= inbox.MAX_WEBHOOK_ATTEMPTS) {
          await inbox.markPermanentFailure(row.id, code);
        } else {
          await inbox.markRetry(row.id, row.attemptCount + 1, code);
        }
        app.log.warn({ err: error, stripeEventId: row.stripeEventId }, "stripe webhook: processing failed");
      }
    }
    return { processed };
  }

  return { runStripeWebhookCycle };
}
