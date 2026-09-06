import type { FastifyInstance } from "fastify";
import type { MultipartFile } from "@fastify/multipart";
import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { mkdir, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { env } from "src/config/env";
import { AppError } from "src/lib/errors/app-error";
import { ErrorCode } from "src/constants/error-codes";
import { generateStorageKey, resolveStoragePath } from "src/lib/files/storage-key";
import { verifyContentType } from "src/lib/files/magic-bytes";
import { withTransaction } from "src/lib/db/transaction";
import { toVehicleImage } from "src/modules/vehicles/vehicles.mapper";

export function createVehiclePhotosService(fastify: FastifyInstance) {
  const prisma = fastify.prisma;
  const storageDir = env.FILE_STORAGE_DIR;

  async function assertVehicleExists(vehicleId: number) {
    const vehicle = await prisma.vehicle.findUnique({
      where: { id: vehicleId },
      select: { id: true },
    });
    if (!vehicle) throw AppError.notFound("Vehicle not found");
  }

  async function loadPhotoOrThrow(vehicleId: number, photoId: string) {
    const photo = await prisma.vehiclePhoto.findFirst({
      where: { id: photoId, vehicleId },
      include: { attachment: true },
    });
    if (!photo) throw AppError.notFound("Vehicle photo not found");
    return photo;
  }

  async function upload(vehicleId: number, file: MultipartFile, uploadedById: number) {
    await assertVehicleExists(vehicleId);

    const declaredMime = file.mimetype;
    if (!env.ALLOWED_UPLOAD_MIME.includes(declaredMime)) {
      throw new AppError({
        code: ErrorCode.VALIDATION_ERROR,
        message: "File type is not allowed",
      });
    }

    const buffer = await file.toBuffer();
    if (file.file.truncated) {
      throw new AppError({
        code: ErrorCode.VALIDATION_ERROR,
        statusCode: 413,
        message: "File is too large",
      });
    }

    const { ok, detected } = verifyContentType(buffer, declaredMime);
    if (!ok || !detected) {
      throw new AppError({
        code: ErrorCode.VALIDATION_ERROR,
        message: "Uploaded file failed content validation",
      });
    }

    const storageKey = generateStorageKey(file.filename);
    await mkdir(path.resolve(storageDir), { recursive: true });
    const absolutePath = resolveStoragePath(storageDir, storageKey);
    await writeFile(absolutePath, buffer);
    const checksum = createHash("sha256").update(buffer).digest("hex");

    return withTransaction(prisma, async (tx) => {
      const attachment = await tx.attachment.create({
        data: {
          originalName: file.filename,
          storageKey,
          mimeType: detected,
          size: buffer.length,
          checksum,
          uploadedById,
        },
      });

      const existingCount = await tx.vehiclePhoto.count({ where: { vehicleId } });
      const photo = await tx.vehiclePhoto.create({
        data: {
          vehicleId,
          attachmentId: attachment.id,
          sortOrder: existingCount,
          isPrimary: existingCount === 0,
        },
        include: { attachment: { select: { mimeType: true } } },
      });

      return toVehicleImage(vehicleId, photo);
    });
  }

  async function remove(vehicleId: number, photoId: string) {
    const photo = await loadPhotoOrThrow(vehicleId, photoId);

    return withTransaction(prisma, async (tx) => {
      await tx.vehiclePhoto.delete({ where: { id: photo.id } });

      const absolutePath = resolveStoragePath(storageDir, photo.attachment.storageKey);
      await tx.attachment.delete({ where: { id: photo.attachmentId } });
      await unlink(absolutePath).catch(() => undefined);

      if (photo.isPrimary) {
        const next = await tx.vehiclePhoto.findFirst({
          where: { vehicleId },
          orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
        });
        if (next) {
          await tx.vehiclePhoto.update({
            where: { id: next.id },
            data: { isPrimary: true },
          });
        }
      }
    });
  }

  async function openStream(vehicleId: number, photoId: string) {
    const photo = await loadPhotoOrThrow(vehicleId, photoId);
    const absolutePath = resolveStoragePath(storageDir, photo.attachment.storageKey);
    return {
      photo: toVehicleImage(vehicleId, photo),
      stream: createReadStream(absolutePath),
    };
  }

  return { upload, remove, openStream };
}

export type VehiclePhotosService = ReturnType<typeof createVehiclePhotosService>;
