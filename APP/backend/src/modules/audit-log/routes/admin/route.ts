import type { FastifyInstance } from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import { z } from "zod";
import { commonErrorResponses, dataResponse, listResponse } from "src/lib/http/response";
import { PERMISSIONS } from "src/constants/permissions";
import { createReportSecurityService } from "src/modules/reports/report-security.service";
import { AuditExportQuerySchema, AuditLogEntrySchema, AuditLogItemSchema, AuditLogQuerySchema, AuditLogStatsSchema, AuditStatsQuerySchema } from "src/modules/reports/reports.schema";

/** Mounts under /audit-log. Read + export ONLY — the audit log is immutable
 *  (no update or delete endpoint exists). */
export default async function auditLogRoutes(fastify: FastifyInstance) {
  const app = fastify.withTypeProvider<ZodTypeProvider>();
  const svc = createReportSecurityService(fastify);
  const P = PERMISSIONS;

  app.get("/", { schema: { summary: "Read the audit log", operationId: "listAuditLog", tags: ["Audit Log"], permissions: [P.AUDIT_LOG_READ], querystring: AuditLogQuerySchema, response: { 200: listResponse(AuditLogItemSchema), ...commonErrorResponses } } },
    async (request) => svc.listAudit(request.query));

  app.get("/stats", { schema: { summary: "Audit log summary counts (same filters as the list)", operationId: "getAuditLogStats", tags: ["Audit Log"], permissions: [P.AUDIT_LOG_READ], querystring: AuditStatsQuerySchema, response: { 200: dataResponse(AuditLogStatsSchema), ...commonErrorResponses } } },
    async (request) => ({ data: await svc.auditStats(request.query) }));

  app.get("/:id", { schema: { summary: "Read one audit log entry", operationId: "getAuditLogEntry", tags: ["Audit Log"], permissions: [P.AUDIT_LOG_READ], params: z.object({ id: z.string() }), response: { 200: dataResponse(AuditLogEntrySchema), ...commonErrorResponses } } },
    async (request) => ({ data: await svc.getAuditEntry(request.params.id) }));

  app.get("/export", { schema: { summary: "Export the audit log (CSV/XLSX)", operationId: "exportAuditLog", tags: ["Audit Log"], permissions: [P.AUDIT_LOG_EXPORT], querystring: AuditExportQuerySchema } },
    async (request, reply) => {
      const out = await svc.exportAudit(request.query);
      const date = new Date().toISOString().slice(0, 10);
      request.setAudit({ action: "audit_log.export", entityType: "audit_log", metadata: { format: request.query.format } });
      reply.header("content-type", out.contentType).header("content-disposition", `attachment; filename="audit-log-${date}.${out.ext}"`);
      return reply.send(out.buffer);
    });
}
