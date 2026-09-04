import { z } from "zod";
import { CATALOG_KINDS, CatalogKind } from "./catalog";

const stringMap = z.record(z.string(), z.string());

export const SaveConfigSchema = z.object({
  config: stringMap.default(() => ({})),
  secrets: stringMap.default(() => ({})),
  enabled: z.boolean().optional(),
});

export const KindParamsSchema = z.object({
  kind: z.enum(CATALOG_KINDS as [CatalogKind, ...CatalogKind[]]),
});

export const SendTestSchema = z.object({
  to: z.string().trim().min(1).max(200),
  message: z.string().max(1000).optional(),
});

export const IntegrationDtoSchema = z.object({
  kind: z.string(),
  name: z.string(),
  status: z.string(),
  configured: z.boolean(),
  enabled: z.boolean(),
  lastHealthCheckAt: z.string().nullable(),
  lastSuccessAt: z.string().nullable(),
  lastErrorCode: z.string().nullable(),
  config: z.record(z.string(), z.string()),
  secretHints: z.record(z.string(), z.string()),
  supportsSendTest: z.boolean(),
  fields: z.array(z.object({
    key: z.string(), type: z.string(), secret: z.boolean(), required: z.boolean(),
    i18nKey: z.string(), options: z.array(z.string()).optional(),
    showWhen: z.object({ field: z.string(), equals: z.string() }).optional(),
  })),
});

export const TestResultDtoSchema = z.object({
  status: z.enum(["CONNECTED", "FAILED"]),
  code: z.string().nullable(),
  detail: z.string().nullable(),
});
