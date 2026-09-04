import type { FastifyInstance } from "fastify";
import { authenticatedHook } from "src/services/roles/shared/authenticated-hook";

/**
 * Administrative access level. Authentication is required and each route's
 * declared `permissions` are enforced automatically.
 */
export function adminHook(fastify: FastifyInstance): void {
  authenticatedHook(fastify);
}
