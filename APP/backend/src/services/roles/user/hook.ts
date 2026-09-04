import type { FastifyInstance } from "fastify";
import { authenticatedHook } from "src/services/roles/shared/authenticated-hook";

/** Authenticated end-user access level. */
export function userHook(fastify: FastifyInstance): void {
  authenticatedHook(fastify);
}
