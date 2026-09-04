import type { FastifyInstance } from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import { z } from "zod";
import { NumericIdParam } from "src/lib/http/common-schemas";
import { commonErrorResponses, dataResponse } from "src/lib/http/response";
import { requireAuth } from "src/lib/context/auth-context";
import { PERMISSIONS } from "src/constants/permissions";
import { createApiKeysService } from "src/modules/reports/api-keys.service";
import { ApiKeyCreatedSchema, ApiKeySchema, CreateApiKeySchema, ListApiKeysQuerySchema } from "src/modules/reports/reports.schema";

const T = ["API Keys"];

/** Mounts under /api-keys. */
export default async function apiKeysRoutes(fastify: FastifyInstance) {
  const app = fastify.withTypeProvider<ZodTypeProvider>();
  const svc = createApiKeysService(fastify);
  const P = PERMISSIONS;

  app.get("/", { schema: { summary: "List API keys", operationId: "listApiKeys", tags: T, permissions: [P.API_KEYS_READ], querystring: ListApiKeysQuerySchema, response: { 200: dataResponse(z.array(ApiKeySchema)), ...commonErrorResponses } } },
    async (request) => ({ data: await svc.list(request.query) }));

  app.post("/", { schema: { summary: "Create an API key (secret shown once)", operationId: "createApiKey", tags: T, permissions: [P.API_KEYS_MANAGE], body: CreateApiKeySchema, response: { 200: dataResponse(ApiKeyCreatedSchema), ...commonErrorResponses } } },
    async (request) => {
      const created = await svc.create(request.body, requireAuth(request));
      // Never audit the secret — id + prefix + scopes only.
      request.setAudit({ action: "api_keys.create", entityType: "api_key", entityId: String(created.id), metadata: { prefix: created.prefix, scopes: created.scopes, allBranches: created.allBranches } });
      return { data: created };
    });

  app.post("/:id/revoke", { schema: { summary: "Revoke an API key", operationId: "revokeApiKey", tags: T, permissions: [P.API_KEYS_MANAGE], params: NumericIdParam, response: { 200: dataResponse(ApiKeySchema), ...commonErrorResponses } } },
    async (request) => { request.setAudit({ action: "api_keys.revoke", entityType: "api_key", entityId: String(request.params.id) }); return { data: await svc.revoke(request.params.id) }; });
}
