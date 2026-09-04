import type { FastifyInstance, FastifySchema } from "fastify";
import { AppError } from "src/lib/errors/app-error";
import { hasAnyPermission, requireAuth } from "src/lib/context/auth-context";

/**
 * ALWAYS-ON permission enforcement. Reads `schema.permissions` from the route
 * at request time and enforces it automatically — there is no manual
 * verifyPermission() call to forget. A route with no `permissions` under an
 * authenticated access level is AUTHENTICATED-only (still requires a valid
 * token via verifyToken). Default semantics: the caller needs ANY of the listed
 * permissions.
 */
export function enforcePermissions(fastify: FastifyInstance): void {
  fastify.addHook("preHandler", async (request) => {
    const schema = request.routeOptions?.schema as FastifySchema | undefined;
    const required = schema?.permissions;
    if (!required || required.length === 0) return;

    const auth = requireAuth(request);
    if (!hasAnyPermission(auth, required)) {
      throw AppError.forbidden();
    }
  });
}
