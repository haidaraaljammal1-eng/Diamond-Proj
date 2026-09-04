import type { FastifyInstance } from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import { createBranchesService } from "src/modules/branches/branches.service";
import {
  BranchPublicSchema,
  CreateBranchSchema,
  ListBranchesQuerySchema,
  UpdateBranchSchema,
} from "src/modules/branches/branches.schema";
import { NumericIdParam } from "src/lib/http/common-schemas";
import { commonErrorResponses, dataResponse, listResponse } from "src/lib/http/response";
import { PERMISSIONS } from "src/constants/permissions";

export default async function branchesRoutes(fastify: FastifyInstance) {
  const app = fastify.withTypeProvider<ZodTypeProvider>();
  const branches = createBranchesService(fastify);

  app.get(
    "/",
    {
      schema: {
        summary: "List branches",
        operationId: "listBranches",
        tags: ["Branches"],
        permissions: [PERMISSIONS.BRANCHES_READ],
        querystring: ListBranchesQuerySchema,
        response: { 200: listResponse(BranchPublicSchema), ...commonErrorResponses },
      },
    },
    async (request) => branches.list(request.query),
  );

  app.get(
    "/:id",
    {
      schema: {
        summary: "Get a branch",
        operationId: "getBranch",
        tags: ["Branches"],
        permissions: [PERMISSIONS.BRANCHES_READ],
        params: NumericIdParam,
        response: { 200: dataResponse(BranchPublicSchema), ...commonErrorResponses },
      },
    },
    async (request) => ({ data: await branches.get(request.params.id) }),
  );

  app.post(
    "/",
    {
      schema: {
        summary: "Create a branch",
        operationId: "createBranch",
        tags: ["Branches"],
        permissions: [PERMISSIONS.BRANCHES_MANAGE],
        body: CreateBranchSchema,
        response: { 201: dataResponse(BranchPublicSchema), ...commonErrorResponses },
      },
    },
    async (request, reply) => {
      const branch = await branches.create(request.body);
      request.setAudit({
        action: "branches.create",
        entityType: "branch",
        entityId: String(branch.id),
      });
      reply.status(201);
      return { data: branch };
    },
  );

  app.put(
    "/:id",
    {
      schema: {
        summary: "Update a branch",
        operationId: "updateBranch",
        tags: ["Branches"],
        permissions: [PERMISSIONS.BRANCHES_MANAGE],
        params: NumericIdParam,
        body: UpdateBranchSchema,
        response: { 200: dataResponse(BranchPublicSchema), ...commonErrorResponses },
      },
    },
    async (request) => {
      const branch = await branches.update(request.params.id, request.body);
      request.setAudit({
        action: "branches.update",
        entityType: "branch",
        entityId: String(request.params.id),
      });
      return { data: branch };
    },
  );

  app.post(
    "/:id/deactivate",
    {
      schema: {
        summary: "Deactivate a branch",
        operationId: "deactivateBranch",
        tags: ["Branches"],
        permissions: [PERMISSIONS.BRANCHES_MANAGE],
        params: NumericIdParam,
        response: { 200: dataResponse(BranchPublicSchema), ...commonErrorResponses },
      },
    },
    async (request) => {
      const branch = await branches.setActive(request.params.id, false);
      request.setAudit({
        action: "branches.deactivate",
        entityType: "branch",
        entityId: String(request.params.id),
      });
      return { data: branch };
    },
  );

  app.post(
    "/:id/reactivate",
    {
      schema: {
        summary: "Reactivate a branch",
        operationId: "reactivateBranch",
        tags: ["Branches"],
        permissions: [PERMISSIONS.BRANCHES_MANAGE],
        params: NumericIdParam,
        response: { 200: dataResponse(BranchPublicSchema), ...commonErrorResponses },
      },
    },
    async (request) => {
      const branch = await branches.setActive(request.params.id, true);
      request.setAudit({
        action: "branches.reactivate",
        entityType: "branch",
        entityId: String(request.params.id),
      });
      return { data: branch };
    },
  );
}
