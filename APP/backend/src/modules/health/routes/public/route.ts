import type { FastifyInstance } from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import { z } from "zod";

/** Public health/readiness. Never exposes secrets. */
export default async function healthRoutes(fastify: FastifyInstance) {
  const app = fastify.withTypeProvider<ZodTypeProvider>();

  app.get(
    "/",
    {
      schema: {
        summary: "Liveness probe",
        operationId: "healthLive",
        tags: ["Health"],
        public: true,
        response: { 200: z.object({ data: z.object({ status: z.string() }) }) },
      },
    },
    async () => ({ data: { status: "ok" } }),
  );

  app.get(
    "/ready",
    {
      schema: {
        summary: "Readiness probe (checks database)",
        operationId: "healthReady",
        tags: ["Health"],
        public: true,
        response: {
          200: z.object({ data: z.object({ status: z.string(), db: z.string() }) }),
          503: z.object({ data: z.object({ status: z.string(), db: z.string() }) }),
        },
      },
    },
    async (_request, reply) => {
      try {
        await fastify.prisma.$queryRaw`SELECT 1`;
        return { data: { status: "ok", db: "up" } };
      } catch {
        return reply.status(503).send({ data: { status: "degraded", db: "down" } });
      }
    },
  );
}
