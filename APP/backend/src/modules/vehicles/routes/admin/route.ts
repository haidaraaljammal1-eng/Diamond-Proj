import type { FastifyInstance } from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import { z } from "zod";
import { createVehiclesService } from "src/modules/vehicles/vehicles.service";
import { createVehiclePhotosService } from "src/modules/vehicles/vehicle-photos.service";
import {
  CreateVehicleSchema,
  FleetVehicleTypeOptionSchema,
  ListVehiclesQuerySchema,
  UpdateVehicleSchema,
  VehicleCardSchema,
  VehicleDetailSchema,
  VehicleImageSchema,
  VehiclePublicSchema,
  VehicleWhatsAppShareBodySchema,
  VehicleWhatsAppShareResponseSchema,
} from "src/modules/vehicles/vehicles.schema";
import { createVehicleWhatsAppShareService } from "src/modules/vehicles/vehicle-whatsapp-share.service";
import { WhatsAppIdempotencyHeadersSchema } from "src/modules/whatsapp/whatsapp.schema";
import { whatsappSendRateLimit } from "src/plugins/rate-limit";
import { NumericIdParam } from "src/lib/http/common-schemas";
import {
  commonErrorResponses,
  dataResponse,
  listResponse,
  MessageResponseSchema,
} from "src/lib/http/response";
import { PERMISSIONS } from "src/constants/permissions";
import { AppError } from "src/lib/errors/app-error";
import { hasPermission, requireAuth } from "src/lib/context/auth-context";
import { t } from "src/config/i18n";

const PhotoParam = NumericIdParam.extend({ photoId: z.string().uuid() });

export default async function vehiclesRoutes(fastify: FastifyInstance) {
  const app = fastify.withTypeProvider<ZodTypeProvider>();
  const vehicles = createVehiclesService(fastify);
  const photos = createVehiclePhotosService(fastify);
  const galleryShare = createVehicleWhatsAppShareService(fastify);

  app.get(
    "/",
    {
      schema: {
        summary: "List vehicles",
        operationId: "listVehicles",
        tags: ["Vehicles"],
        permissions: [PERMISSIONS.VEHICLES_READ],
        querystring: ListVehiclesQuerySchema,
        response: { 200: listResponse(VehicleCardSchema), ...commonErrorResponses },
      },
    },
    async (request) => vehicles.list(request.query),
  );

  app.get(
    "/filter-options",
    {
      schema: {
        summary: "List fleet vehicle type filter options",
        operationId: "listVehicleFilterOptions",
        tags: ["Vehicles"],
        permissions: [PERMISSIONS.VEHICLES_READ],
        response: {
          200: dataResponse(z.array(FleetVehicleTypeOptionSchema)),
          ...commonErrorResponses,
        },
      },
    },
    async () => ({ data: await vehicles.listFilterOptions() }),
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
        response: { 200: dataResponse(VehicleDetailSchema), ...commonErrorResponses },
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
      const vehicle = await vehicles.update(
        request.params.id,
        request.body,
        requireAuth(request),
      );
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

  app.post(
    "/:id/photos",
    {
      schema: {
        summary: "Upload a vehicle photo",
        operationId: "uploadVehiclePhoto",
        tags: ["Vehicles"],
        permissions: [PERMISSIONS.VEHICLES_MANAGE],
        consumes: ["multipart/form-data"],
        params: NumericIdParam,
        response: { 201: dataResponse(VehicleImageSchema), ...commonErrorResponses },
      },
    },
    async (request, reply) => {
      const file = await request.file();
      if (!file) throw AppError.validation("Validation failed");
      const image = await photos.upload(request.params.id, file, requireAuth(request).id);
      request.setAudit({
        action: "vehicles.photo.upload",
        entityType: "vehicle_photo",
        entityId: image.id,
        metadata: { vehicleId: request.params.id },
      });
      reply.status(201);
      return { data: image };
    },
  );

  app.delete(
    "/:id/photos/:photoId",
    {
      schema: {
        summary: "Delete a vehicle photo",
        operationId: "deleteVehiclePhoto",
        tags: ["Vehicles"],
        permissions: [PERMISSIONS.VEHICLES_MANAGE],
        params: PhotoParam,
        response: { 200: MessageResponseSchema, ...commonErrorResponses },
      },
    },
    async (request) => {
      await photos.remove(request.params.id, request.params.photoId);
      request.setAudit({
        action: "vehicles.photo.delete",
        entityType: "vehicle_photo",
        entityId: request.params.photoId,
        metadata: { vehicleId: request.params.id },
      });
      return { data: { message: t("Deleted", { lng: request.language }) } };
    },
  );

  app.post(
    "/:id/share/whatsapp",
    {
      config: whatsappSendRateLimit(),
      schema: {
        summary: "Share vehicle gallery photos to a WhatsApp direct recipient",
        operationId: "shareVehicleGalleryWhatsApp",
        tags: ["Vehicles"],
        permissions: [PERMISSIONS.VEHICLES_READ, PERMISSIONS.WHATSAPP_SEND],
        params: NumericIdParam,
        headers: WhatsAppIdempotencyHeadersSchema,
        body: VehicleWhatsAppShareBodySchema,
        response: {
          200: dataResponse(VehicleWhatsAppShareResponseSchema),
          ...commonErrorResponses,
        },
      },
    },
    async (request) => {
      const identity = requireAuth(request);
      if (
        !hasPermission(identity, PERMISSIONS.VEHICLES_READ) ||
        !hasPermission(identity, PERMISSIONS.WHATSAPP_SEND)
      ) {
        throw AppError.forbidden();
      }
      const key = request.headers["idempotency-key"];
      const data = await galleryShare.shareGallery(
        request.params.id,
        identity,
        {
          idempotencyKey: typeof key === "string" ? key : "",
          conversationId: request.body.conversationId,
          providerContactId: request.body.providerContactId,
          photoIds: request.body.photoIds,
        },
        (partial) =>
          request.setAudit({
            action: partial.action,
            entityType: partial.entityType,
            entityId: partial.entityId,
            metadata: partial.metadata,
          }),
      );
      return { data };
    },
  );

  app.get(
    "/:id/photos/:photoId/stream",
    {
      schema: {
        summary: "Stream a vehicle photo",
        operationId: "streamVehiclePhoto",
        tags: ["Vehicles"],
        permissions: [PERMISSIONS.VEHICLES_READ],
        params: PhotoParam,
      },
    },
    async (request, reply) => {
      const { photo, stream } = await photos.openStream(
        request.params.id,
        request.params.photoId,
      );
      request.setAudit({
        action: "vehicles.photo.accessed",
        entityType: "vehicle_photo",
        entityId: photo.id,
        metadata: { vehicleId: request.params.id },
      });
      reply.header("Content-Type", photo.mimeType);
      reply.header(
        "Content-Disposition",
        `inline; filename="${encodeURIComponent(photo.attachmentId)}"`,
      );
      return reply.send(stream);
    },
  );
}
