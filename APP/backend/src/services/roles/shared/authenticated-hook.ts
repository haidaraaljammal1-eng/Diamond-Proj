import type { FastifyInstance } from "fastify";
import { verifyToken } from "src/services/roles/shared/verify-token";
import { enforcePermissions } from "src/services/roles/shared/enforce-permissions";

/**
 * Shared hook for authenticated access levels: authenticate first, then enforce
 * the route's declared permissions. Order matters — auth populates request.auth
 * that the permission preHandler reads.
 *
 * They sit on DIFFERENT lifecycle hooks on purpose: authentication at
 * `preValidation` (before schema validation, so an anonymous caller gets 401 and
 * never sees the request schema) and permission enforcement at `preHandler`
 * (after validation, unchanged). Fastify runs preValidation before preHandler,
 * so `request.auth` is always populated by the time permissions are checked.
 */
export function authenticatedHook(fastify: FastifyInstance): void {
  verifyToken(fastify);
  enforcePermissions(fastify);
}
