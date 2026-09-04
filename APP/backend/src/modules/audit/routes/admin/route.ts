import type { FastifyInstance } from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import { createAuditService } from "src/modules/audit/audit.service";
import { AuditLogSchema, ListAuditQuerySchema } from "src/modules/audit/audit.schema";
import { commonErrorResponses, listResponse } from "src/lib/http/response";
import { PERMISSIONS } from "src/constants/permissions";

export default async function auditRoutes(fastify: FastifyInstance) {
  const app = fastify.withTypeProvider<ZodTypeProvider>();
  const audit = createAuditService(fastify);

  app.get(
    "/",
    {
      schema: {
        summary: "List audit log entries",
        operationId: "listAuditLogs",
        tags: ["Audit"],
        permissions: [PERMISSIONS.AUDIT_READ],
        querystring: ListAuditQuerySchema,
        response: { 200: listResponse(AuditLogSchema), ...commonErrorResponses },
      },
    },
    async (request) => audit.list(request.query),
  );
}
