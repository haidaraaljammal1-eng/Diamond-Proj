import type { FastifyInstance } from "fastify";
import { createPaymentProvider } from "src/modules/contracts/payment/payment-provider.factory";
import { createStripeWebhookInboxService } from "src/modules/contracts/payment/stripe-webhook-inbox.service";

export default async function paymentsPublicRoutes(fastify: FastifyInstance) {
  const inbox = createStripeWebhookInboxService(fastify.prisma);

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
          summary: "Stripe webhook (fast ACK + durable inbox)",
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
        if (!provider.configured) {
          return reply.status(503).send({ error: { code: "NOT_CONFIGURED" } });
        }

        const payload = request.body as Buffer;
        const verified = await provider.verifyWebhook(payload, signature);
        if (!verified.ok) {
          const status = verified.reason === "INVALID_SIGNATURE" ? 400 : 503;
          return reply.status(status).send({ error: { code: verified.reason } });
        }

        const event = verified.event;
        const outcome = await inbox.insertEvent(event as Parameters<typeof inbox.insertEvent>[0]);

        if (outcome === "duplicate") {
          return reply.status(200).send({ data: { duplicate: true } });
        }
        return reply.status(200).send({ data: { received: true } });
      },
    );
  });
}
