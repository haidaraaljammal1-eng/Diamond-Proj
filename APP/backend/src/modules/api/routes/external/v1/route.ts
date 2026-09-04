import type { FastifyInstance, FastifyRequest } from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import { NumericIdParam } from "src/lib/http/common-schemas";
import { commonErrorResponses, dataResponse, listResponse } from "src/lib/http/response";
import { AppError } from "src/lib/errors/app-error";
import { ErrorCode } from "src/constants/error-codes";
import { createExternalApiService } from "src/modules/api/external-api.service";
import { ComplaintDetailSchema } from "src/modules/complaints/complaints.schema";
import {
  ApiCreateComplaint, ApiCustomerSchema, ApiKpiQuery, ApiKpiSchema, ApiListCustomersQuery,
  ApiTransitionComplaint,
} from "src/modules/api/external-api.schema";

const T = ["External API v1"];
function apiAuthOf(request: FastifyRequest) {
  if (!request.apiAuth) throw new AppError({ code: ErrorCode.UNAUTHORIZED, message: "Invalid or unauthorized API key", context: { reason: "api_key_invalid" } });
  return request.apiAuth;
}
function requireIdempotencyKey(request: FastifyRequest): string {
  const k = request.headers["idempotency-key"];
  if (typeof k !== "string" || k.trim().length === 0) throw new AppError({ code: ErrorCode.VALIDATION_ERROR, message: "An idempotency key is required", context: { reason: "idempotency_key_required" } });
  return k.trim();
}

/** Mounts under /api/v1 (external, API-key authenticated). */
export default async function externalApiV1Routes(fastify: FastifyInstance) {
  const app = fastify.withTypeProvider<ZodTypeProvider>();
  const svc = createExternalApiService(fastify);

  app.get("/customers", { schema: { summary: "List customers (external)", operationId: "apiListCustomers", tags: T, apiScopes: ["customers.read"], querystring: ApiListCustomersQuery, response: { 200: listResponse(ApiCustomerSchema), ...commonErrorResponses } } },
    async (request) => svc.listCustomers(request.query, apiAuthOf(request)));

  app.post("/complaints", { schema: { summary: "Create a complaint (external, reuses BE-4)", operationId: "apiCreateComplaint", tags: T, apiScopes: ["complaints.create"], body: ApiCreateComplaint, response: { 200: dataResponse(ComplaintDetailSchema), ...commonErrorResponses } } },
    async (request) => { const idem = requireIdempotencyKey(request); request.setAudit({ action: "api.complaints.create", entityType: "complaint", metadata: { apiKeyId: apiAuthOf(request).apiKeyId } }); return { data: await svc.createComplaint(request.body, apiAuthOf(request), idem) }; });

  app.get("/complaints/:id", { schema: { summary: "Get a complaint (external)", operationId: "apiGetComplaint", tags: T, apiScopes: ["complaints.read"], params: NumericIdParam, response: { 200: dataResponse(ComplaintDetailSchema), ...commonErrorResponses } } },
    async (request) => ({ data: await svc.getComplaint(request.params.id, apiAuthOf(request)) }));

  app.post("/complaints/:id/transition", { schema: { summary: "Transition a complaint stage (external; respects the state machine)", operationId: "apiTransitionComplaint", tags: T, apiScopes: ["complaints.update"], params: NumericIdParam, body: ApiTransitionComplaint, response: { 200: dataResponse(ComplaintDetailSchema), ...commonErrorResponses } } },
    async (request) => { request.setAudit({ action: "api.complaints.transition", entityType: "complaint", entityId: String(request.params.id), metadata: { apiKeyId: apiAuthOf(request).apiKeyId } }); return { data: await svc.transitionComplaint(request.params.id, request.body, apiAuthOf(request)) }; });

  app.get("/reports/kpi", { schema: { summary: "KPI scorecard (external, BI-friendly)", operationId: "apiReportsKpi", tags: T, apiScopes: ["reports.kpi.read"], querystring: ApiKpiQuery, response: { 200: dataResponse(ApiKpiSchema), ...commonErrorResponses } } },
    async (request) => ({ data: await svc.kpi(request.query, apiAuthOf(request)) }));
}
