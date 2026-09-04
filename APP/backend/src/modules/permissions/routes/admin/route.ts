import type { FastifyInstance } from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import { z } from "zod";
import { commonErrorResponses, dataResponse } from "src/lib/http/response";
import { PERMISSIONS } from "src/constants/permissions";

const PermissionSchema = z.object({
  id: z.number().int(),
  key: z.string(),
  category: z.string().nullable(),
  description: z.string().nullable(),
});

/**
 * Read-only permission catalog. The set of permissions is fixed by the code
 * (constants/permissions.ts) and seeded — there is no create/update/delete API.
 */
export default async function permissionsRoutes(fastify: FastifyInstance) {
  const app = fastify.withTypeProvider<ZodTypeProvider>();

  app.get(
    "/",
    {
      schema: {
        summary: "List all permissions",
        operationId: "listPermissions",
        tags: ["Permissions"],
        permissions: [PERMISSIONS.PERMISSIONS_READ],
        response: {
          200: dataResponse(z.array(PermissionSchema)),
          ...commonErrorResponses,
        },
      },
    },
    async () => ({
      data: await fastify.prisma.permission.findMany({
        orderBy: [{ category: "asc" }, { key: "asc" }],
      }),
    }),
  );
}
