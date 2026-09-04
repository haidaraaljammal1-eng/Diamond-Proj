import type { FastifyInstance } from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import { z } from "zod";
import { requireAuth } from "src/lib/context/auth-context";
import { NumericIdParam } from "src/lib/http/common-schemas";
import { commonErrorResponses, dataResponse } from "src/lib/http/response";
import { PERMISSIONS } from "src/constants/permissions";
import { createComplaintAdminService } from "src/modules/complaints/complaint-admin.service";
import { createComplaintsService } from "src/modules/complaints/complaints.service";
import {
  ActivateRuleSchema, CreateRoutingRuleSchema, DeleteRoutingRuleSchema, RoutingPreviewResultSchema, RoutingPreviewSchema,
  RoutingRuleExecutionsQuerySchema, RoutingRuleExecutionsSchema, RoutingRuleSchema, UpdateRoutingRuleSchema,
} from "src/modules/complaints/complaints.schema";

const T = ["Complaint Routing"];

/** Mounts under /complaint-routing-rules. */
export default async function routingRulesRoutes(fastify: FastifyInstance) {
  const app = fastify.withTypeProvider<ZodTypeProvider>();
  const svc = createComplaintAdminService(fastify);
  const complaints = createComplaintsService(fastify);
  const P = PERMISSIONS;

  app.get("/", { schema: { summary: "List routing rules", operationId: "listComplaintRoutingRules", tags: T, permissions: [P.COMPLAINT_ROUTING_READ], response: { 200: dataResponse(z.array(RoutingRuleSchema)), ...commonErrorResponses } } },
    async () => ({ data: await svc.listRules() }));

  app.post("/preview", { schema: { summary: "Preview routing without opening a complaint", operationId: "previewComplaintRouting", tags: T, permissions: [P.COMPLAINT_ROUTING_READ], body: RoutingPreviewSchema, response: { 200: dataResponse(RoutingPreviewResultSchema), ...commonErrorResponses } } },
    async (request) => ({ data: await svc.previewRouting(request.body) }));

  app.post("/", { schema: { summary: "Create a routing rule", operationId: "createComplaintRoutingRule", tags: T, permissions: [P.COMPLAINT_ROUTING_MANAGE], body: CreateRoutingRuleSchema, response: { 200: dataResponse(RoutingRuleSchema), ...commonErrorResponses } } },
    async (request) => { request.setAudit({ action: "complaint_routing.create", entityType: "complaint_routing_rule" }); return { data: await svc.createRule(request.body) }; });

  app.get("/:id", { schema: { summary: "Get a routing rule", operationId: "getComplaintRoutingRule", tags: T, permissions: [P.COMPLAINT_ROUTING_READ], params: NumericIdParam, response: { 200: dataResponse(RoutingRuleSchema), ...commonErrorResponses } } },
    async (request) => ({ data: await svc.getRule(request.params.id) }));

  app.patch("/:id", { schema: { summary: "Update a routing rule", operationId: "updateComplaintRoutingRule", tags: T, permissions: [P.COMPLAINT_ROUTING_MANAGE], params: NumericIdParam, body: UpdateRoutingRuleSchema, response: { 200: dataResponse(RoutingRuleSchema), ...commonErrorResponses } } },
    async (request) => { request.setAudit({ action: "complaint_routing.update", entityType: "complaint_routing_rule", entityId: String(request.params.id) }); return { data: await svc.updateRule(request.params.id, request.body) }; });

  app.post("/:id/activate", { schema: { summary: "Activate a routing rule", operationId: "activateComplaintRoutingRule", tags: T, permissions: [P.COMPLAINT_ROUTING_MANAGE], params: NumericIdParam, body: ActivateRuleSchema, response: { 200: dataResponse(RoutingRuleSchema), ...commonErrorResponses } } },
    async (request) => { request.setAudit({ action: "complaint_routing.activate", entityType: "complaint_routing_rule", entityId: String(request.params.id) }); return { data: await svc.setActive(request.params.id, request.body.revision, true) }; });

  app.post("/:id/deactivate", { schema: { summary: "Deactivate a routing rule", operationId: "deactivateComplaintRoutingRule", tags: T, permissions: [P.COMPLAINT_ROUTING_MANAGE], params: NumericIdParam, body: ActivateRuleSchema, response: { 200: dataResponse(RoutingRuleSchema), ...commonErrorResponses } } },
    async (request) => { request.setAudit({ action: "complaint_routing.deactivate", entityType: "complaint_routing_rule", entityId: String(request.params.id) }); return { data: await svc.setActive(request.params.id, request.body.revision, false) }; });

  // Deleting a rule never rewrites history: routed complaints keep their
  // immutable routingSnapshot (the FK is SetNull), so the response reports how
  // many past cases were opened by the rule that is going away.
  app.delete("/:id", { schema: { summary: "Delete a routing rule", operationId: "deleteComplaintRoutingRule", tags: T, permissions: [P.COMPLAINT_ROUTING_MANAGE], params: NumericIdParam, body: DeleteRoutingRuleSchema, response: { 200: dataResponse(z.object({ id: z.number().int(), affectedComplaints: z.number().int() })), ...commonErrorResponses } } },
    async (request) => { request.setAudit({ action: "complaint_routing.delete", entityType: "complaint_routing_rule", entityId: String(request.params.id) }); return { data: await svc.deleteRule(request.params.id, request.body.revision) }; });

  app.get("/:id/executions", { schema: { summary: "Complaints this routing rule actually opened", operationId: "listComplaintRoutingRuleExecutions", tags: T, permissions: [P.COMPLAINT_ROUTING_READ], params: NumericIdParam, querystring: RoutingRuleExecutionsQuerySchema, response: { 200: dataResponse(RoutingRuleExecutionsSchema), ...commonErrorResponses } } },
    async (request) => ({ data: await complaints.ruleExecutions(request.params.id, request.query.limit, requireAuth(request)) }));
}
