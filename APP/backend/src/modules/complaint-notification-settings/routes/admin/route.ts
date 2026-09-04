import type { FastifyInstance } from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import { commonErrorResponses, dataResponse } from "src/lib/http/response";
import { PERMISSIONS } from "src/constants/permissions";
import { createComplaintNotificationSettingsService } from "src/modules/complaint-notification-settings/complaint-notification-settings.service";
import {
  ComplaintNotificationSettingSchema,
  ComplaintNotificationSettingsSchema,
  ComplaintNotifEventKeyParam,
  UpdateComplaintNotificationSettingSchema,
} from "src/modules/complaints/complaints.schema";

const T = ["Complaint Notifications"];

/** Mounts under /complaint-notification-settings. Read + write both require
 *  complaint_notifications.manage (there is no separate read permission). */
export default async function complaintNotificationSettingsRoutes(fastify: FastifyInstance) {
  const app = fastify.withTypeProvider<ZodTypeProvider>();
  const svc = createComplaintNotificationSettingsService(fastify);
  const P = PERMISSIONS;

  app.get(
    "/",
    { schema: { summary: "List complaint notification settings", operationId: "listComplaintNotificationSettings", tags: T, permissions: [P.COMPLAINT_NOTIFICATIONS_MANAGE], response: { 200: dataResponse(ComplaintNotificationSettingsSchema), ...commonErrorResponses } } },
    async () => ({ data: await svc.list() }),
  );

  app.put(
    "/:eventKey",
    { schema: { summary: "Update a complaint notification setting", operationId: "updateComplaintNotificationSetting", tags: T, permissions: [P.COMPLAINT_NOTIFICATIONS_MANAGE], params: ComplaintNotifEventKeyParam, body: UpdateComplaintNotificationSettingSchema, response: { 200: dataResponse(ComplaintNotificationSettingSchema), ...commonErrorResponses } } },
    async (request) => {
      request.setAudit({ action: "complaint_notifications.update", entityType: "complaint_notification_setting", entityId: `${request.params.eventKey}:${request.body.channel}` });
      return { data: await svc.update(request.params.eventKey, request.body) };
    },
  );
}
