import type { FastifyInstance } from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import { PERMISSIONS } from "src/constants/permissions";
import { UuidIdParam } from "src/lib/http/common-schemas";
import { commonErrorResponses } from "src/lib/http/response";
import { createWhatsAppMediaService } from "src/modules/whatsapp/whatsapp.media.service";

export default async function whatsappMessageMediaRoutes(fastify: FastifyInstance) {
  const app = fastify.withTypeProvider<ZodTypeProvider>();
  const media = createWhatsAppMediaService(fastify);

  app.get(
    "/:id/media",
    {
      schema: {
        summary: "Authenticated proxy for protected WhatsApp media (no Meta token to the browser)",
        operationId: "getWhatsAppMessageMedia",
        tags: ["WhatsApp"],
        permissions: [PERMISSIONS.WHATSAPP_READ],
        params: UuidIdParam,
        response: {
          ...commonErrorResponses,
        },
      },
    },
    async (request, reply) => {
      const file = await media.openProtectedMedia(request.params.id);
      reply.header("Content-Type", file.contentType);
      reply.header("X-Content-Type-Options", "nosniff");
      reply.header("Cache-Control", "private, max-age=60");
      reply.header(
        "Content-Disposition",
        `${file.inline ? "inline" : "attachment"}; filename="${encodeURIComponent(file.filename)}"`,
      );
      return reply.send(file.body as never);
    },
  );
}
