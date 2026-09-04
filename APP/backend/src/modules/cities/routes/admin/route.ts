import type { FastifyInstance } from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import { createCitiesService } from "src/modules/cities/cities.service";
import {
  CityPublicSchema,
  CreateCitySchema,
  ListCitiesQuerySchema,
  UpdateCitySchema,
} from "src/modules/cities/cities.schema";
import { NumericIdParam } from "src/lib/http/common-schemas";
import { commonErrorResponses, dataResponse, listResponse } from "src/lib/http/response";
import { PERMISSIONS } from "src/constants/permissions";

export default async function citiesRoutes(fastify: FastifyInstance) {
  const app = fastify.withTypeProvider<ZodTypeProvider>();
  const cities = createCitiesService(fastify);

  app.get(
    "/",
    {
      schema: {
        summary: "List cities",
        operationId: "listCities",
        tags: ["Cities"],
        permissions: [PERMISSIONS.CITIES_READ],
        querystring: ListCitiesQuerySchema,
        response: { 200: listResponse(CityPublicSchema), ...commonErrorResponses },
      },
    },
    async (request) => cities.list(request.query),
  );

  app.get(
    "/:id",
    {
      schema: {
        summary: "Get a city",
        operationId: "getCity",
        tags: ["Cities"],
        permissions: [PERMISSIONS.CITIES_READ],
        params: NumericIdParam,
        response: { 200: dataResponse(CityPublicSchema), ...commonErrorResponses },
      },
    },
    async (request) => ({ data: await cities.get(request.params.id) }),
  );

  app.post(
    "/",
    {
      schema: {
        summary: "Create a city",
        operationId: "createCity",
        tags: ["Cities"],
        permissions: [PERMISSIONS.CITIES_MANAGE],
        body: CreateCitySchema,
        response: { 201: dataResponse(CityPublicSchema), ...commonErrorResponses },
      },
    },
    async (request, reply) => {
      const city = await cities.create(request.body);
      request.setAudit({
        action: "cities.create",
        entityType: "city",
        entityId: String(city.id),
      });
      reply.status(201);
      return { data: city };
    },
  );

  app.put(
    "/:id",
    {
      schema: {
        summary: "Update a city",
        operationId: "updateCity",
        tags: ["Cities"],
        permissions: [PERMISSIONS.CITIES_MANAGE],
        params: NumericIdParam,
        body: UpdateCitySchema,
        response: { 200: dataResponse(CityPublicSchema), ...commonErrorResponses },
      },
    },
    async (request) => {
      const city = await cities.update(request.params.id, request.body);
      request.setAudit({
        action: "cities.update",
        entityType: "city",
        entityId: String(request.params.id),
      });
      return { data: city };
    },
  );

  app.post(
    "/:id/deactivate",
    {
      schema: {
        summary: "Deactivate a city",
        operationId: "deactivateCity",
        tags: ["Cities"],
        permissions: [PERMISSIONS.CITIES_MANAGE],
        params: NumericIdParam,
        response: { 200: dataResponse(CityPublicSchema), ...commonErrorResponses },
      },
    },
    async (request) => {
      const city = await cities.setActive(request.params.id, false);
      request.setAudit({
        action: "cities.deactivate",
        entityType: "city",
        entityId: String(request.params.id),
      });
      return { data: city };
    },
  );

  app.post(
    "/:id/reactivate",
    {
      schema: {
        summary: "Reactivate a city",
        operationId: "reactivateCity",
        tags: ["Cities"],
        permissions: [PERMISSIONS.CITIES_MANAGE],
        params: NumericIdParam,
        response: { 200: dataResponse(CityPublicSchema), ...commonErrorResponses },
      },
    },
    async (request) => {
      const city = await cities.setActive(request.params.id, true);
      request.setAudit({
        action: "cities.reactivate",
        entityType: "city",
        entityId: String(request.params.id),
      });
      return { data: city };
    },
  );
}
