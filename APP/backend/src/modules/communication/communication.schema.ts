import { z } from "zod";
import { PaginationQuerySchema } from "src/lib/http/pagination";
import { BooleanQueryParam } from "src/lib/master-data/code";

export const CommunicationChannelSchema = z.enum(["EMAIL", "WHATSAPP", "SMS"]);
export const TemplateVersionStatusSchema = z.enum(["DRAFT", "PUBLISHED", "SUPERSEDED"]);
export const TemplateLanguageSchema = z.enum(["en", "ar"]);

const TemplateCode = z
  .string()
  .trim()
  .min(1)
  .max(50)
  .regex(/^[A-Za-z0-9][A-Za-z0-9_-]*$/, "code must be alphanumeric with optional - or _");

export const MessageTemplatePublicSchema = z.object({
  id: z.number().int(),
  code: z.string(),
  name: z.string(),
  channel: CommunicationChannelSchema,
  description: z.string().nullable(),
  isActive: z.boolean(),
  currentVersionId: z.number().int().nullable(),
  createdById: z.number().int(),
  createdAt: z.date(),
  updatedAt: z.date(),
});

export const ListTemplatesQuerySchema = PaginationQuerySchema.extend({
  search: z.string().trim().min(1).optional(),
  channel: CommunicationChannelSchema.optional(),
  active: BooleanQueryParam,
  sort: z.string().optional(),
});

export const CreateTemplateSchema = z.object({
  code: TemplateCode,
  name: z.string().trim().min(1).max(200),
  channel: CommunicationChannelSchema,
  description: z.string().trim().max(2000).optional(),
});

export const UpdateTemplateSchema = z
  .object({
    code: TemplateCode, // immutable — a changed value is rejected
    name: z.string().trim().min(1).max(200),
    description: z.string().trim().max(2000).nullable(),
  })
  .partial();

// --- Version + content (read) ---

export const TemplateButtonSchema = z.object({
  id: z.number().int(),
  label: z.string(),
  urlTemplate: z.string(),
  sortOrder: z.number().int(),
});

export const TemplateVariantSchema = z.object({
  id: z.number().int(),
  language: z.string(),
  subject: z.string().nullable(),
  bodyHtml: z.string().nullable(),
  bodyText: z.string().nullable(),
  providerTemplateName: z.string().nullable(),
  providerLanguageCode: z.string().nullable(),
  buttons: z.array(TemplateButtonSchema),
});

export const TemplateVersionSummarySchema = z.object({
  id: z.number().int(),
  templateId: z.number().int(),
  versionNumber: z.number().int(),
  status: TemplateVersionStatusSchema,
  revision: z.number().int(),
  publishedAt: z.date().nullable(),
  publishedById: z.number().int().nullable(),
  isCurrent: z.boolean(),
  createdAt: z.date(),
  updatedAt: z.date(),
});

export const TemplateVersionDetailSchema = TemplateVersionSummarySchema.extend({
  channel: CommunicationChannelSchema,
  variants: z.array(TemplateVariantSchema),
});

// --- Content update (builder) ---

const ButtonInput = z.object({
  label: z.string().trim().min(1).max(120),
  urlTemplate: z.string().trim().min(1).max(2000),
});

const VariantInput = z.object({
  language: TemplateLanguageSchema,
  subject: z.string().trim().max(300).optional(),
  bodyHtml: z.string().max(50_000).optional(),
  bodyText: z.string().max(10_000).optional(),
  providerTemplateName: z.string().trim().max(200).optional(),
  providerLanguageCode: z.string().trim().max(20).optional(),
  buttons: z.array(ButtonInput).max(10).optional(),
});

export const UpdateTemplateContentSchema = z.object({
  revision: z.number().int().min(0),
  variants: z.array(VariantInput).min(1).max(2),
});
export type UpdateTemplateContentBody = z.infer<typeof UpdateTemplateContentSchema>;

// --- Collapsed single-template content (versioning hidden from the UX) ---
// The template edit screen loads + saves the LIVE content in one call. The
// backend manages the underlying draft → publish → supersede internally, so
// history (messages already sent, bound to older immutable versions) is never
// rewritten. No `revision` is exposed — the user edits one simple template.
export const MessageTemplateContentSchema = MessageTemplatePublicSchema.extend({
  variants: z.array(TemplateVariantSchema),
});

export const SaveTemplateContentSchema = z.object({
  variants: z.array(VariantInput).min(1).max(2),
});
export type SaveTemplateContentBody = z.infer<typeof SaveTemplateContentSchema>;

// --- Validation report ---

export const TemplateIssueSchema = z.object({
  reason: z.string(),
  code: z.string(),
  path: z.string(),
  message: z.string(),
  suggestedAction: z.string().optional(),
});
export const TemplateValidationReportSchema = z.object({
  valid: z.boolean(),
  issues: z.array(TemplateIssueSchema),
});

// --- Variables registry ---

export const TemplateVariableSchema = z.object({
  key: z.string(),
  labelEn: z.string(),
  labelAr: z.string(),
  description: z.string(),
  channels: z.array(CommunicationChannelSchema),
  example: z.string(),
});

// --- Preview ---

export const TemplatePreviewSchema = z.object({
  templateVersionId: z.number().int(),
  language: TemplateLanguageSchema.optional(),
  // Optional real experience to render against (must be readable by the caller).
  purchaseExperienceId: z.number().int().positive().optional(),
});

export const RenderedButtonSchema = z.object({ label: z.string(), url: z.string() });
export const TemplatePreviewResultSchema = z.object({
  channel: CommunicationChannelSchema,
  language: z.string(),
  subject: z.string().nullable(),
  html: z.string().nullable(),
  text: z.string(),
  buttons: z.array(RenderedButtonSchema),
  usedSampleData: z.boolean(),
});

export const ListTemplateVersionsQuerySchema = PaginationQuerySchema.extend({
  status: TemplateVersionStatusSchema.optional(),
});
