import type { FastifyInstance } from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import { NumericIdParam } from "src/lib/http/common-schemas";
import { commonErrorResponses, dataResponse, listResponse } from "src/lib/http/response";
import { requireAuth } from "src/lib/context/auth-context";
import { PERMISSIONS } from "src/constants/permissions";
import { createMaintenanceService } from "src/modules/maintenance/maintenance.service";
import {
  CreateMaintenanceSchema,
  ListMaintenanceQuerySchema,
  MaintenanceOrderDetailSchema,
  MaintenanceOrderSchema,
  MaintenanceSummarySchema,
  UpdateMaintenanceSchema,
} from "src/modules/maintenance/maintenance.schema";

const T = ["Maintenance"];

export default async function maintenanceRoutes(fastify: FastifyInstance) {
  const app = fastify.withTypeProvider<ZodTypeProvider>();
  const maintenance = createMaintenanceService(fastify);

  app.get(
    "/",
    {
      schema: {
        summary: "List maintenance orders",
        operationId: "listMaintenanceOrders",
        tags: T,
        permissions: [PERMISSIONS.MAINTENANCE_READ],
        querystring: ListMaintenanceQuerySchema,
        response: {
          200: listResponse(MaintenanceOrderSchema),
          ...commonErrorResponses,
        },
      },
    },
    async (request) => maintenance.list(request.query),
  );

  app.get(
    "/summary",
    {
      schema: {
        summary: "Maintenance center KPI summary",
        operationId: "getMaintenanceSummary",
        tags: T,
        permissions: [PERMISSIONS.MAINTENANCE_READ],
        response: {
          200: dataResponse(MaintenanceSummarySchema),
          ...commonErrorResponses,
        },
      },
    },
    async () => ({ data: await maintenance.summary() }),
  );

  app.get(
    "/:id",
    {
      schema: {
        summary: "Get a maintenance order",
        operationId: "getMaintenanceOrder",
        tags: T,
        permissions: [PERMISSIONS.MAINTENANCE_READ],
        params: NumericIdParam,
        response: {
          200: dataResponse(MaintenanceOrderDetailSchema),
          ...commonErrorResponses,
        },
      },
    },
    async (request) => ({ data: await maintenance.get(request.params.id) }),
  );

  app.post(
    "/",
    {
      schema: {
        summary: "Add a vehicle to maintenance",
        operationId: "createMaintenanceOrder",
        tags: T,
        permissions: [PERMISSIONS.MAINTENANCE_MANAGE],
        body: CreateMaintenanceSchema,
        response: {
          201: dataResponse(MaintenanceOrderDetailSchema),
          ...commonErrorResponses,
        },
      },
    },
    async (request, reply) => {
      const actor = requireAuth(request);
      const order = await maintenance.create(request.body, actor);
      request.setAudit({
        action: "maintenance.create",
        entityType: "maintenance_order",
        entityId: String(order.id),
        metadata: { vehicleId: order.vehicleId, startMode: request.body.startMode },
      });
      reply.status(201);
      return { data: order };
    },
  );

  app.patch(
    "/:id",
    {
      schema: {
        summary: "Update maintenance order details",
        operationId: "updateMaintenanceOrder",
        tags: T,
        permissions: [PERMISSIONS.MAINTENANCE_MANAGE],
        params: NumericIdParam,
        body: UpdateMaintenanceSchema,
        response: {
          200: dataResponse(MaintenanceOrderDetailSchema),
          ...commonErrorResponses,
        },
      },
    },
    async (request) => {
      const order = await maintenance.update(request.params.id, request.body);
      request.setAudit({
        action: "maintenance.update",
        entityType: "maintenance_order",
        entityId: String(request.params.id),
      });
      return { data: order };
    },
  );

  app.post(
    "/:id/start",
    {
      schema: {
        summary: "Start a scheduled maintenance order",
        operationId: "startMaintenanceOrder",
        tags: T,
        permissions: [PERMISSIONS.MAINTENANCE_MANAGE],
        params: NumericIdParam,
        response: {
          200: dataResponse(MaintenanceOrderDetailSchema),
          ...commonErrorResponses,
        },
      },
    },
    async (request) => {
      const order = await maintenance.start(request.params.id);
      request.setAudit({
        action: "maintenance.start",
        entityType: "maintenance_order",
        entityId: String(request.params.id),
      });
      return { data: order };
    },
  );

  app.post(
    "/:id/ready",
    {
      schema: {
        summary: "Mark maintenance order ready for pickup",
        operationId: "readyMaintenanceOrder",
        tags: T,
        permissions: [PERMISSIONS.MAINTENANCE_MANAGE],
        params: NumericIdParam,
        response: {
          200: dataResponse(MaintenanceOrderDetailSchema),
          ...commonErrorResponses,
        },
      },
    },
    async (request) => {
      const order = await maintenance.markReady(request.params.id);
      request.setAudit({
        action: "maintenance.ready",
        entityType: "maintenance_order",
        entityId: String(request.params.id),
      });
      return { data: order };
    },
  );

  app.post(
    "/:id/complete",
    {
      schema: {
        summary: "Complete maintenance and return vehicle to fleet",
        operationId: "completeMaintenanceOrder",
        tags: T,
        permissions: [PERMISSIONS.MAINTENANCE_MANAGE],
        params: NumericIdParam,
        response: {
          200: dataResponse(MaintenanceOrderDetailSchema),
          ...commonErrorResponses,
        },
      },
    },
    async (request) => {
      const order = await maintenance.complete(request.params.id);
      request.setAudit({
        action: "maintenance.complete",
        entityType: "maintenance_order",
        entityId: String(request.params.id),
        metadata: { vehicleId: order.vehicleId },
      });
      return { data: order };
    },
  );

  app.post(
    "/:id/cancel",
    {
      schema: {
        summary: "Cancel a scheduled maintenance order",
        operationId: "cancelMaintenanceOrder",
        tags: T,
        permissions: [PERMISSIONS.MAINTENANCE_MANAGE],
        params: NumericIdParam,
        response: {
          200: dataResponse(MaintenanceOrderDetailSchema),
          ...commonErrorResponses,
        },
      },
    },
    async (request) => {
      const order = await maintenance.cancel(request.params.id);
      request.setAudit({
        action: "maintenance.cancel",
        entityType: "maintenance_order",
        entityId: String(request.params.id),
      });
      return { data: order };
    },
  );
}
