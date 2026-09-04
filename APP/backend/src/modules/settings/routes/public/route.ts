import type { FastifyInstance } from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import { z } from "zod";
import { createSettingsService } from "src/modules/settings/settings.service";
import { PublicSettingSchema } from "src/modules/settings/settings.schema";
import { dataResponse } from "src/lib/http/response";

/** Only settings explicitly flagged isPublic (and not secret) are exposed. */
export default async function settingsPublicRoutes(fastify: FastifyInstance) {
  const app = fastify.withTypeProvider<ZodTypeProvider>();
  const settings = createSettingsService(fastify);

  app.get(
    "/public",
    {
      schema: {
        summary: "List public settings",
        operationId: "listPublicSettings",
        tags: ["Settings"],
        public: true,
        response: { 200: dataResponse(z.array(PublicSettingSchema)) },
      },
    },
    async () => ({ data: await settings.listPublic() }),
  );
}
