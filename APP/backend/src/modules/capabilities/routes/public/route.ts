import type { FastifyInstance } from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import { z } from "zod";

/** Public, safe capability flags for the frontend. No secrets. */
export default async function capabilitiesRoutes(fastify: FastifyInstance) {
  const app = fastify.withTypeProvider<ZodTypeProvider>();

  app.get(
    "/",
    {
      schema: {
        summary: "Runtime capabilities",
        operationId: "getCapabilities",
        tags: ["Meta"],
        public: true,
        response: {
          200: z.object({
            data: z.object({
              email: z.boolean(),
              files: z.boolean(),
              push: z.boolean(),
              sms: z.boolean(),
            }),
          }),
        },
      },
    },
    async () => ({ data: fastify.capabilities }),
  );
}
