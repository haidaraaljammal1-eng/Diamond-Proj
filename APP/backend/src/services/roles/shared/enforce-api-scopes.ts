import type { FastifyInstance, FastifySchema } from "fastify";
import { AppError } from "src/lib/errors/app-error";
import { ErrorCode } from "src/constants/error-codes";

/**
 * Always-on API-scope enforcement for the `external` access level. Reads
 * `schema.apiScopes` and requires the key to hold EVERY listed scope. A route
 * with no `apiScopes` is authenticated-by-key only.
 */
export function enforceApiScopes(fastify: FastifyInstance): void {
  fastify.addHook("preHandler", async (request) => {
    const schema = request.routeOptions?.schema as FastifySchema | undefined;
    const required = schema?.apiScopes;
    if (!required || required.length === 0) return;
    const auth = request.apiAuth;
    if (!auth) throw new AppError({ code: ErrorCode.UNAUTHORIZED, message: "Invalid or unauthorized API key", context: { reason: "api_key_invalid" } });
    for (const scope of required) {
      if (!auth.scopes.includes(scope)) throw new AppError({ code: ErrorCode.FORBIDDEN, message: "The API key lacks the required scope", context: { reason: "api_key_scope_denied", scope } });
    }
  });
}
