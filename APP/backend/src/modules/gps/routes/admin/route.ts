import type { FastifyInstance } from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import { z } from "zod";
import { commonErrorResponses, dataResponse, listResponse } from "src/lib/http/response";
import { PERMISSIONS } from "src/constants/permissions";
import { createGpsService } from "src/modules/gps/gps.service";
import { createGpsHistoryService } from "src/modules/gps/gps-history.service";
import { createGpsReportService } from "src/modules/gps/gps-report.service";
import { createGpsHealthService } from "src/modules/gps/gps-health.service";
import {
  GpsHistoryQuerySchema,
  GpsMileageSummarySchema,
  GpsOverspeedQuerySchema,
  GpsOverspeedSchema,
  GpsMapPointSchema,
  GpsSummarySchema,
  GpsVehicleDetailSchema,
  GpsVehicleHistorySchema,
  GpsVehicleHealthSchema,
  GpsVehicleIdParam,
  GpsVehicleListItemSchema,
  ListGpsVehiclesQuerySchema,
} from "src/modules/gps/gps.schema";

const T = ["GPS"];

export default async function gpsRoutes(fastify: FastifyInstance) {
  const app = fastify.withTypeProvider<ZodTypeProvider>();
  const gps = createGpsService(fastify);
  const history = createGpsHistoryService(fastify);
  const reports = createGpsReportService(fastify);
  const health = createGpsHealthService(fastify);

  app.get(
    "/vehicles/:vehicleId/health",
    {
      schema: {
        summary: "Fetch derived GPS health and device model",
        operationId: "getGpsVehicleHealth",
        tags: T,
        permissions: [PERMISSIONS.GPS_READ],
        params: GpsVehicleIdParam,
        response: {
          200: dataResponse(GpsVehicleHealthSchema),
          ...commonErrorResponses,
        },
      },
    },
    async (request) => ({ data: await health.getVehicleHealth(request.params.vehicleId) }),
  );

  app.get(
    "/vehicles/:vehicleId/mileage-summary",
    {
      schema: {
        summary: "Fetch on-demand GPS mileage summary",
        operationId: "getGpsVehicleMileageSummary",
        tags: T,
        permissions: [PERMISSIONS.GPS_READ],
        params: GpsVehicleIdParam,
        response: {
          200: dataResponse(GpsMileageSummarySchema),
          ...commonErrorResponses,
        },
      },
    },
    async (request) => ({ data: await reports.getMileageSummary(request.params.vehicleId) }),
  );

  app.get(
    "/vehicles/:vehicleId/overspeed",
    {
      schema: {
        summary: "Fetch on-demand GPS overspeed report",
        operationId: "getGpsVehicleOverspeed",
        tags: T,
        permissions: [PERMISSIONS.GPS_READ],
        params: GpsVehicleIdParam,
        querystring: GpsOverspeedQuerySchema,
        response: {
          200: dataResponse(GpsOverspeedSchema),
          ...commonErrorResponses,
        },
      },
    },
    async (request) => ({
      data: await reports.getOverspeed(request.params.vehicleId, request.query),
    }),
  );

  app.get(
    "/summary",
    {
      schema: {
        summary: "GPS Operations fleet summary",
        operationId: "getGpsSummary",
        tags: T,
        permissions: [PERMISSIONS.GPS_READ],
        response: {
          200: dataResponse(GpsSummarySchema),
          ...commonErrorResponses,
        },
      },
    },
    async () => ({ data: await gps.summary() }),
  );

  app.get(
    "/vehicles",
    {
      schema: {
        summary: "List vehicles with GPS tracking projection",
        operationId: "listGpsVehicles",
        tags: T,
        permissions: [PERMISSIONS.GPS_READ],
        querystring: ListGpsVehiclesQuerySchema,
        response: {
          200: listResponse(GpsVehicleListItemSchema),
          ...commonErrorResponses,
        },
      },
    },
    async (request) => gps.list(request.query),
  );

  app.get(
    "/map-points",
    {
      schema: {
        summary: "Map points with real GPS coordinates only",
        operationId: "listGpsMapPoints",
        tags: T,
        permissions: [PERMISSIONS.GPS_READ],
        response: {
          200: dataResponse(z.array(GpsMapPointSchema)),
          ...commonErrorResponses,
        },
      },
    },
    async () => ({ data: await gps.mapPoints() }),
  );

  app.get(
    "/vehicles/:vehicleId/history",
    {
      schema: {
        summary: "Fetch bounded on-demand GPS history for one vehicle",
        operationId: "getGpsVehicleHistory",
        tags: T,
        permissions: [PERMISSIONS.GPS_READ],
        params: GpsVehicleIdParam,
        querystring: GpsHistoryQuerySchema,
        response: {
          200: dataResponse(GpsVehicleHistorySchema),
          ...commonErrorResponses,
        },
      },
    },
    async (request) => ({
      data: await history.getVehicleHistory(request.params.vehicleId, request.query),
    }),
  );

  app.get(
    "/vehicles/:vehicleId",
    {
      schema: {
        summary: "GPS detail for one vehicle",
        operationId: "getGpsVehicle",
        tags: T,
        permissions: [PERMISSIONS.GPS_READ],
        params: GpsVehicleIdParam,
        response: {
          200: dataResponse(GpsVehicleDetailSchema),
          ...commonErrorResponses,
        },
      },
    },
    async (request) => ({ data: await gps.getVehicle(request.params.vehicleId) }),
  );
}
