import type { FastifyInstance } from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import { requireAuth } from "src/lib/context/auth-context";
import { NumericIdParam } from "src/lib/http/common-schemas";
import { commonErrorResponses, dataResponse } from "src/lib/http/response";
import { PERMISSIONS } from "src/constants/permissions";
import { createCommunicationService } from "src/modules/communication/communication.service";
import {
  TemplateValidationReportSchema,
  TemplateVersionDetailSchema,
  TemplateVersionSummarySchema,
  UpdateTemplateContentSchema,
} from "src/modules/communication/communication.schema";

/** Version-scoped template builder routes. Mounts under /communication-template-versions. */
export default async function communicationTemplateVersionsRoutes(fastify: FastifyInstance) {
  const app = fastify.withTypeProvider<ZodTypeProvider>();
  const svc = createCommunicationService(fastify);

  app.get(
    "/:id",
    {
      schema: {
        summary: "Get a template version with its full content",
        operationId: "getCommunicationTemplateVersion",
        tags: ["Communication Template Versions"],
        permissions: [PERMISSIONS.COMMUNICATION_TEMPLATES_READ],
        params: NumericIdParam,
        response: { 200: dataResponse(TemplateVersionDetailSchema), ...commonErrorResponses },
      },
    },
    async (request) => ({ data: await svc.getVersion(request.params.id) }),
  );

  app.put(
    "/:id/content",
    {
      schema: {
        summary: "Replace a draft version's content (sanitized + validated, transactional)",
        operationId: "updateCommunicationTemplateVersionContent",
        tags: ["Communication Template Versions"],
        permissions: [PERMISSIONS.COMMUNICATION_TEMPLATES_MANAGE],
        params: NumericIdParam,
        body: UpdateTemplateContentSchema,
        response: { 200: dataResponse(TemplateVersionDetailSchema), ...commonErrorResponses },
      },
    },
    async (request) => {
      const version = await svc.updateContent(request.params.id, request.body);
      request.setAudit({ action: "communication_template_versions.content_updated", entityType: "communication_template_version", entityId: String(request.params.id), metadata: { versionId: request.params.id, revision: version.revision } });
      return { data: version };
    },
  );

  app.post(
    "/:id/validate",
    {
      schema: {
        summary: "Validate a template version's content (writes nothing)",
        operationId: "validateCommunicationTemplateVersion",
        tags: ["Communication Template Versions"],
        permissions: [PERMISSIONS.COMMUNICATION_TEMPLATES_READ],
        params: NumericIdParam,
        response: { 200: dataResponse(TemplateValidationReportSchema), ...commonErrorResponses },
      },
    },
    async (request) => ({ data: await svc.validateVersion(request.params.id) }),
  );

  app.post(
    "/:id/publish",
    {
      schema: {
        summary: "Publish a draft template version (validated + atomic)",
        operationId: "publishCommunicationTemplateVersion",
        tags: ["Communication Template Versions"],
        permissions: [PERMISSIONS.COMMUNICATION_TEMPLATES_PUBLISH],
        params: NumericIdParam,
        response: { 200: dataResponse(TemplateVersionSummarySchema), ...commonErrorResponses },
      },
    },
    async (request) => {
      const version = await svc.publish(request.params.id, requireAuth(request).id);
      request.setAudit({ action: "communication_template_versions.publish", entityType: "communication_template_version", entityId: String(request.params.id), metadata: { templateId: version.templateId, versionId: version.id, versionNumber: version.versionNumber } });
      return { data: version };
    },
  );
}
