import type { FastifyInstance } from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import { z } from "zod";
import { commonErrorResponses, dataResponse } from "src/lib/http/response";
import { PERMISSIONS } from "src/constants/permissions";
import { createComplaintAdminService } from "src/modules/complaints/complaint-admin.service";
import { PriorityParam, SlaPolicySchema, UpdateSlaPolicySchema } from "src/modules/complaints/complaints.schema";

const T = ["Complaint SLA"];

/** Mounts under /complaint-sla-policies. */
export default async function slaPolicyRoutes(fastify: FastifyInstance) {
  const app = fastify.withTypeProvider<ZodTypeProvider>();
  const svc = createComplaintAdminService(fastify);
  const P = PERMISSIONS;

  app.get("/", { schema: { summary: "List SLA policies", operationId: "listComplaintSlaPolicies", tags: T, permissions: [P.COMPLAINT_SLA_READ], response: { 200: dataResponse(z.array(SlaPolicySchema)), ...commonErrorResponses } } },
    async () => ({ data: await svc.listPolicies() }));

  app.patch("/:priority", { schema: { summary: "Update an SLA policy", operationId: "updateComplaintSlaPolicy", tags: T, permissions: [P.COMPLAINT_SLA_MANAGE], params: PriorityParam, body: UpdateSlaPolicySchema, response: { 200: dataResponse(SlaPolicySchema), ...commonErrorResponses } } },
    async (request) => { request.setAudit({ action: "complaint_sla.update", entityType: "complaint_sla_policy", entityId: request.params.priority }); return { data: await svc.updatePolicy(request.params.priority, request.body) }; });
}
