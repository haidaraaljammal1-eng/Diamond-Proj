import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import type { FastifyInstance } from "fastify";
import type { AuthUser } from "src/lib/context/auth-context";
import { AppError } from "src/lib/errors/app-error";
import { ErrorCode } from "src/constants/error-codes";
import { env } from "src/config/env";
import { resolveStoragePath } from "src/lib/files/storage-key";
import { findOperationalWhatsAppConnection } from "src/modules/invoices/invoice-whatsapp-connection";
import { VEHICLE_GALLERY_MAX_PHOTOS } from "src/modules/vehicles/vehicle-photos.service";
import { resolveFleetShareWhatsAppConversation } from "src/modules/vehicles/vehicle-whatsapp-share-recipient";
import { vehicleDisplayName } from "src/modules/vehicles/vehicles.mapper";
import { createWhatsAppSendService } from "src/modules/whatsapp/whatsapp.send.service";
import { whatsappError } from "src/modules/whatsapp/whatsapp.errors";

export type VehicleWhatsAppSharePhotoResult = {
  photoId: string;
  status: "SENT" | "FAILED" | "UNCERTAIN" | "SKIPPED";
  messageId?: string;
  reason?: string;
};

export type VehicleWhatsAppShareResult = {
  conversationId: string;
  results: VehicleWhatsAppSharePhotoResult[];
};

function perPhotoIdempotencyKey(batchKey: string, photoId: string): string {
  const digest = createHash("sha256").update(`${batchKey}:${photoId}`).digest("hex");
  return `vshare:${digest.slice(0, 48)}`;
}

function buildCaption(vehicle: {
  vehicleName: string | null;
  plateNumber: string | null;
  model?: { name: string | null } | null;
  modelYear: number | null;
}): string {
  const name = vehicleDisplayName({
    vehicleName: vehicle.vehicleName,
    modelName: vehicle.model?.name ?? null,
    modelYear: vehicle.modelYear,
    plateNumber: vehicle.plateNumber,
  });
  const plate = vehicle.plateNumber?.trim();
  if (plate) return `${name} — ${plate}`.slice(0, 1024);
  return name.slice(0, 1024);
}

export function createVehicleWhatsAppShareService(fastify: FastifyInstance) {
  const prisma = fastify.prisma;
  const whatsappSend = createWhatsAppSendService(fastify);
  const storageDir = env.FILE_STORAGE_DIR;

  async function shareGallery(
    vehicleId: number,
    actor: AuthUser,
    input: {
      idempotencyKey: string;
      conversationId?: string;
      providerContactId?: string;
      photoIds?: string[];
    },
    audit: (partial: { action: string; entityType: string; entityId: string; metadata?: Record<string, unknown> }) => void,
  ): Promise<VehicleWhatsAppShareResult> {
    const batchKey = input.idempotencyKey.trim();
    if (batchKey.length < 8 || batchKey.length > 128) {
      throw whatsappError.idempotencyKeyRequired();
    }

    const vehicle = await prisma.vehicle.findUnique({
      where: { id: vehicleId },
      select: {
        id: true,
        vehicleName: true,
        plateNumber: true,
        modelYear: true,
        model: { select: { name: true } },
      },
    });
    if (!vehicle) throw AppError.notFound("Vehicle not found");

    const galleryRows = await prisma.vehiclePhoto.findMany({
      where: { vehicleId },
      orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
      include: { attachment: { select: { mimeType: true, storageKey: true, originalName: true } } },
    });

    if (galleryRows.length === 0) {
      throw new AppError({
        code: ErrorCode.VALIDATION_ERROR,
        message: "Vehicle has no photos to share",
        context: { reason: "VEHICLE_GALLERY_EMPTY" },
      });
    }

    let selected = galleryRows;
    if (input.photoIds && input.photoIds.length > 0) {
      const allowed = new Set(galleryRows.map((row) => row.id));
      for (const id of input.photoIds) {
        if (!allowed.has(id)) {
          throw new AppError({
            code: ErrorCode.VALIDATION_ERROR,
            message: "Photo does not belong to this vehicle",
            context: { reason: "VEHICLE_PHOTO_MISMATCH", photoId: id },
          });
        }
      }
      const order = new Map(galleryRows.map((row, index) => [row.id, index]));
      selected = [...input.photoIds]
        .sort((a, b) => (order.get(a) ?? 0) - (order.get(b) ?? 0))
        .map((id) => galleryRows.find((row) => row.id === id)!)
        .slice(0, VEHICLE_GALLERY_MAX_PHOTOS);
    } else {
      selected = galleryRows.slice(0, VEHICLE_GALLERY_MAX_PHOTOS);
    }

    const connection = await findOperationalWhatsAppConnection(prisma);
    if (!connection) {
      throw new AppError({
        code: ErrorCode.VALIDATION_ERROR,
        message: "WhatsApp is not configured",
        context: { reason: "WHATSAPP_NOT_CONFIGURED" },
      });
    }

    const { conversationId } = await resolveFleetShareWhatsAppConversation(prisma, {
      connectionId: connection.id,
      conversationId: input.conversationId,
      providerContactId: input.providerContactId,
    });

    const caption = buildCaption(vehicle);
    const results: VehicleWhatsAppSharePhotoResult[] = [];

    for (const photo of selected) {
      const photoKey = perPhotoIdempotencyKey(batchKey, photo.id);
      try {
        const absolutePath = resolveStoragePath(storageDir, photo.attachment.storageKey);
        const bytes = await readFile(absolutePath);
        const sendResult = await whatsappSend.sendMedia({
          conversationId,
          bytes,
          declaredMime: photo.attachment.mimeType,
          filename: photo.attachment.originalName || `vehicle-${vehicleId}-${photo.sortOrder + 1}.jpg`,
          requestedKind: "IMAGE",
          caption,
          actorUserId: actor.id,
          idempotencyKey: photoKey,
          audit: (partial) =>
            audit({
              action: partial.action ?? "vehicles.whatsapp_share.photo",
              entityType: partial.entityType ?? "vehicle_photo",
              entityId: photo.id,
              metadata: {
                vehicleId,
                conversationId,
                ...(partial.metadata ?? {}),
              },
            }),
        });

        const state = sendResult.message.sendState;
        if (state === "ACCEPTED") {
          results.push({ photoId: photo.id, status: "SENT", messageId: sendResult.message.id });
        } else if (state === "UNKNOWN") {
          results.push({ photoId: photo.id, status: "UNCERTAIN", messageId: sendResult.message.id });
        } else {
          results.push({
            photoId: photo.id,
            status: "FAILED",
            messageId: sendResult.message.id,
            reason: sendResult.message.sendState ?? "FAILED",
          });
        }
      } catch (err) {
        const reason =
          err instanceof AppError
            ? String(err.context?.reason ?? err.code)
            : err instanceof Error
              ? err.message.slice(0, 120)
              : "SEND_FAILED";
        results.push({ photoId: photo.id, status: "FAILED", reason });
      }
    }

    audit({
      action: "vehicles.whatsapp_share.completed",
      entityType: "vehicle",
      entityId: String(vehicleId),
      metadata: {
        conversationId,
        sent: results.filter((r) => r.status === "SENT").length,
        failed: results.filter((r) => r.status === "FAILED").length,
        uncertain: results.filter((r) => r.status === "UNCERTAIN").length,
      },
    });

    return { conversationId, results };
  }

  return { shareGallery };
}
