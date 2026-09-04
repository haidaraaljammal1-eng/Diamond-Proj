import type { FastifyInstance } from "fastify";

/**
 * Public access level: NO authentication. Routes placed under `routes/public/`
 * are explicitly public — the absence of a permission never makes a route
 * public by accident; only living in this folder does.
 */

export function publicHook(_fastify: FastifyInstance): void {
  // intentionally empty
}
