import { z } from "zod";
import { PaginationQuerySchema } from "src/lib/http/pagination";

const ChannelSchema = z.enum(["IN_APP", "EMAIL", "PUSH", "SMS"]);

export const NotificationSchema = z.object({
  id: z.string(),
  eventKey: z.string(),
  title: z.string(),
  body: z.string(),
  data: z.any().nullable(),
  readAt: z.date().nullable(),
  createdAt: z.date(),
});

export const ListNotificationsQuerySchema = PaginationQuerySchema.extend({
  unreadOnly: z
    .enum(["true", "false"])
    .optional()
    .transform((v) => v === "true"),
});

export const UnreadCountResponseSchema = z.object({
  data: z.object({ count: z.number().int() }),
});

export const PreferenceSchema = z.object({
  eventKey: z.string(),
  enabled: z.boolean(),
  channels: z.array(z.string()),
});

export const PreferencesResponseSchema = z.object({
  data: z.array(PreferenceSchema),
});

export const UpdatePreferencesSchema = z.object({
  preferences: z.array(
    z.object({
      eventKey: z.string().min(1),
      enabled: z.boolean(),
      channels: z.array(ChannelSchema),
    }),
  ),
});

export const BroadcastSchema = z.object({
  eventKey: z.string().min(1),
  title: z.string().min(1).max(200),
  body: z.string().min(1).max(2000),
  data: z.record(z.string(), z.any()).optional(),
  userIds: z.array(z.number().int().positive()).optional(),
  toAllActive: z.boolean().default(false),
});
