import type { FastifyInstance } from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import { z } from "zod";
import { NumericIdParam, UuidIdParam } from "src/lib/http/common-schemas";
import { AppError } from "src/lib/errors/app-error";
import { commonErrorResponses, dataResponse } from "src/lib/http/response";
import { requireAuth, hasPermission } from "src/lib/context/auth-context";
import { resolveLanguage } from "src/config/i18n";
import { PERMISSIONS } from "src/constants/permissions";
import { createReportsService } from "src/modules/reports/reports.service";
import { createReportExecService } from "src/modules/reports/report-exec.service";
import { REPORT_BY_CODE } from "src/modules/reports/report-library";
import { reportNotFoundError } from "src/modules/reports/reports.errors";
import {
  ArtifactAccessSchema, ArtifactSchema, CallCenterAgentsSchema, CallCenterReportSchema,
  ComplaintReportSchema, ComplaintsSummarySchema, CreateScheduleSchema,
  ExecutiveKpisSchema, ExportQuerySchema, PeriodQuerySchema, ReportCodeParam,
  ReportLibrarySchema, RunReportSchema, ScheduleSchema,
} from "src/modules/reports/reports.schema";

const T = ["Reports"];

/**
 * Mounts under /reports.
 *
 * Every read below is period + branch scoped by the SAME resolver, and the report
 * preview/export endpoints run the SAME builder the tab endpoints run — so a screen,
 * a preview and a downloaded file can never disagree (prompt §2/§16).
 */
export default async function reportsRoutes(fastify: FastifyInstance) {
  const app = fastify.withTypeProvider<ZodTypeProvider>();
  const svc = createReportsService(fastify);
  const exec = createReportExecService(fastify);
  const P = PERMISSIONS;
  const assertReportPerm = (user: ReturnType<typeof requireAuth>, code: string) => {
    const def = REPORT_BY_CODE.get(code);
    if (!def) throw reportNotFoundError();
    if (!hasPermission(user, def.requiredPermission)) throw AppError.forbidden();
    return def;
  };

  // --- Executive ---
  app.get("/executive/kpis", { schema: { summary: "Executive KPI scorecard", operationId: "getExecutiveKpis", tags: T, permissions: [P.REPORTS_EXECUTIVE_READ], querystring: PeriodQuerySchema, response: { 200: dataResponse(ExecutiveKpisSchema), ...commonErrorResponses } } },
    async (request) => ({ data: await svc.executiveKpis(request.query, requireAuth(request)) }));

  // --- Complaints ---
  app.get("/complaints/overview", { schema: { summary: "Complaint report overview", operationId: "getComplaintReportOverview", tags: T, permissions: [P.REPORTS_COMPLAINTS_READ], querystring: PeriodQuerySchema, response: { 200: dataResponse(ComplaintReportSchema), ...commonErrorResponses } } },
    async (request) => ({ data: await svc.complaintOverview(request.query, requireAuth(request)) }));

  app.get("/complaints/summary", { schema: { summary: "Complaints summary rows", operationId: "getComplaintsSummary", tags: T, permissions: [P.REPORTS_COMPLAINTS_READ], querystring: PeriodQuerySchema, response: { 200: dataResponse(ComplaintsSummarySchema), ...commonErrorResponses } } },
    async (request) => ({ data: await svc.complaintsSummary(request.query, requireAuth(request)) }));

  // --- Call center ---
  app.get("/call-center/performance", { schema: { summary: "Call center period overview", operationId: "getCallCenterReport", tags: T, permissions: [P.REPORTS_CALL_CENTER_READ], querystring: PeriodQuerySchema, response: { 200: dataResponse(CallCenterReportSchema), ...commonErrorResponses } } },
    async (request) => ({ data: await svc.callCenterPerformance(request.query, requireAuth(request)) }));

  app.get("/call-center/agents", { schema: { summary: "Call center summary by agent", operationId: "getCallCenterAgents", tags: T, permissions: [P.REPORTS_CALL_CENTER_READ], querystring: PeriodQuerySchema, response: { 200: dataResponse(CallCenterAgentsSchema), ...commonErrorResponses } } },
    async (request) => ({ data: await svc.callCenterAgents(request.query, requireAuth(request)) }));

  // --- Library + run/export ---
  app.get("/library", { schema: { summary: "Report library", operationId: "getReportLibrary", tags: T, permissions: [P.REPORTS_READ], response: { 200: dataResponse(ReportLibrarySchema), ...commonErrorResponses } } },
    async (request) => ({ data: svc.reportLibrary(requireAuth(request)) }));

  app.post("/:code/run", { schema: { summary: "Run a report (JSON preview)", operationId: "runReport", tags: T, permissions: [P.REPORTS_READ], params: ReportCodeParam, body: PeriodQuerySchema, response: { 200: dataResponse(RunReportSchema), ...commonErrorResponses } } },
    async (request) => { const user = requireAuth(request); assertReportPerm(user, request.params.code); return { data: await svc.runReport(request.params.code, request.body, user) }; });

  app.get("/:code/export", { schema: { summary: "Export a report (CSV/XLSX/PDF)", operationId: "exportReport", tags: T, permissions: [P.REPORTS_EXPORT], params: ReportCodeParam, querystring: ExportQuerySchema } },
    async (request, reply) => {
      const user = requireAuth(request);
      assertReportPerm(user, request.params.code);
      const locale = request.query.locale ?? request.language ?? resolveLanguage(request.headers["accept-language"]);
      const out = await exec.exportReport(request.params.code, request.query, user, request.query.format, locale);
      request.setAudit({ action: "reports.export", entityType: "report", entityId: request.params.code, metadata: { format: request.query.format, locale } });
      reply.header("content-type", out.contentType).header("content-disposition", exec.contentDisposition(out));
      return reply.send(out.buffer);
    });

  app.post("/:code/export-job", { schema: { summary: "Create a report export artifact", operationId: "createReportExportJob", tags: T, permissions: [P.REPORTS_EXPORT], params: ReportCodeParam, body: ExportQuerySchema, response: { 200: dataResponse(ArtifactSchema), ...commonErrorResponses } } },
    async (request) => { const user = requireAuth(request); assertReportPerm(user, request.params.code); const locale = request.body.locale ?? request.language ?? resolveLanguage(request.headers["accept-language"]); request.setAudit({ action: "reports.export_job", entityType: "report", entityId: request.params.code, metadata: { format: request.body.format, locale } }); return { data: await exec.createExportJob(request.params.code, request.body, user, request.body.format, locale) }; });

  app.get("/artifacts/:id/access", { schema: { summary: "Get signed artifact access", operationId: "getReportArtifactAccess", tags: T, permissions: [P.REPORTS_EXPORT], params: UuidIdParam, response: { 200: dataResponse(ArtifactAccessSchema), ...commonErrorResponses } } },
    async (request) => ({ data: await exec.artifactAccess(request.params.id, requireAuth(request)) }));

  app.get("/artifacts/stream", { schema: { summary: "Stream a report artifact via signed token", operationId: "streamReportArtifact", tags: T, permissions: [P.REPORTS_EXPORT], querystring: z.object({ token: z.string().min(1) }) } },
    async (request, reply) => {
      const { artifact, contentType, stream } = await exec.streamArtifact(request.query.token);
      request.setAudit({ action: "reports.artifact_accessed", entityType: "report_artifact", entityId: artifact.id });
      reply.header("content-type", contentType).header("content-disposition", `attachment; filename="${artifact.reportCode.toLowerCase()}.${artifact.format.toLowerCase()}"`);
      return reply.send(stream);
    });

  // --- Schedules ---
  // Backend capability retained (worker + artifacts still run); the reports UI no
  // longer surfaces scheduling, so nothing here is reachable from the reports tabs.
  app.get("/schedules", { schema: { summary: "List report schedules", operationId: "listReportSchedules", tags: T, permissions: [P.REPORTS_SCHEDULE], response: { 200: dataResponse(z.array(ScheduleSchema)), ...commonErrorResponses } } },
    async () => ({ data: await exec.listSchedules() }));
  app.post("/schedules", { schema: { summary: "Create a report schedule", operationId: "createReportSchedule", tags: T, permissions: [P.REPORTS_SCHEDULE], body: CreateScheduleSchema, response: { 200: dataResponse(ScheduleSchema), ...commonErrorResponses } } },
    async (request) => { const user = requireAuth(request); request.setAudit({ action: "reports.schedule_created", entityType: "report_schedule", metadata: { reportCode: request.body.reportCode } }); return { data: await exec.createSchedule(request.body, user) }; });
  app.post("/schedules/:id/enable", { schema: { summary: "Enable a report schedule", operationId: "enableReportSchedule", tags: T, permissions: [P.REPORTS_SCHEDULE], params: NumericIdParam, response: { 200: dataResponse(ScheduleSchema), ...commonErrorResponses } } },
    async (request) => { request.setAudit({ action: "reports.schedule_enabled", entityType: "report_schedule", entityId: String(request.params.id) }); return { data: await exec.setScheduleEnabled(request.params.id, true) }; });
  app.post("/schedules/:id/disable", { schema: { summary: "Disable a report schedule", operationId: "disableReportSchedule", tags: T, permissions: [P.REPORTS_SCHEDULE], params: NumericIdParam, response: { 200: dataResponse(ScheduleSchema), ...commonErrorResponses } } },
    async (request) => { request.setAudit({ action: "reports.schedule_disabled", entityType: "report_schedule", entityId: String(request.params.id) }); return { data: await exec.setScheduleEnabled(request.params.id, false) }; });
  app.delete("/schedules/:id", { schema: { summary: "Delete a report schedule", operationId: "deleteReportSchedule", tags: T, permissions: [P.REPORTS_SCHEDULE], params: NumericIdParam, response: { 200: dataResponse(z.object({ deleted: z.boolean() })), ...commonErrorResponses } } },
    async (request) => { request.setAudit({ action: "reports.schedule_deleted", entityType: "report_schedule", entityId: String(request.params.id) }); return { data: await exec.deleteSchedule(request.params.id) }; });
}
