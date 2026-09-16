import type { FastifyInstance } from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import { z } from "zod";
import { commonErrorResponses, dataResponse, listResponse } from "src/lib/http/response";
import { PERMISSIONS } from "src/constants/permissions";
import { createGpsService } from "src/modules/gps/gps.service";
import {
  GpsMapPointSchema,
  GpsSummarySchema,
  GpsVehicleDetailSchema,
  GpsVehicleIdParam,
  GpsVehicleListItemSchema,
  ListGpsVehiclesQuerySchema,
} from "src/modules/gps/gps.schema";

const T = ["GPS"];

export default async function gpsRoutes(fastify: FastifyInstance) {
  const app = fastify.withTypeProvider<ZodTypeProvider>();
  const gps = createGpsService(fastify);

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
