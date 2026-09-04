import type { FastifyInstance } from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import { z } from "zod";
import { NumericIdParam } from "src/lib/http/common-schemas";
import { commonErrorResponses, dataResponse, listResponse } from "src/lib/http/response";
import { requireAuth, hasPermission } from "src/lib/context/auth-context";
import { PERMISSIONS } from "src/constants/permissions";
import { createCallCenterService } from "src/modules/call-center/call-center.service";
import {
  AgentOptionSchema, CallContextSchema, CallDetailSchema, CallLogItemSchema, CallSessionSchema, CallbackListItemSchema,
  CompleteCallResultSchema, CompleteCallSchema, ExportQueueQuerySchema, ListAgentsQuerySchema, ListCallbacksQuerySchema,
  ListCallsQuerySchema, ListQueueQuerySchema, ManualEnqueueSchema, OverviewSchema, QueueListItemSchema,
  ReassignSchema, RecordingAccessSchema,
} from "src/modules/call-center/call-center.schema";

const T = ["Call Center"];

/** Mounts under /call-center. */
export default async function callCenterRoutes(fastify: FastifyInstance) {
  const app = fastify.withTypeProvider<ZodTypeProvider>();
  const svc = createCallCenterService(fastify);
  const P = PERMISSIONS;

  // --- Queue ---

  app.get("/queue", {
    schema: { summary: "List the call queue", operationId: "listCallQueue", tags: T, permissions: [P.CALL_CENTER_QUEUE_READ], querystring: ListQueueQuerySchema, response: { 200: listResponse(QueueListItemSchema), ...commonErrorResponses } },
  }, async (request) => svc.list(request.query, requireAuth(request)));

  app.get("/queue/export", {
    schema: { summary: "Export the call queue (XLSX or CSV)", operationId: "exportCallQueue", tags: T, permissions: [P.CALL_CENTER_EXPORT], querystring: ExportQueueQuerySchema },
  }, async (request, reply) => {
    const user = requireAuth(request);
    const format = request.query.format ?? "xlsx";
    const includePhone = hasPermission(user, P.CALL_CENTER_CONTACTS_READ);
    const date = new Date().toISOString().slice(0, 10);
    request.setAudit({ action: "call_center.export", entityType: "call_center_queue", metadata: { format, includePhone } });
    if (format === "csv") {
      reply.header("content-type", "text/csv; charset=utf-8").header("content-disposition", `attachment; filename="call-queue-${date}.csv"`);
      return svc.exportCsv(request.query, user);
    }
    const buffer = await svc.exportXlsx(request.query, user);
    reply.header("content-type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet").header("content-disposition", `attachment; filename="call-queue-${date}.xlsx"`);
    return reply.send(buffer);
  });

  app.post("/queue", {
    schema: { summary: "Manually enqueue a customer for a call", operationId: "enqueueCallItem", tags: T, permissions: [P.CALL_CENTER_QUEUE_MANAGE], body: ManualEnqueueSchema, response: { 200: dataResponse(QueueListItemSchema), ...commonErrorResponses } },
  }, async (request) => {
    const user = requireAuth(request);
    request.setAudit({ action: "call_center.queue_enqueue", entityType: "call_center_queue", metadata: { customerId: request.body.customerId, sourceType: request.body.sourceType ?? "MANUAL" } });
    return { data: await svc.enqueueManual(request.body, user) };
  });

  app.post("/queue/next/claim", {
    schema: { summary: "Claim the next call (atomic)", operationId: "claimNextCall", tags: T, permissions: [P.CALL_CENTER_QUEUE_MANAGE], querystring: z.object({ branchId: z.coerce.number().int().positive().optional() }), response: { 200: dataResponse(CallContextSchema.nullable()), ...commonErrorResponses } },
  }, async (request) => {
    const user = requireAuth(request);
    request.setAudit({ action: "call_center.queue_claim_next", entityType: "call_center_queue" });
    return { data: await svc.claimNext(user.id, request.query.branchId, user) };
  });

  app.get("/queue/:id", {
    schema: { summary: "Get the full call context for a queue item", operationId: "getCallContext", tags: T, permissions: [P.CALL_CENTER_QUEUE_READ], params: NumericIdParam, response: { 200: dataResponse(CallContextSchema), ...commonErrorResponses } },
  }, async (request) => ({ data: await svc.callContext(request.params.id, requireAuth(request)) }));

  app.post("/queue/:id/claim", {
    schema: { summary: "Claim a specific queue item", operationId: "claimCallItem", tags: T, permissions: [P.CALL_CENTER_QUEUE_MANAGE], params: NumericIdParam, response: { 200: dataResponse(CallContextSchema), ...commonErrorResponses } },
  }, async (request) => {
    const user = requireAuth(request);
    request.setAudit({ action: "call_center.queue_claim", entityType: "call_center_queue", entityId: String(request.params.id) });
    return { data: await svc.claimItem(request.params.id, user.id, user) };
  });

  app.post("/queue/:id/release", {
    schema: { summary: "Release/abandon a claimed queue item", operationId: "releaseCallItem", tags: T, permissions: [P.CALL_CENTER_QUEUE_MANAGE], params: NumericIdParam, response: { 200: dataResponse(z.object({ released: z.boolean() })), ...commonErrorResponses } },
  }, async (request) => {
    const user = requireAuth(request);
    const canReassign = hasPermission(user, P.CALL_CENTER_QUEUE_ASSIGN);
    request.setAudit({ action: "call_center.queue_release", entityType: "call_center_queue", entityId: String(request.params.id) });
    return { data: await svc.release(request.params.id, user.id, canReassign, user) };
  });

  app.post("/queue/:id/reassign", {
    schema: { summary: "Reassign a queue item to another agent", operationId: "reassignCallItem", tags: T, permissions: [P.CALL_CENTER_QUEUE_ASSIGN], params: NumericIdParam, body: ReassignSchema, response: { 200: dataResponse(CallContextSchema), ...commonErrorResponses } },
  }, async (request) => {
    const user = requireAuth(request);
    request.setAudit({ action: "call_center.queue_reassign", entityType: "call_center_queue", entityId: String(request.params.id), metadata: { assignedToUserId: request.body.assignedToUserId } });
    return { data: await svc.reassign(request.params.id, request.body.assignedToUserId, user) };
  });

  // --- Agents (contextual, branch-scoped lookup) ---

  // Branch-scoped, email-free agent list for the reassign picker (queue.assign) and
  // the call-log agent filter (calls.read) — any-of, so either consumer is served
  // without exposing the org-wide /lookups/users directory.
  app.get("/agents", {
    schema: { summary: "List agents eligible for the viewer's scoped branches", operationId: "listCallCenterAgents", tags: T, permissions: [P.CALL_CENTER_QUEUE_ASSIGN, P.CALL_CENTER_CALLS_READ], querystring: ListAgentsQuerySchema, response: { 200: dataResponse(z.object({ items: z.array(AgentOptionSchema) })), ...commonErrorResponses } },
  }, async (request) => ({ data: await svc.listAgents(requireAuth(request), request.query) }));

  // --- Calls ---

  app.post("/queue/:id/calls/start", {
    schema: { summary: "Start a call for a queue item", operationId: "startCall", tags: T, permissions: [P.CALL_CENTER_CALLS_MANAGE], params: NumericIdParam, response: { 200: dataResponse(CallSessionSchema), ...commonErrorResponses } },
  }, async (request) => {
    const user = requireAuth(request);
    request.setAudit({ action: "call_center.call_started", entityType: "call_session", entityId: String(request.params.id) });
    return { data: await svc.startCall(request.params.id, user.id, user) };
  });

  app.get("/calls", {
    schema: { summary: "List call sessions (call log)", operationId: "listCalls", tags: T, permissions: [P.CALL_CENTER_CALLS_READ], querystring: ListCallsQuerySchema, response: { 200: listResponse(CallLogItemSchema), ...commonErrorResponses } },
  }, async (request) => svc.listCalls(request.query, requireAuth(request)));

  app.get("/calls/:id", {
    schema: { summary: "Get a call session detail", operationId: "getCallDetail", tags: T, permissions: [P.CALL_CENTER_CALLS_READ], params: NumericIdParam, response: { 200: dataResponse(CallDetailSchema), ...commonErrorResponses } },
  }, async (request) => ({ data: await svc.callDetail(request.params.id, requireAuth(request)) }));

  app.post("/calls/:id/complete", {
    schema: { summary: "Complete a call with an outcome", operationId: "completeCall", tags: T, permissions: [P.CALL_CENTER_CALLS_MANAGE], params: NumericIdParam, body: CompleteCallSchema, response: { 200: dataResponse(CompleteCallResultSchema), ...commonErrorResponses } },
  }, async (request) => {
    const user = requireAuth(request);
    request.setAudit({ action: "call_center.call_completed", entityType: "call_session", entityId: String(request.params.id), metadata: { outcome: request.body.outcome, complaintRequested: request.body.complaintRequested ?? false } });
    return { data: await svc.completeCall(request.params.id, request.body, user.id, user) };
  });

  // --- Callbacks ---

  app.get("/callbacks", {
    schema: { summary: "List scheduled callbacks", operationId: "listCallbacks", tags: T, permissions: [P.CALL_CENTER_CALLBACKS_READ], querystring: ListCallbacksQuerySchema, response: { 200: listResponse(CallbackListItemSchema), ...commonErrorResponses } },
  }, async (request) => svc.listCallbacks(request.query, requireAuth(request)));

  app.post("/callbacks/:id/cancel", {
    schema: { summary: "Cancel a scheduled callback", operationId: "cancelCallback", tags: T, permissions: [P.CALL_CENTER_CALLBACKS_MANAGE], params: NumericIdParam, response: { 200: dataResponse(z.object({ cancelled: z.boolean() })), ...commonErrorResponses } },
  }, async (request) => {
    request.setAudit({ action: "call_center.callback_cancelled", entityType: "call_callback", entityId: String(request.params.id) });
    return { data: await svc.cancelCallback(request.params.id, requireAuth(request)) };
  });

  // --- Overview / recording ---

  app.get("/overview", {
    schema: { summary: "Call-center overview KPIs", operationId: "getCallCenterOverview", tags: T, permissions: [P.CALL_CENTER_QUEUE_READ], response: { 200: dataResponse(OverviewSchema), ...commonErrorResponses } },
  }, async (request) => ({ data: await svc.overview(requireAuth(request)) }));

  app.get("/calls/:id/recording-access", {
    schema: { summary: "Get short-lived signed access to a call recording", operationId: "getRecordingAccess", tags: T, permissions: [P.CALL_CENTER_RECORDINGS_READ], params: NumericIdParam, response: { 200: dataResponse(RecordingAccessSchema), ...commonErrorResponses } },
  }, async (request) => {
    request.setAudit({ action: "call_center.recording_accessed", entityType: "call_recording", entityId: String(request.params.id), metadata: { callSessionId: request.params.id } });
    return { data: await svc.recordingAccess(request.params.id, requireAuth(request)) };
  });
}
