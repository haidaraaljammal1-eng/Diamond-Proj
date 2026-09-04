import type { FastifyInstance } from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import { createVehiclesService } from "src/modules/vehicles/vehicles.service";
import {
  CreateVehicleSchema,
  ListVehiclesQuerySchema,
  UpdateVehicleSchema,
  VehiclePublicSchema,
} from "src/modules/vehicles/vehicles.schema";
import { NumericIdParam } from "src/lib/http/common-schemas";
import { commonErrorResponses, dataResponse, listResponse } from "src/lib/http/response";
import { PERMISSIONS } from "src/constants/permissions";

export default async function vehiclesRoutes(fastify: FastifyInstance) {
  const app = fastify.withTypeProvider<ZodTypeProvider>();
  const vehicles = createVehiclesService(fastify);

  app.get(
    "/",
    {
      schema: {
        summary: "List vehicles",
        operationId: "listVehicles",
        tags: ["Vehicles"],
        permissions: [PERMISSIONS.VEHICLES_READ],
        querystring: ListVehiclesQuerySchema,
        response: { 200: listResponse(VehiclePublicSchema), ...commonErrorResponses },
      },
    },
    async (request) => vehicles.list(request.query),
  );

  app.get(
    "/:id",
    {
      schema: {
        summary: "Get a vehicle",
        operationId: "getVehicle",
        tags: ["Vehicles"],
        permissions: [PERMISSIONS.VEHICLES_READ],
        params: NumericIdParam,
        response: { 200: dataResponse(VehiclePublicSchema), ...commonErrorResponses },
      },
    },
    async (request) => ({ data: await vehicles.get(request.params.id) }),
  );

  app.post(
    "/",
    {
      schema: {
        summary: "Create a vehicle",
        operationId: "createVehicle",
        tags: ["Vehicles"],
        permissions: [PERMISSIONS.VEHICLES_MANAGE],
        body: CreateVehicleSchema,
        response: { 201: dataResponse(VehiclePublicSchema), ...commonErrorResponses },
      },
    },
    async (request, reply) => {
      const vehicle = await vehicles.create(request.body);
      request.setAudit({
        action: "vehicles.create",
        entityType: "vehicle",
        entityId: String(vehicle.id),
      });
      reply.status(201);
      return { data: vehicle };
    },
  );

  app.put(
    "/:id",
    {
      schema: {
        summary: "Update a vehicle",
        operationId: "updateVehicle",
        tags: ["Vehicles"],
        permissions: [PERMISSIONS.VEHICLES_MANAGE],
        params: NumericIdParam,
        body: UpdateVehicleSchema,
        response: { 200: dataResponse(VehiclePublicSchema), ...commonErrorResponses },
      },
    },
    async (request) => {
      const vehicle = await vehicles.update(request.params.id, request.body);
      request.setAudit({
        action: "vehicles.update",
        entityType: "vehicle",
        entityId: String(request.params.id),
      });
      return { data: vehicle };
    },
  );

  app.post(
    "/:id/deactivate",
    {
      schema: {
        summary: "Deactivate a vehicle",
        operationId: "deactivateVehicle",
        tags: ["Vehicles"],
        permissions: [PERMISSIONS.VEHICLES_MANAGE],
        params: NumericIdParam,
        response: { 200: dataResponse(VehiclePublicSchema), ...commonErrorResponses },
      },
    },
    async (request) => {
      const vehicle = await vehicles.setActive(request.params.id, false);
      request.setAudit({
        action: "vehicles.deactivate",
        entityType: "vehicle",
        entityId: String(request.params.id),
      });
      return { data: vehicle };
    },
  );

  app.post(
    "/:id/reactivate",
    {
      schema: {
        summary: "Reactivate a vehicle",
        operationId: "reactivateVehicle",
        tags: ["Vehicles"],
        permissions: [PERMISSIONS.VEHICLES_MANAGE],
        params: NumericIdParam,
        response: { 200: dataResponse(VehiclePublicSchema), ...commonErrorResponses },
      },
    },
    async (request) => {
      const vehicle = await vehicles.setActive(request.params.id, true);
      request.setAudit({
        action: "vehicles.reactivate",
        entityType: "vehicle",
        entityId: String(request.params.id),
      });
      return { data: vehicle };
    },
  );
}
