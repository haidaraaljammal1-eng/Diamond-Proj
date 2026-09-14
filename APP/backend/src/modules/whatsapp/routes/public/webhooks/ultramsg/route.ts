import type { FastifyInstance } from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import { z } from "zod";
import { authRateLimit } from "src/plugins/rate-limit";
import { WhatsAppErrorReason } from "src/modules/whatsapp/whatsapp.errors";
import { createUltraMsgWebhookService } from "src/modules/whatsapp/ultramsg.webhook.service";

const T = ["WhatsApp"];

export default async function whatsappUltraMsgWebhookRoutes(fastify: FastifyInstance) {
  const app = fastify.withTypeProvider<ZodTypeProvider>();
  const webhooks = createUltraMsgWebhookService(fastify);

  await app.register(async (raw) => {
    const instance = raw.withTypeProvider<ZodTypeProvider>();
    instance.addContentTypeParser(
      "application/json",
      { parseAs: "buffer" },
      (_req, body, done) => {
        done(null, body);
      },
    );

    instance.post(
      "/:callbackKey",
      {
        config: authRateLimit(),
        schema: {
          summary: "UltraMsg WhatsApp webhook events",
          operationId: "receiveWhatsAppUltraMsgWebhook",
          tags: T,
          public: true,
          hide: true,
          params: z.object({
            callbackKey: z.string().min(8).max(256),
          }),
        },
      },
      async (request, reply) => {
        request.setAudit({ skip: true });
        if (!Buffer.isBuffer(request.body)) {
          return reply
            .status(400)
            .send({ error: { code: WhatsAppErrorReason.WEBHOOK_MALFORMED_PAYLOAD } });
        }
        const result = await webhooks.ingest(request.body, request.params.callbackKey);
        if (result.httpStatus === 200) {
          return reply.status(200).send({ data: { received: true } });
        }
        return reply.status(result.httpStatus).send({ error: { code: result.code } });
      },
    );
  });
}
