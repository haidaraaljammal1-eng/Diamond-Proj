import type { FastifyInstance } from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import { z } from "zod";
import { NumericIdParam } from "src/lib/http/common-schemas";
import { AppError } from "src/lib/errors/app-error";
import { commonErrorResponses, dataResponse, listResponse } from "src/lib/http/response";
import { requireAuth } from "src/lib/context/auth-context";
import { PERMISSIONS } from "src/constants/permissions";
import { createComplaintsService } from "src/modules/complaints/complaints.service";
import { createComplaintAttachmentsService } from "src/modules/complaints/complaint-attachments.service";
import {
  AssignSchema, AssigneeLookupQuerySchema, AssigneeOptionSchema, ChangeDepartmentSchema, ChangePrioritySchema, CloseSchema, ComplaintActionSchema, ComplaintCategorySchema, UpdateSolutionProposedSchema,
  ComplaintDetailSchema, ComplaintListItemSchema, CreateActionSchema, CreateComplaintSchema, EscalateSchema,
  EscalationTargetsSchema,
  ExportComplaintsQuerySchema, ListComplaintsQuerySchema, ListTimelineQuerySchema, OverviewSchema, ReopenSchema,
  ResolveSchema, SimilarItemSchema, TimelineEventSchema, TransitionSchema,
} from "src/modules/complaints/complaints.schema";

const T = ["Complaints"];
const AttachmentPublicSchema = z.object({ id: z.string(), originalName: z.string(), mimeType: z.string(), size: z.number().int(), checksum: z.string().nullable(), uploadedByUserId: z.number().int().nullable(), actionId: z.number().int().nullable(), status: z.string(), createdAt: z.date() });
const AttachmentAccessSchema = z.object({ attachmentId: z.string(), url: z.string(), expiresAt: z.date() });
const AttParam = z.object({ id: z.coerce.number().int().positive(), attId: z.string().uuid() });

/** Mounts under /complaints. */
export default async function complaintsRoutes(fastify: FastifyInstance) {
  const app = fastify.withTypeProvider<ZodTypeProvider>();
  const svc = createComplaintsService(fastify);
  const attachments = createComplaintAttachmentsService(fastify, svc);
  const admin = (await import("src/modules/complaints/complaint-admin.service")).createComplaintAdminService(fastify);
  const P = PERMISSIONS;

  // --- Reads ---
  app.get("/", { schema: { summary: "List complaints", operationId: "listComplaints", tags: T, permissions: [P.COMPLAINTS_READ], querystring: ListComplaintsQuerySchema, response: { 200: listResponse(ComplaintListItemSchema), ...commonErrorResponses } } },
    async (request) => svc.list(request.query, requireAuth(request)));

  app.get("/export", { schema: { summary: "Export complaints (XLSX or CSV)", operationId: "exportComplaints", tags: T, permissions: [P.COMPLAINTS_EXPORT], querystring: ExportComplaintsQuerySchema } },
    async (request, reply) => {
      const user = requireAuth(request);
      const format = request.query.format ?? "xlsx";
      const date = new Date().toISOString().slice(0, 10);
      request.setAudit({ action: "complaints.export", entityType: "complaint", metadata: { format } });
      if (format === "csv") { reply.header("content-type", "text/csv; charset=utf-8").header("content-disposition", `attachment; filename="complaints-${date}.csv"`); return svc.exportCsv(request.query, user); }
      const buffer = await svc.exportXlsx(request.query, user);
      reply.header("content-type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet").header("content-disposition", `attachment; filename="complaints-${date}.xlsx"`);
      return reply.send(buffer);
    });

  app.get("/categories", { schema: { summary: "List complaint categories", operationId: "listComplaintCategories", tags: T, permissions: [P.COMPLAINTS_READ], response: { 200: dataResponse(z.array(ComplaintCategorySchema)), ...commonErrorResponses } } },
    async () => ({ data: await admin.listCategories() }));

  app.get("/overview", { schema: { summary: "Complaint overview KPIs", operationId: "getComplaintOverview", tags: T, permissions: [P.COMPLAINTS_READ], response: { 200: dataResponse(OverviewSchema), ...commonErrorResponses } } },
    async (request) => ({ data: await svc.overview(requireAuth(request)) }));

  // Eligible employees for a complaint's department (department-first assignment).
  // departmentId is optional: omitted → every department the viewer can see.
  // Any-of COMPLAINTS_ASSIGN / COMPLAINT_ROUTING_MANAGE — assign picker + routing-rule editor.
  app.get("/assignees", { schema: { summary: "Eligible employees for a department (departmentId optional)", operationId: "listComplaintAssignees", tags: T, permissions: [P.COMPLAINTS_ASSIGN, P.COMPLAINT_ROUTING_MANAGE], querystring: AssigneeLookupQuerySchema, response: { 200: dataResponse(z.object({ items: z.array(AssigneeOptionSchema) })), ...commonErrorResponses } } },
    async (request) => ({ data: await svc.assigneeOptions(requireAuth(request), request.query) }));

  // Signed-attachment stream (token carries authorization; scope re-checked in service).
  app.get("/attachments/stream", { schema: { summary: "Stream a complaint attachment via signed token", operationId: "streamComplaintAttachment", tags: T, permissions: [P.COMPLAINT_ATTACHMENTS_READ], querystring: z.object({ token: z.string().min(1) }) } },
    async (request, reply) => {
      const { attachment, stream } = await attachments.openStream(request.query.token, requireAuth(request));
      request.setAudit({ action: "complaint_attachments.accessed", entityType: "complaint_attachment", entityId: attachment.id });
      reply.header("content-type", attachment.mimeType).header("content-disposition", `attachment; filename="${encodeURIComponent(attachment.originalName)}"`);
      return reply.send(stream);
    });

  app.post("/", { schema: { summary: "Create a complaint manually", operationId: "createComplaint", tags: T, permissions: [P.COMPLAINTS_CREATE], body: CreateComplaintSchema, response: { 200: dataResponse(ComplaintDetailSchema), ...commonErrorResponses } } },
    async (request) => {
      const user = requireAuth(request);
      const idem = request.headers["idempotency-key"];
      request.setAudit({ action: "complaints.create", entityType: "complaint", metadata: { customerId: request.body.customerId, sourceType: "MANUAL" } });
      return { data: await svc.createManual(request.body, user, typeof idem === "string" ? idem : undefined) };
    });

  app.get("/:id", { schema: { summary: "Get a complaint", operationId: "getComplaint", tags: T, permissions: [P.COMPLAINTS_READ], params: NumericIdParam, response: { 200: dataResponse(ComplaintDetailSchema), ...commonErrorResponses } } },
    async (request) => ({ data: await svc.detail(request.params.id, requireAuth(request)) }));

  app.get("/:id/timeline", { schema: { summary: "Get complaint timeline", operationId: "getComplaintTimeline", tags: T, permissions: [P.COMPLAINTS_READ], params: NumericIdParam, querystring: ListTimelineQuerySchema, response: { 200: listResponse(TimelineEventSchema), ...commonErrorResponses } } },
    async (request) => svc.timeline(request.params.id, request.query, requireAuth(request)));

  app.get("/:id/similar", { schema: { summary: "Get similar complaints", operationId: "getSimilarComplaints", tags: T, permissions: [P.COMPLAINTS_READ], params: NumericIdParam, response: { 200: dataResponse(z.array(SimilarItemSchema)), ...commonErrorResponses } } },
    async (request) => ({ data: await svc.similar(request.params.id, requireAuth(request)) }));

  // --- Actions ---
  app.get("/:id/actions", { schema: { summary: "List complaint actions", operationId: "listComplaintActions", tags: T, permissions: [P.COMPLAINTS_READ], params: NumericIdParam, response: { 200: dataResponse(z.array(ComplaintActionSchema)), ...commonErrorResponses } } },
    async (request) => ({ data: await svc.listActions(request.params.id, requireAuth(request)) }));

  app.post("/:id/actions", { schema: { summary: "Add a complaint action / note", operationId: "addComplaintAction", tags: T, permissions: [P.COMPLAINT_ACTIONS_CREATE], params: NumericIdParam, body: CreateActionSchema, response: { 200: dataResponse(ComplaintActionSchema), ...commonErrorResponses } } },
    async (request) => {
      // Never audit the note body — ids + type only.
      request.setAudit({ action: "complaint_actions.create", entityType: "complaint", entityId: String(request.params.id), metadata: { type: request.body.type, customerVisible: request.body.customerVisible ?? false } });
      return { data: await svc.addAction(request.params.id, request.body, requireAuth(request)) };
    });

  // --- Attachments ---
  app.get("/:id/attachments", { schema: { summary: "List complaint attachments", operationId: "listComplaintAttachments", tags: T, permissions: [P.COMPLAINT_ATTACHMENTS_READ], params: NumericIdParam, response: { 200: dataResponse(z.array(AttachmentPublicSchema)), ...commonErrorResponses } } },
    async (request) => ({ data: await attachments.list(request.params.id, requireAuth(request)) }));

  app.post("/:id/attachments", { schema: { summary: "Upload a complaint attachment", operationId: "uploadComplaintAttachment", tags: T, permissions: [P.COMPLAINT_ATTACHMENTS_UPLOAD], consumes: ["multipart/form-data"], params: NumericIdParam, querystring: z.object({ actionId: z.coerce.number().int().positive().optional() }) } },
    async (request) => {
      const file = await request.file();
      if (!file) throw AppError.validation("A file is required");
      const att = await attachments.upload(request.params.id, request.query.actionId ?? null, file, requireAuth(request));
      request.setAudit({ action: "complaint_attachments.upload", entityType: "complaint_attachment", entityId: att.id, metadata: { complaintId: request.params.id } });
      return { data: att };
    });

  app.get("/:id/attachments/:attId/access", { schema: { summary: "Get short-lived signed attachment access", operationId: "getComplaintAttachmentAccess", tags: T, permissions: [P.COMPLAINT_ATTACHMENTS_READ], params: AttParam, response: { 200: dataResponse(AttachmentAccessSchema), ...commonErrorResponses } } },
    async (request) => {
      request.setAudit({ action: "complaint_attachments.access_granted", entityType: "complaint_attachment", entityId: request.params.attId, metadata: { complaintId: request.params.id } });
      return { data: await attachments.access(request.params.id, request.params.attId, requireAuth(request)) };
    });

  // --- Lifecycle mutations ---
  type Detail = z.infer<typeof ComplaintDetailSchema>;
  const mut = (name: string, perm: string, opId: string, body: z.ZodTypeAny, fn: (id: number, b: never, u: ReturnType<typeof requireAuth>) => Promise<unknown>, action: string) =>
    app.post(`/:id/${name}`, { schema: { summary: opId, operationId: opId, tags: T, permissions: [perm], params: NumericIdParam, body, response: { 200: dataResponse(ComplaintDetailSchema), ...commonErrorResponses } } },
      async (request) => {
        request.setAudit({ action, entityType: "complaint", entityId: String(request.params.id) });
        return { data: (await fn(request.params.id, request.body as never, requireAuth(request))) as Detail };
      });

  mut("transition", P.COMPLAINTS_MANAGE, "transitionComplaint", TransitionSchema, svc.transition, "complaints.stage_changed");
  mut("assign", P.COMPLAINTS_ASSIGN, "assignComplaint", AssignSchema, svc.assign, "complaints.assigned");
  mut("reassign", P.COMPLAINTS_ASSIGN, "reassignComplaint", AssignSchema, svc.reassign, "complaints.reassigned");
  mut("department", P.COMPLAINTS_MANAGE, "changeComplaintDepartment", ChangeDepartmentSchema, svc.changeDepartment, "complaints.department_changed");
  mut("priority", P.COMPLAINTS_MANAGE, "changeComplaintPriority", ChangePrioritySchema, svc.changePriority, "complaints.priority_changed");
  mut("proposed-resolution", P.COMPLAINTS_MANAGE, "updateComplaintProposedResolution", UpdateSolutionProposedSchema, svc.updateSolutionProposed, "complaints.proposed_resolution_updated");
  // Escalate has its OWN route rather than going through `mut`, because the
  // audit record must carry WHAT MOVED (from/to department + owner), and that is
  // only known after the service has run. `mut` stamps the audit before the
  // handler, which would leave the audit trail saying only "escalated".
  app.post("/:id/escalate", { schema: { summary: "escalateComplaint", operationId: "escalateComplaint", tags: T, permissions: [P.COMPLAINTS_ESCALATE], params: NumericIdParam, body: EscalateSchema, response: { 200: dataResponse(ComplaintDetailSchema), ...commonErrorResponses } } },
    async (request) => {
      const { detail, outcome } = await svc.escalate(request.params.id, request.body, requireAuth(request));
      request.setAudit({
        action: "complaints.escalated", entityType: "complaint", entityId: String(request.params.id),
        metadata: {
          escalationId: outcome.escalationId,
          previousDepartmentId: outcome.fromDepartmentId, targetDepartmentId: outcome.toDepartmentId,
          previousAssigneeId: outcome.fromUserId, targetAssigneeId: outcome.toUserId,
        },
      });
      return { data: detail as Detail };
    });

  // The real destinations THIS case can go to, with names + eligible employees.
  app.get("/:id/escalation-targets", { schema: { summary: "Departments this case can be escalated to", operationId: "listComplaintEscalationTargets", tags: T, permissions: [P.COMPLAINTS_ESCALATE], params: NumericIdParam, response: { 200: dataResponse(EscalationTargetsSchema), ...commonErrorResponses } } },
    async (request) => ({ data: await svc.escalationTargets(request.params.id, requireAuth(request)) }));
  mut("resolve", P.COMPLAINTS_RESOLVE, "resolveComplaint", ResolveSchema, svc.resolve, "complaints.resolved");
  mut("close", P.COMPLAINTS_CLOSE, "closeComplaint", CloseSchema, svc.close, "complaints.closed");
  mut("reopen", P.COMPLAINTS_REOPEN, "reopenComplaint", ReopenSchema, svc.reopen, "complaints.reopened");
}
