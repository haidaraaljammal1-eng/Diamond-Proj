import type { FastifyInstance } from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import { z } from "zod";
import { createNotificationsService } from "src/modules/notifications/notifications.service";
import { BroadcastSchema } from "src/modules/notifications/notifications.schema";
import { commonErrorResponses, dataResponse } from "src/lib/http/response";
import { PERMISSIONS } from "src/constants/permissions";

export default async function notificationAdminRoutes(fastify: FastifyInstance) {
  const app = fastify.withTypeProvider<ZodTypeProvider>();
  const notifications = createNotificationsService(fastify);

  app.post(
    "/broadcast",
    {
      schema: {
        summary: "Send a notification to recipients",
        operationId: "broadcastNotification",
        tags: ["Notifications"],
        permissions: [PERMISSIONS.NOTIFICATIONS_MANAGE],
        body: BroadcastSchema,
        response: {
          200: dataResponse(z.object({ recipients: z.number().int() })),
          ...commonErrorResponses,
        },
      },
    },
    async (request) => {
      const result = await notifications.broadcast(request.body);
      request.setAudit({
        action: "notifications.broadcast",
        metadata: { eventKey: request.body.eventKey, recipients: result.recipients },
      });
      return { data: result };
    },
  );
}
