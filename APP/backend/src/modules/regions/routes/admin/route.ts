import type { FastifyInstance } from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import { createRegionsService } from "src/modules/regions/regions.service";
import {
  CreateRegionSchema,
  ListRegionsQuerySchema,
  RegionPublicSchema,
  UpdateRegionSchema,
} from "src/modules/regions/regions.schema";
import { NumericIdParam } from "src/lib/http/common-schemas";
import { commonErrorResponses, dataResponse, listResponse } from "src/lib/http/response";
import { PERMISSIONS } from "src/constants/permissions";

export default async function regionsRoutes(fastify: FastifyInstance) {
  const app = fastify.withTypeProvider<ZodTypeProvider>();
  const regions = createRegionsService(fastify);

  app.get(
    "/",
    {
      schema: {
        summary: "List regions",
        operationId: "listRegions",
        tags: ["Regions"],
        permissions: [PERMISSIONS.REGIONS_READ],
        querystring: ListRegionsQuerySchema,
        response: { 200: listResponse(RegionPublicSchema), ...commonErrorResponses },
      },
    },
    async (request) => regions.list(request.query),
  );

  app.get(
    "/:id",
    {
      schema: {
        summary: "Get a region",
        operationId: "getRegion",
        tags: ["Regions"],
        permissions: [PERMISSIONS.REGIONS_READ],
        params: NumericIdParam,
        response: { 200: dataResponse(RegionPublicSchema), ...commonErrorResponses },
      },
    },
    async (request) => ({ data: await regions.get(request.params.id) }),
  );

  app.post(
    "/",
    {
      schema: {
        summary: "Create a region",
        operationId: "createRegion",
        tags: ["Regions"],
        permissions: [PERMISSIONS.REGIONS_MANAGE],
        body: CreateRegionSchema,
        response: { 201: dataResponse(RegionPublicSchema), ...commonErrorResponses },
      },
    },
    async (request, reply) => {
      const region = await regions.create(request.body);
      request.setAudit({
        action: "regions.create",
        entityType: "region",
        entityId: String(region.id),
      });
      reply.status(201);
      return { data: region };
    },
  );

  app.put(
    "/:id",
    {
      schema: {
        summary: "Update a region",
        operationId: "updateRegion",
        tags: ["Regions"],
        permissions: [PERMISSIONS.REGIONS_MANAGE],
        params: NumericIdParam,
        body: UpdateRegionSchema,
        response: { 200: dataResponse(RegionPublicSchema), ...commonErrorResponses },
      },
    },
    async (request) => {
      const region = await regions.update(request.params.id, request.body);
      request.setAudit({
        action: "regions.update",
        entityType: "region",
        entityId: String(request.params.id),
      });
      return { data: region };
    },
  );

  app.post(
    "/:id/deactivate",
    {
      schema: {
        summary: "Deactivate a region",
        operationId: "deactivateRegion",
        tags: ["Regions"],
        permissions: [PERMISSIONS.REGIONS_MANAGE],
        params: NumericIdParam,
        response: { 200: dataResponse(RegionPublicSchema), ...commonErrorResponses },
      },
    },
    async (request) => {
      const region = await regions.setActive(request.params.id, false);
      request.setAudit({
        action: "regions.deactivate",
        entityType: "region",
        entityId: String(request.params.id),
      });
      return { data: region };
    },
  );

  app.post(
    "/:id/reactivate",
    {
      schema: {
        summary: "Reactivate a region",
        operationId: "reactivateRegion",
        tags: ["Regions"],
        permissions: [PERMISSIONS.REGIONS_MANAGE],
        params: NumericIdParam,
        response: { 200: dataResponse(RegionPublicSchema), ...commonErrorResponses },
      },
    },
    async (request) => {
      const region = await regions.setActive(request.params.id, true);
      request.setAudit({
        action: "regions.reactivate",
        entityType: "region",
        entityId: String(request.params.id),
      });
      return { data: region };
    },
  );
}
