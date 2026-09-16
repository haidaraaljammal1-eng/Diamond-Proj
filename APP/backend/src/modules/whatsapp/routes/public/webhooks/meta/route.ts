import type { FastifyInstance } from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import { z } from "zod";
import { authRateLimit } from "src/plugins/rate-limit";
import { WhatsAppErrorReason } from "src/modules/whatsapp/whatsapp.errors";
import { whatsappWebhookSecrets } from "src/modules/whatsapp/whatsapp.config";
import { verifyMetaWebhookChallenge } from "src/modules/whatsapp/whatsapp.webhook-signature";
import { createWhatsAppWebhookService } from "src/modules/whatsapp/whatsapp.webhook.service";

const T = ["WhatsApp"];

const VerifyQuerySchema = z
  .object({
    "hub.mode": z.string().optional().describe("Provider verification mode. Expected: subscribe."),
    "hub.verify_token": z
      .string()
      .optional()
      .describe("Must match the server-only webhook verify token. Never logged or returned."),
    "hub.challenge": z
      .string()
      .optional()
      .describe("Opaque challenge echoed as plain text on success."),
  })
  .passthrough();

function signatureHeader(headers: Record<string, unknown>): string | undefined {
  const value = headers["x-hub-signature-256"];
  if (typeof value === "string") return value;
  if (Array.isArray(value) && typeof value[0] === "string") return value[0];
  return undefined;
}

export default async function whatsappMetaWebhookRoutes(fastify: FastifyInstance) {
  const app = fastify.withTypeProvider<ZodTypeProvider>();
  const webhooks = createWhatsAppWebhookService(fastify);

  app.get(
    "/",
    {
      config: authRateLimit(),
      schema: {
        summary: "Meta WhatsApp Cloud API webhook verification challenge",
        operationId: "verifyWhatsAppMetaWebhook",
        tags: T,
        public: true,
        querystring: VerifyQuerySchema,
      },
    },
    async (request, reply) => {
      const verified = verifyMetaWebhookChallenge(
        request.query,
        whatsappWebhookSecrets().verifyToken,
      );
      if (!verified.ok) {
        request.log.warn({ provider: "META_CLOUD_API" }, "whatsapp webhook verify failed");
        return reply.status(403).send({ error: { code: WhatsAppErrorReason.WEBHOOK_VERIFY_FAILED } });
      }
      request.log.info({ provider: "META_CLOUD_API" }, "whatsapp webhook verify ok");
      return reply.type("text/plain; charset=utf-8").status(200).send(verified.challenge);
    },
  );

  await app.register(async (instance) => {
    instance.addContentTypeParser(
      "application/json",
      { parseAs: "buffer" },
      (_req, body, done) => {
        done(null, body);
      },
    );

    instance.post(
      "/",
      {
        schema: {
          summary: "Meta WhatsApp Cloud API webhook events",
          operationId: "receiveWhatsAppMetaWebhook",
          tags: T,
          public: true,
          hide: true,
        },
      },
      async (request, reply) => {
        request.setAudit({ skip: true });
        if (!Buffer.isBuffer(request.body)) {
          return reply
            .status(403)
            .send({ error: { code: WhatsAppErrorReason.WEBHOOK_INVALID_SIGNATURE } });
        }
        const result = await webhooks.ingest(
          request.body,
          signatureHeader(request.headers as Record<string, unknown>),
        );
        if (result.httpStatus === 200) {
          return reply.status(200).send({ data: { received: true } });
        }
        return reply.status(result.httpStatus).send({ error: { code: result.code } });
      },
    );
  });
}
