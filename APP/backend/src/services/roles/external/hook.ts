import type { FastifyInstance } from "fastify";
import { verifyApiKey } from "src/services/roles/shared/verify-api-key";
import { enforceApiScopes } from "src/services/roles/shared/enforce-api-scopes";

/**
 * External API access level: authenticated by an API KEY (not a user JWT), then
 * the route's declared `apiScopes` are enforced. Mounted for routes placed under
 * `routes/external/…` (module folder `api` → `/api/v1/…`).
 */
export function externalHook(fastify: FastifyInstance): void {
  verifyApiKey(fastify);
  enforceApiScopes(fastify);
}
