import type { FastifyInstance } from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import { commonErrorResponses, dataResponse } from "src/lib/http/response";
import { z } from "zod";
import { PERMISSIONS } from "src/constants/permissions";
import { createCommunicationService } from "src/modules/communication/communication.service";
import { TemplateVariableSchema } from "src/modules/communication/communication.schema";

/** Mounts under /communication-template-variables. */
export default async function communicationTemplateVariablesRoutes(fastify: FastifyInstance) {
  const app = fastify.withTypeProvider<ZodTypeProvider>();
  const svc = createCommunicationService(fastify);

  app.get(
    "/",
    {
      schema: {
        summary: "List the allowed template variables",
        operationId: "listCommunicationTemplateVariables",
        tags: ["Communication Templates"],
        permissions: [PERMISSIONS.COMMUNICATION_TEMPLATES_READ],
        response: { 200: dataResponse(z.array(TemplateVariableSchema)), ...commonErrorResponses },
      },
    },
    async () => ({ data: svc.listVariables() }),
  );
}
