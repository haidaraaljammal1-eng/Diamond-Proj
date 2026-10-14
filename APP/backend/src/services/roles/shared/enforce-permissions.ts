import type { FastifyInstance, FastifySchema } from "fastify";
import { AppError } from "src/lib/errors/app-error";
import { hasAnyPermission, requireAuth } from "src/lib/context/auth-context";
import {
  assertFunctionalRouteAuthorization,
  isFunctionalRbacV2Enabled,
} from "src/lib/rbac/functional-permissions/enforcement";
import { resolveRouteFunctionalRequirement } from "src/lib/rbac/functional-permissions/route-requirements";
import {
  isDiamondStaffRouteUrl,
  V2_LEGACY_ANY_FALLBACK_OPERATION_IDS,
  V2_SYSTEM_ADMIN_ONLY_OPERATION_IDS,
} from "src/lib/rbac/functional-permissions/route-coverage";

/**
 * ALWAYS-ON permission enforcement. Reads `schema.permissions` from the route
 * at request time and enforces it automatically — there is no manual
 * verifyPermission() call to forget. A route with no `permissions` under an
 * authenticated access level is AUTHENTICATED-only (still requires a valid
 * token via verifyToken). Default semantics: the caller needs ANY of the listed
 * permissions.
 *
 * When `FUNCTIONAL_RBAC_V2_ENABLED` is true and the route has a functional
 * mapping (`schema.functionalPermissions` or `operationId` registry), ONLY
 * functional grants apply — legacy keys are not an alternate bypass.
 */
export function enforcePermissions(fastify: FastifyInstance): void {
  fastify.addHook("preHandler", async (request) => {
    const schema = request.routeOptions?.schema as FastifySchema | undefined;
    const auth = requireAuth(request);

    if (isFunctionalRbacV2Enabled()) {
      const operationId = schema?.operationId as string | undefined;
      const fromSchema = schema?.functionalPermissions;
      const mapped =
        fromSchema && fromSchema.length > 0
          ? {
              keys: fromSchema,
              requireAll: schema?.functionalRequireAll ?? true,
            }
          : operationId
            ? resolveRouteFunctionalRequirement(operationId)
            : undefined;

      if (mapped) {
        assertFunctionalRouteAuthorization(auth, mapped);
        return;
      }

      if (
        operationId &&
        V2_SYSTEM_ADMIN_ONLY_OPERATION_IDS.has(operationId)
      ) {
        if (!auth.isSystemAdmin) throw AppError.forbidden();
        return;
      }

      const required = schema?.permissions;
      const url = request.routeOptions?.url ?? "";
      if (
        operationId &&
        required &&
        required.length > 0 &&
        isDiamondStaffRouteUrl(url) &&
        !auth.isSystemAdmin &&
        !V2_LEGACY_ANY_FALLBACK_OPERATION_IDS.has(operationId)
      ) {
        throw AppError.forbidden();
      }
    }

    const required = schema?.permissions;
    if (!required || required.length === 0) return;

    if (!hasAnyPermission(auth, required)) {
      throw AppError.forbidden();
    }
  });
}
