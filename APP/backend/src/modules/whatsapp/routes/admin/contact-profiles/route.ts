import type { FastifyInstance } from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import { PERMISSIONS } from "src/constants/permissions";
import { commonErrorResponses, listResponse } from "src/lib/http/response";
import { PaginationQuerySchema } from "src/lib/http/pagination";
import { z } from "zod";
import { createWhatsAppContactProfileService } from "src/modules/whatsapp/whatsapp.contact-profile.service";

const T = ["WhatsApp"];

export const WhatsAppContactProfileListItemSchema = z.object({
  id: z.string().uuid(),
  providerContactId: z.string(),
  displayName: z.string().nullable(),
  hasProfilePicture: z.boolean(),
  conversationId: z.string().uuid().nullable(),
});

const ListQuerySchema = PaginationQuerySchema.extend({
  search: z.string().trim().min(1).max(100).optional(),
});

export default async function whatsappContactProfileRoutes(fastify: FastifyInstance) {
  const app = fastify.withTypeProvider<ZodTypeProvider>();
  const profiles = createWhatsAppContactProfileService(fastify);

  app.get(
    "/",
    {
      schema: {
        summary: "List synced Whapi contact profiles (direct only; read-only)",
        operationId: "listWhatsAppContactProfiles",
        tags: T,
        permissions: [PERMISSIONS.WHATSAPP_READ],
        querystring: ListQuerySchema,
        response: {
          200: listResponse(WhatsAppContactProfileListItemSchema),
          ...commonErrorResponses,
        },
      },
    },
    async (request) => profiles.list(request.query),
  );
}
