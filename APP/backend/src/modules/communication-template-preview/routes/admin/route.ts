import type { FastifyInstance } from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import { commonErrorResponses, dataResponse } from "src/lib/http/response";
import { PERMISSIONS } from "src/constants/permissions";
import { createCommunicationService } from "src/modules/communication/communication.service";
import {
  TemplatePreviewResultSchema,
  TemplatePreviewSchema,
} from "src/modules/communication/communication.schema";

/** Mounts under /communication-template-preview. Preview sends nothing + creates nothing. */
export default async function communicationTemplatePreviewRoutes(fastify: FastifyInstance) {
  const app = fastify.withTypeProvider<ZodTypeProvider>();
  const svc = createCommunicationService(fastify);

  app.post(
    "/",
    {
      schema: {
        summary: "Render a template version preview (no send, no invitation)",
        operationId: "previewCommunicationTemplate",
        tags: ["Communication Templates"],
        permissions: [PERMISSIONS.COMMUNICATION_TEMPLATES_READ],
        body: TemplatePreviewSchema,
        response: { 200: dataResponse(TemplatePreviewResultSchema), ...commonErrorResponses },
      },
    },
    async (request) => ({ data: await svc.preview(request.body) }),
  );
}
