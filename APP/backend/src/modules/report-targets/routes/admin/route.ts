import type { FastifyInstance } from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import { z } from "zod";
import { NumericIdParam } from "src/lib/http/common-schemas";
import { commonErrorResponses, dataResponse } from "src/lib/http/response";
import { requireAuth } from "src/lib/context/auth-context";
import { PERMISSIONS } from "src/constants/permissions";
import { createReportTargetsService } from "src/modules/reports/report-targets.service";
import { CreateKpiTargetSchema, KpiTargetSchema } from "src/modules/reports/reports.schema";

const T = ["Report Targets"];

/** Mounts under /report-targets. */
export default async function reportTargetsRoutes(fastify: FastifyInstance) {
  const app = fastify.withTypeProvider<ZodTypeProvider>();
  const svc = createReportTargetsService(fastify);
  const P = PERMISSIONS;

  app.get("/", { schema: { summary: "List KPI targets", operationId: "listKpiTargets", tags: T, permissions: [P.REPORT_TARGETS_READ], querystring: z.object({ kpiCode: z.string().optional() }), response: { 200: dataResponse(z.array(KpiTargetSchema)), ...commonErrorResponses } } },
    async (request) => ({ data: await svc.list(request.query) }));

  app.post("/", { schema: { summary: "Create a KPI target", operationId: "createKpiTarget", tags: T, permissions: [P.REPORT_TARGETS_MANAGE], body: CreateKpiTargetSchema, response: { 200: dataResponse(KpiTargetSchema), ...commonErrorResponses } } },
    async (request) => { request.setAudit({ action: "report_targets.create", entityType: "report_kpi_target", metadata: { kpiCode: request.body.kpiCode } }); return { data: await svc.create(request.body, requireAuth(request)) }; });

  app.delete("/:id", { schema: { summary: "Delete a KPI target", operationId: "deleteKpiTarget", tags: T, permissions: [P.REPORT_TARGETS_MANAGE], params: NumericIdParam, response: { 200: dataResponse(z.object({ deleted: z.boolean() })), ...commonErrorResponses } } },
    async (request) => { request.setAudit({ action: "report_targets.delete", entityType: "report_kpi_target", entityId: String(request.params.id) }); return { data: await svc.remove(request.params.id) }; });
}
