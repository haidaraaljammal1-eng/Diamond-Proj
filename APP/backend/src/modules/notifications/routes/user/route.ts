import type { FastifyInstance } from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import { createNotificationsService } from "src/modules/notifications/notifications.service";
import {
  ListNotificationsQuerySchema,
  NotificationSchema,
  PreferencesResponseSchema,
  UnreadCountResponseSchema,
  UpdatePreferencesSchema,
} from "src/modules/notifications/notifications.schema";
import { UuidIdParam } from "src/lib/http/common-schemas";
import {
  commonErrorResponses,
  listResponse,
  MessageResponseSchema,
} from "src/lib/http/response";
import { requireAuth } from "src/lib/context/auth-context";
import { t } from "src/config/i18n";

/** Own-inbox only. Every query is scoped to the authenticated user's id. */
export default async function notificationUserRoutes(fastify: FastifyInstance) {
  const app = fastify.withTypeProvider<ZodTypeProvider>();
  const notifications = createNotificationsService(fastify);

  app.get(
    "/",
    {
      schema: {
        summary: "List my notifications",
        operationId: "listMyNotifications",
        tags: ["Notifications"],
        querystring: ListNotificationsQuerySchema,
        response: { 200: listResponse(NotificationSchema), ...commonErrorResponses },
      },
    },
    async (request) => notifications.list(requireAuth(request).id, request.query),
  );

  app.get(
    "/unread-count",
    {
      schema: {
        summary: "My unread notification count",
        operationId: "myUnreadCount",
        tags: ["Notifications"],
        response: { 200: UnreadCountResponseSchema, ...commonErrorResponses },
      },
    },
    async (request) => ({
      data: { count: await notifications.unreadCount(requireAuth(request).id) },
    }),
  );

  app.patch(
    "/read-all",
    {
      schema: {
        summary: "Mark all my notifications read",
        operationId: "markAllNotificationsRead",
        tags: ["Notifications"],
        response: { 200: MessageResponseSchema, ...commonErrorResponses },
      },
    },
    async (request) => {
      await notifications.markAllRead(requireAuth(request).id);
      return {
        data: {
          message: t("All notifications marked as read", { lng: request.language }),
        },
      };
    },
  );

  app.patch(
    "/:id/read",
    {
      schema: {
        summary: "Mark a notification read",
        operationId: "markNotificationRead",
        tags: ["Notifications"],
        params: UuidIdParam,
        response: { 200: MessageResponseSchema, ...commonErrorResponses },
      },
    },
    async (request) => {
      await notifications.markRead(requireAuth(request).id, request.params.id);
      return {
        data: { message: t("Notification marked as read", { lng: request.language }) },
      };
    },
  );

  app.get(
    "/preferences",
    {
      schema: {
        summary: "Get my notification preferences",
        operationId: "getMyNotificationPreferences",
        tags: ["Notifications"],
        response: { 200: PreferencesResponseSchema, ...commonErrorResponses },
      },
    },
    async (request) => ({
      data: await notifications.getPreferences(requireAuth(request).id),
    }),
  );

  app.put(
    "/preferences",
    {
      schema: {
        summary: "Update my notification preferences",
        operationId: "updateMyNotificationPreferences",
        tags: ["Notifications"],
        body: UpdatePreferencesSchema,
        response: { 200: PreferencesResponseSchema, ...commonErrorResponses },
      },
    },
    async (request) => ({
      data: await notifications.updatePreferences(requireAuth(request).id, request.body),
    }),
  );
}
