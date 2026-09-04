import type { FastifyInstance } from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import { requireAuth } from "src/lib/context/auth-context";
import { NumericIdParam } from "src/lib/http/common-schemas";
import {
  commonErrorResponses,
  dataResponse,
  listResponse,
  MessageResponseSchema,
} from "src/lib/http/response";
import { PERMISSIONS } from "src/constants/permissions";
import { t } from "src/config/i18n";
import { createCommunicationService } from "src/modules/communication/communication.service";
import {
  CreateTemplateSchema,
  ListTemplatesQuerySchema,
  ListTemplateVersionsQuerySchema,
  MessageTemplateContentSchema,
  MessageTemplatePublicSchema,
  SaveTemplateContentSchema,
  TemplateVersionDetailSchema,
  TemplateVersionSummarySchema,
  UpdateTemplateSchema,
} from "src/modules/communication/communication.schema";

export default async function communicationTemplatesRoutes(fastify: FastifyInstance) {
  const app = fastify.withTypeProvider<ZodTypeProvider>();
  const svc = createCommunicationService(fastify);

  app.get(
    "/",
    {
      schema: {
        summary: "List communication templates",
        operationId: "listCommunicationTemplates",
        tags: ["Communication Templates"],
        permissions: [PERMISSIONS.COMMUNICATION_TEMPLATES_READ],
        querystring: ListTemplatesQuerySchema,
        response: { 200: listResponse(MessageTemplatePublicSchema), ...commonErrorResponses },
      },
    },
    async (request) => svc.listTemplates(request.query),
  );

  app.get(
    "/:id",
    {
      schema: {
        summary: "Get a communication template",
        operationId: "getCommunicationTemplate",
        tags: ["Communication Templates"],
        permissions: [PERMISSIONS.COMMUNICATION_TEMPLATES_READ],
        params: NumericIdParam,
        response: { 200: dataResponse(MessageTemplatePublicSchema), ...commonErrorResponses },
      },
    },
    async (request) => ({ data: await svc.getTemplate(request.params.id) }),
  );

  app.post(
    "/",
    {
      schema: {
        summary: "Create a communication template (with an initial draft version)",
        operationId: "createCommunicationTemplate",
        tags: ["Communication Templates"],
        permissions: [PERMISSIONS.COMMUNICATION_TEMPLATES_MANAGE],
        body: CreateTemplateSchema,
        response: { 201: dataResponse(MessageTemplatePublicSchema), ...commonErrorResponses },
      },
    },
    async (request, reply) => {
      const t = await svc.createTemplate(request.body, requireAuth(request).id);
      request.setAudit({ action: "communication_templates.create", entityType: "communication_template", entityId: String(t.id), metadata: { templateId: t.id, channel: t.channel } });
      reply.status(201);
      return { data: t };
    },
  );

  app.put(
    "/:id",
    {
      schema: {
        summary: "Update template metadata (code is immutable)",
        operationId: "updateCommunicationTemplate",
        tags: ["Communication Templates"],
        permissions: [PERMISSIONS.COMMUNICATION_TEMPLATES_MANAGE],
        params: NumericIdParam,
        body: UpdateTemplateSchema,
        response: { 200: dataResponse(MessageTemplatePublicSchema), ...commonErrorResponses },
      },
    },
    async (request) => {
      const t = await svc.updateTemplate(request.params.id, request.body);
      request.setAudit({ action: "communication_templates.update", entityType: "communication_template", entityId: String(request.params.id), metadata: { templateId: request.params.id } });
      return { data: t };
    },
  );

  // ── Collapsed single-template content (versioning hidden from the UX) ────────
  // The edit screen loads + saves the template's LIVE content via these two
  // template-level routes; the backend manages draft → publish → supersede
  // internally, so messages already sent (bound to older immutable versions) keep
  // their historical content. No version ids or version steps reach the client.
  app.get(
    "/:id/content",
    {
      schema: {
        summary: "Get a template with its live editable content",
        operationId: "getCommunicationTemplateContent",
        tags: ["Communication Templates"],
        permissions: [PERMISSIONS.COMMUNICATION_TEMPLATES_READ],
        params: NumericIdParam,
        response: { 200: dataResponse(MessageTemplateContentSchema), ...commonErrorResponses },
      },
    },
    async (request) => ({ data: await svc.getTemplateContent(request.params.id) }),
  );

  app.put(
    "/:id/content",
    {
      schema: {
        summary: "Save a template's content (updates + publishes it in one step)",
        operationId: "saveCommunicationTemplateContent",
        tags: ["Communication Templates"],
        permissions: [PERMISSIONS.COMMUNICATION_TEMPLATES_MANAGE],
        params: NumericIdParam,
        body: SaveTemplateContentSchema,
        response: { 200: dataResponse(MessageTemplateContentSchema), ...commonErrorResponses },
      },
    },
    async (request) => {
      const saved = await svc.saveTemplateContent(request.params.id, request.body, requireAuth(request).id);
      request.setAudit({
        action: "communication_templates.update",
        entityType: "communication_template",
        entityId: String(request.params.id),
        metadata: { templateId: request.params.id, currentVersionId: saved.currentVersionId },
      });
      return { data: saved };
    },
  );

  app.delete(
    "/:id",
    {
      schema: {
        summary: "Delete a communication template (only when unreferenced)",
        operationId: "deleteCommunicationTemplate",
        tags: ["Communication Templates"],
        permissions: [PERMISSIONS.COMMUNICATION_TEMPLATES_MANAGE],
        params: NumericIdParam,
        response: { 200: MessageResponseSchema, ...commonErrorResponses },
      },
    },
    async (request) => {
      await svc.deleteTemplate(request.params.id);
      request.setAudit({
        action: "communication_templates.delete",
        entityType: "communication_template",
        entityId: String(request.params.id),
        metadata: { templateId: request.params.id },
      });
      return { data: { message: t("Deleted", { lng: request.language }) } };
    },
  );

  app.get(
    "/:id/versions",
    {
      schema: {
        summary: "List a template's versions",
        operationId: "listCommunicationTemplateVersions",
        tags: ["Communication Templates"],
        permissions: [PERMISSIONS.COMMUNICATION_TEMPLATES_READ],
        params: NumericIdParam,
        querystring: ListTemplateVersionsQuerySchema,
        response: { 200: listResponse(TemplateVersionSummarySchema), ...commonErrorResponses },
      },
    },
    async (request) => svc.listVersions(request.params.id, request.query),
  );

  app.post(
    "/:id/draft",
    {
      schema: {
        summary: "Create a new draft version from the current published version",
        operationId: "createCommunicationTemplateDraft",
        tags: ["Communication Templates"],
        permissions: [PERMISSIONS.COMMUNICATION_TEMPLATES_MANAGE],
        params: NumericIdParam,
        response: { 201: dataResponse(TemplateVersionDetailSchema), ...commonErrorResponses },
      },
    },
    async (request, reply) => {
      const draft = await svc.createDraft(request.params.id);
      request.setAudit({ action: "communication_template_versions.create_draft", entityType: "communication_template_version", entityId: String(draft.id), metadata: { templateId: request.params.id, versionId: draft.id, versionNumber: draft.versionNumber } });
      reply.status(201);
      return { data: draft };
    },
  );
}
