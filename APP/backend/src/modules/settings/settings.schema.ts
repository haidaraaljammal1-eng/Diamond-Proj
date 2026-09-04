import { z } from "zod";

export const SettingTypeSchema = z.enum(["STRING", "NUMBER", "BOOLEAN", "JSON"]);

export const SettingSchema = z.object({
  key: z.string(),
  value: z.string(),
  type: SettingTypeSchema,
  scope: z.string().nullable(),
  isPublic: z.boolean(),
  isSecret: z.boolean(),
  description: z.string().nullable(),
  updatedAt: z.date(),
});

export const PublicSettingSchema = z.object({
  key: z.string(),
  value: z.string(),
  type: SettingTypeSchema,
});

export const UpsertSettingSchema = z.object({
  value: z.string(),
  type: SettingTypeSchema.optional(),
  scope: z.string().max(100).optional(),
  isPublic: z.boolean().optional(),
  isSecret: z.boolean().optional(),
  description: z.string().max(500).optional(),
});

export const SettingKeyParam = z.object({
  key: z
    .string()
    .trim()
    .regex(/^[a-zA-Z0-9._-]+$/, "invalid setting key")
    .max(200),
});
