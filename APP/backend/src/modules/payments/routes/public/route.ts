import type { FastifyInstance } from "fastify";
import { createPaymentProvider } from "src/modules/contracts/payment/payment-provider.factory";
import { createContractPaymentService } from "src/modules/contracts/payment/contract-payment.service";

export default async function paymentsPublicRoutes(fastify: FastifyInstance) {
  const paymentService = createContractPaymentService(fastify.prisma);

  await fastify.register(async (instance) => {
    instance.addContentTypeParser(
      "application/json",
      { parseAs: "buffer" },
      (_req, body, done) => {
        done(null, body);
      },
    );

    instance.post(
      "/webhooks/stripe",
      {
        schema: {
          summary: "Stripe webhook (authoritative payment confirmation)",
          operationId: "stripeWebhook",
          tags: ["Payments"],
          public: true,
          hide: true,
        },
      },
      async (request, reply) => {
        const signature = request.headers["stripe-signature"];
        if (typeof signature !== "string") {
          return reply.status(400).send({ error: { code: "INVALID_SIGNATURE" } });
        }

        const provider = createPaymentProvider();
        const payload = request.body as Buffer;
        const verified = await provider.verifyWebhook(payload, signature);
        if (!verified.ok) {
          const status = verified.reason === "INVALID_SIGNATURE" ? 400 : 503;
          return reply.status(status).send({ error: { code: verified.reason } });
        }

        const outcome = await paymentService.processWebhookEvent(
          verified.event.stripeEventId,
          verified.event.eventType,
          verified.event.paymentId,
          verified.event.providerReference,
          verified.event.status,
          verified.event.amountMinor,
          verified.event.currency,
        );

        if (outcome === "duplicate") {
          return reply.status(200).send({ data: { duplicate: true } });
        }
        return reply.status(200).send({ data: { processed: true } });
      },
    );
  });
}
