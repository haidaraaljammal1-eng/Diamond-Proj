import type { FastifyInstance } from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import { PERMISSIONS } from "src/constants/permissions";
import { commonErrorResponses, listResponse } from "src/lib/http/response";
import { createWhatsAppTemplateService } from "src/modules/whatsapp/whatsapp.template.service";
import { WhatsAppTemplateSchema } from "src/modules/whatsapp/whatsapp.schema";

export default async function whatsappTemplateRoutes(fastify: FastifyInstance) {
  const app = fastify.withTypeProvider<ZodTypeProvider>();
  const templates = createWhatsAppTemplateService(fastify);

  app.get(
    "/",
    {
      schema: {
        summary: "List WhatsApp message templates for the active office WABA",
        operationId: "listWhatsAppTemplates",
        tags: ["WhatsApp"],
        permissions: [PERMISSIONS.WHATSAPP_SEND],
        response: {
          200: listResponse(WhatsAppTemplateSchema),
          ...commonErrorResponses,
        },
      },
    },
    async () => {
      const data = await templates.list();
      return { data, meta: { page: 1, pageSize: Math.max(data.length, 1), total: data.length, totalPages: 1 } };
    },
  );
}
