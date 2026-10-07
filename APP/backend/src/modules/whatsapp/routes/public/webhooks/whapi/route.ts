import type { FastifyInstance } from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import { z } from "zod";
import { authRateLimit } from "src/plugins/rate-limit";
import { WhatsAppErrorReason } from "src/modules/whatsapp/whatsapp.errors";
import { createWhapiWebhookService } from "src/modules/whatsapp/whapi.webhook.service";
import { whapiWebhookSecretHeaderName } from "src/modules/whatsapp/whapi.config";

const T = ["WhatsApp"];

export default async function whatsappWhapiWebhookRoutes(fastify: FastifyInstance) {
  const app = fastify.withTypeProvider<ZodTypeProvider>();
  const webhooks = createWhapiWebhookService(fastify);

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
          summary: "Whapi WhatsApp webhook events",
          operationId: "receiveWhatsAppWhapiWebhook",
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
        const secretHeader = whapiWebhookSecretHeaderName();
        const webhookSecret = request.headers[secretHeader.toLowerCase()];
        const secretValue = typeof webhookSecret === "string" ? webhookSecret : undefined;
        const result = await webhooks.ingest(request.body, request.params.callbackKey, secretValue);
        if (result.httpStatus === 200) {
          return reply.status(200).send({ data: { received: true } });
        }
        return reply.status(result.httpStatus).send({ error: { code: result.code } });
      },
    );
  });
}
