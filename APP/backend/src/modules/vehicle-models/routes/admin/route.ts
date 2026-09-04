import type { FastifyInstance } from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import { createVehicleModelsService } from "src/modules/vehicle-models/vehicle-models.service";
import {
  CreateVehicleModelSchema,
  ListVehicleModelsQuerySchema,
  UpdateVehicleModelSchema,
  VehicleModelPublicSchema,
} from "src/modules/vehicle-models/vehicle-models.schema";
import { NumericIdParam } from "src/lib/http/common-schemas";
import { commonErrorResponses, dataResponse, listResponse } from "src/lib/http/response";
import { PERMISSIONS } from "src/constants/permissions";

export default async function vehicleModelsRoutes(fastify: FastifyInstance) {
  const app = fastify.withTypeProvider<ZodTypeProvider>();
  const vehicleModels = createVehicleModelsService(fastify);

  app.get(
    "/",
    {
      schema: {
        summary: "List vehicle models",
        operationId: "listVehicleModels",
        tags: ["Vehicle Models"],
        permissions: [PERMISSIONS.VEHICLE_MODELS_READ],
        querystring: ListVehicleModelsQuerySchema,
        response: {
          200: listResponse(VehicleModelPublicSchema),
          ...commonErrorResponses,
        },
      },
    },
    async (request) => vehicleModels.list(request.query),
  );

  app.get(
    "/:id",
    {
      schema: {
        summary: "Get a vehicle model",
        operationId: "getVehicleModel",
        tags: ["Vehicle Models"],
        permissions: [PERMISSIONS.VEHICLE_MODELS_READ],
        params: NumericIdParam,
        response: { 200: dataResponse(VehicleModelPublicSchema), ...commonErrorResponses },
      },
    },
    async (request) => ({ data: await vehicleModels.get(request.params.id) }),
  );

  app.post(
    "/",
    {
      schema: {
        summary: "Create a vehicle model",
        operationId: "createVehicleModel",
        tags: ["Vehicle Models"],
        permissions: [PERMISSIONS.VEHICLE_MODELS_MANAGE],
        body: CreateVehicleModelSchema,
        response: { 201: dataResponse(VehicleModelPublicSchema), ...commonErrorResponses },
      },
    },
    async (request, reply) => {
      const model = await vehicleModels.create(request.body);
      request.setAudit({
        action: "vehicle_models.create",
        entityType: "vehicle_model",
        entityId: String(model.id),
      });
      reply.status(201);
      return { data: model };
    },
  );

  app.put(
    "/:id",
    {
      schema: {
        summary: "Update a vehicle model",
        operationId: "updateVehicleModel",
        tags: ["Vehicle Models"],
        permissions: [PERMISSIONS.VEHICLE_MODELS_MANAGE],
        params: NumericIdParam,
        body: UpdateVehicleModelSchema,
        response: { 200: dataResponse(VehicleModelPublicSchema), ...commonErrorResponses },
      },
    },
    async (request) => {
      const model = await vehicleModels.update(request.params.id, request.body);
      request.setAudit({
        action: "vehicle_models.update",
        entityType: "vehicle_model",
        entityId: String(request.params.id),
      });
      return { data: model };
    },
  );

  app.post(
    "/:id/deactivate",
    {
      schema: {
        summary: "Deactivate a vehicle model",
        operationId: "deactivateVehicleModel",
        tags: ["Vehicle Models"],
        permissions: [PERMISSIONS.VEHICLE_MODELS_MANAGE],
        params: NumericIdParam,
        response: { 200: dataResponse(VehicleModelPublicSchema), ...commonErrorResponses },
      },
    },
    async (request) => {
      const model = await vehicleModels.setActive(request.params.id, false);
      request.setAudit({
        action: "vehicle_models.deactivate",
        entityType: "vehicle_model",
        entityId: String(request.params.id),
      });
      return { data: model };
    },
  );

  app.post(
    "/:id/reactivate",
    {
      schema: {
        summary: "Reactivate a vehicle model",
        operationId: "reactivateVehicleModel",
        tags: ["Vehicle Models"],
        permissions: [PERMISSIONS.VEHICLE_MODELS_MANAGE],
        params: NumericIdParam,
        response: { 200: dataResponse(VehicleModelPublicSchema), ...commonErrorResponses },
      },
    },
    async (request) => {
      const model = await vehicleModels.setActive(request.params.id, true);
      request.setAudit({
        action: "vehicle_models.reactivate",
        entityType: "vehicle_model",
        entityId: String(request.params.id),
      });
      return { data: model };
    },
  );
}
