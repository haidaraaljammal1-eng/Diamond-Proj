import type { FastifyInstance } from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import { z } from "zod";
import { createSettingsService } from "src/modules/settings/settings.service";
import {
  SettingKeyParam,
  SettingSchema,
  UpsertSettingSchema,
} from "src/modules/settings/settings.schema";
import { commonErrorResponses, dataResponse } from "src/lib/http/response";
import { PERMISSIONS } from "src/constants/permissions";

export default async function settingsAdminRoutes(fastify: FastifyInstance) {
  const app = fastify.withTypeProvider<ZodTypeProvider>();
  const settings = createSettingsService(fastify);

  app.get(
    "/",
    {
      schema: {
        summary: "List settings",
        operationId: "listSettings",
        tags: ["Settings"],
        permissions: [PERMISSIONS.SETTINGS_READ],
        response: { 200: dataResponse(z.array(SettingSchema)), ...commonErrorResponses },
      },
    },
    async () => ({ data: await settings.list() }),
  );

  app.get(
    "/:key",
    {
      schema: {
        summary: "Get a setting",
        operationId: "getSetting",
        tags: ["Settings"],
        permissions: [PERMISSIONS.SETTINGS_READ],
        params: SettingKeyParam,
        response: { 200: dataResponse(SettingSchema), ...commonErrorResponses },
      },
    },
    async (request) => ({ data: await settings.get(request.params.key) }),
  );

  app.put(
    "/:key",
    {
      schema: {
        summary: "Create or update a setting",
        operationId: "upsertSetting",
        tags: ["Settings"],
        permissions: [PERMISSIONS.SETTINGS_MANAGE],
        params: SettingKeyParam,
        body: UpsertSettingSchema,
        response: { 200: dataResponse(SettingSchema), ...commonErrorResponses },
      },
    },
    async (request) => {
      const setting = await settings.upsert(request.params.key, request.body);
      request.setAudit({
        action: "settings.upsert",
        entityType: "setting",
        entityId: request.params.key,
      });
      return { data: setting };
    },
  );
}
