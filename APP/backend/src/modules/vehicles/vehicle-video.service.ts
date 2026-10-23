import type { FastifyInstance } from "fastify";
import type { MultipartFile } from "@fastify/multipart";
import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { mkdir, rename, stat, unlink } from "node:fs/promises";
import path from "node:path";
import { env } from "src/config/env";
import { AppError } from "src/lib/errors/app-error";
import { ErrorCode } from "src/constants/error-codes";
import { generateStorageKey, resolveStoragePath } from "src/lib/files/storage-key";
import { verifyMp4ContentType } from "src/lib/files/mp4";
import { parseByteRangeHeader, sendRangedFile } from "src/lib/files/range-stream";
import { isH264Codec, probeMp4Video } from "src/lib/files/video-probe";
import type { Tx } from "src/lib/db/transaction";
import {
  commitVehicleVideoAfterFileOnDisk,
  VEHICLE_VIDEO_MUTATION_TX_TIMEOUT_MS,
  withVehicleVideoMutationLock,
} from "src/modules/vehicles/vehicle-video-upload.orchestrator";
import {
  VEHICLE_VIDEO_MAX_BYTES,
  VEHICLE_VIDEO_MAX_DURATION_SEC,
  VEHICLE_VIDEO_MIME,
} from "src/modules/vehicles/vehicle-video.constants";
import {
  mintVehicleVideoStreamToken,
  parseVehicleVideoStreamToken,
} from "src/modules/vehicles/vehicle-video-stream-token";
import { toVehicleVideo } from "src/modules/vehicles/vehicles.mapper";
import type { AuthUser } from "src/lib/context/auth-context";

const HEAD_BYTES = 64 * 1024;

/** DB-only detach; physical delete runs after the mutation transaction commits. */
export async function detachSupersededAttachmentInTransaction(
  tx: Tx,
  previousAttachment: { id: string; storageKey: string } | null,
): Promise<string | null> {
  if (!previousAttachment) return null;
  const stillReferenced = await tx.vehicleVideo.findFirst({
    where: { attachmentId: previousAttachment.id },
  });
  if (stillReferenced) return null;
  await tx.attachment.delete({ where: { id: previousAttachment.id } });
  return previousAttachment.storageKey;
}

export async function purgeUnreferencedVehicleVideoFile(
  storageDir: string,
  storageKey: string | null,
  unlinkImpl: (absolutePath: string) => Promise<void> = unlink,
): Promise<void> {
  if (!storageKey) return;
  const absolutePath = resolveStoragePath(storageDir, storageKey);
  await unlinkImpl(absolutePath).catch(() => undefined);
}

export function createVehicleVideoService(fastify: FastifyInstance) {
  const prisma = fastify.prisma;
  const storageDir = env.FILE_STORAGE_DIR;

  async function assertVehicleExists(vehicleId: number) {
    const vehicle = await prisma.vehicle.findUnique({
      where: { id: vehicleId },
      select: { id: true },
    });
    if (!vehicle) throw AppError.notFound("Vehicle not found");
  }

  async function loadVideoOrThrow(vehicleId: number) {
    const video = await prisma.vehicleVideo.findUnique({
      where: { vehicleId },
      include: { attachment: true },
    });
    if (!video) throw AppError.notFound("Vehicle video not found");
    return video;
  }

  async function streamMultipartToTemp(
    file: MultipartFile,
    tempPath: string,
  ): Promise<{ size: number; head: Buffer }> {
    await mkdir(path.dirname(tempPath), { recursive: true });
    const headChunks: Buffer[] = [];
    let headLength = 0;
    let size = 0;

    const out = (await import("node:fs")).createWriteStream(tempPath);

    try {
      for await (const chunk of file.file) {
        const buf = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
        size += buf.length;
        if (size > VEHICLE_VIDEO_MAX_BYTES) {
          throw new AppError({
            code: ErrorCode.VALIDATION_ERROR,
            statusCode: 413,
            message: "Video file is too large",
          });
        }
        if (headLength < HEAD_BYTES) {
          const take = Math.min(buf.length, HEAD_BYTES - headLength);
          headChunks.push(buf.subarray(0, take));
          headLength += take;
        }
        if (!out.write(buf)) {
          await new Promise<void>((resolve) => out.once("drain", resolve));
        }
      }
      if (file.file.truncated) {
        throw new AppError({
          code: ErrorCode.VALIDATION_ERROR,
          statusCode: 413,
          message: "Video file is too large",
        });
      }
      out.end();
      await new Promise<void>((resolve, reject) => {
        out.on("finish", resolve);
        out.on("error", reject);
      });
    } catch (error) {
      out.destroy();
      await unlink(tempPath).catch(() => undefined);
      throw error;
    }

    return { size, head: Buffer.concat(headChunks) };
  }

  async function validateTempVideo(tempPath: string, declaredMime: string, head: Buffer) {
    if (declaredMime !== VEHICLE_VIDEO_MIME) {
      throw new AppError({
        code: ErrorCode.VALIDATION_ERROR,
        message: "Only MP4 video is allowed",
      });
    }
    const { ok, detected } = verifyMp4ContentType(head, declaredMime);
    if (!ok || !detected) {
      throw new AppError({
        code: ErrorCode.VALIDATION_ERROR,
        message: "Uploaded file failed content validation",
      });
    }

    let probe: Awaited<ReturnType<typeof probeMp4Video>>;
    try {
      probe = await probeMp4Video(tempPath);
    } catch {
      throw new AppError({
        code: ErrorCode.VALIDATION_ERROR,
        message: "Video metadata could not be validated",
      });
    }

    if (!isH264Codec(probe.videoCodec)) {
      throw new AppError({
        code: ErrorCode.VALIDATION_ERROR,
        message: "Video must use H.264 encoding",
      });
    }
    if (probe.durationSec > VEHICLE_VIDEO_MAX_DURATION_SEC) {
      throw new AppError({
        code: ErrorCode.VALIDATION_ERROR,
        message: `Video must be at most ${VEHICLE_VIDEO_MAX_DURATION_SEC} seconds`,
      });
    }

    return { detected, durationSec: probe.durationSec };
  }

  async function upload(vehicleId: number, file: MultipartFile, uploadedById: number) {
    await assertVehicleExists(vehicleId);

    const tempKey = `tmp-${generateStorageKey(file.filename)}`;
    const tempPath = resolveStoragePath(storageDir, tempKey);

    try {
      const committed = await withVehicleVideoMutationLock(
        prisma,
        vehicleId,
        async (tx) => {
          const existing = await tx.vehicleVideo.findUnique({
            where: { vehicleId },
            include: { attachment: true },
          });

          const { size, head } = await streamMultipartToTemp(file, tempPath);
          const { detected, durationSec } = await validateTempVideo(tempPath, file.mimetype, head);

          const storageKey = generateStorageKey(file.filename);

          const checksum = createHash("sha256");
          await new Promise<void>((resolve, reject) => {
            const hashStream = createReadStream(tempPath);
            hashStream.on("data", (chunk) => checksum.update(chunk));
            hashStream.on("error", reject);
            hashStream.on("end", () => resolve());
          });

          const result = await commitVehicleVideoAfterFileOnDisk({
            storageDir,
            storageKey,
            tempPath,
            commitDatabase: async () => {
              const attachment = await tx.attachment.create({
                data: {
                  originalName: file.filename,
                  storageKey,
                  mimeType: detected,
                  size,
                  checksum: checksum.digest("hex"),
                  uploadedById,
                },
              });

              const video = existing
                ? await tx.vehicleVideo.update({
                    where: { id: existing.id },
                    data: { attachmentId: attachment.id, durationSec },
                    include: { attachment: { select: { mimeType: true, size: true } } },
                  })
                : await tx.vehicleVideo.create({
                    data: {
                      vehicleId,
                      attachmentId: attachment.id,
                      durationSec,
                    },
                    include: { attachment: { select: { mimeType: true, size: true } } },
                  });

              return {
                video: toVehicleVideo(vehicleId, video),
                previousAttachment: existing?.attachment ?? null,
              };
            },
          });

          const supersededStorageKey = await detachSupersededAttachmentInTransaction(
            tx,
            result.previousAttachment,
          );
          return { video: result.video, supersededStorageKey };
        },
        { timeout: VEHICLE_VIDEO_MUTATION_TX_TIMEOUT_MS },
      );
      await purgeUnreferencedVehicleVideoFile(storageDir, committed.supersededStorageKey);
      return { video: committed.video, previousAttachment: null };
    } finally {
      await unlink(tempPath).catch(() => undefined);
    }
  }

  async function finalizeReplacement(
    vehicleId: number,
    previousAttachment: { id: string; storageKey: string } | null,
  ) {
    if (!previousAttachment) return;
    const supersededStorageKey = await withVehicleVideoMutationLock(
      prisma,
      vehicleId,
      async (tx) => detachSupersededAttachmentInTransaction(tx, previousAttachment),
    );
    await purgeUnreferencedVehicleVideoFile(storageDir, supersededStorageKey);
  }

  async function remove(vehicleId: number) {
    const storageKey = await withVehicleVideoMutationLock(prisma, vehicleId, async (tx) => {
      const video = await tx.vehicleVideo.findUnique({
        where: { vehicleId },
        include: { attachment: true },
      });
      if (!video) throw AppError.notFound("Vehicle video not found");

      await tx.vehicleVideo.delete({ where: { id: video.id } });
      await tx.attachment.delete({ where: { id: video.attachmentId } });
      return video.attachment.storageKey;
    });
    await purgeUnreferencedVehicleVideoFile(storageDir, storageKey);
  }

  async function mintPlayAccess(vehicleId: number, viewer: AuthUser) {
    const video = await loadVideoOrThrow(vehicleId);
    const { token, expiresAt } = mintVehicleVideoStreamToken(vehicleId, video.id, viewer.id);
    return {
      streamUrl: `/vehicles/video-stream?token=${encodeURIComponent(token)}`,
      expiresAt,
    };
  }

  async function openStreamWithAuth(
    vehicleId: number,
    rangeHeader: string | undefined,
    viewer: AuthUser,
  ) {
    const video = await loadVideoOrThrow(vehicleId);
    return openStreamForAttachment(video, rangeHeader);
  }

  async function openStreamWithToken(rangeHeader: string | undefined, token: string) {
    const claim = parseVehicleVideoStreamToken(token);
    const video = await prisma.vehicleVideo.findFirst({
      where: { id: claim.vid, vehicleId: claim.vehicleId },
      include: { attachment: true },
    });
    if (!video) throw AppError.notFound("Vehicle video not found");
    if (video.vehicleId !== claim.vehicleId) throw AppError.forbidden();
    return openStreamForAttachment(video, rangeHeader);
  }

  async function openStreamForAttachment(
    video: {
      id: string;
      vehicleId: number;
      durationSec: number;
      attachment: { id: string; mimeType: string; size: number; originalName: string; storageKey: string };
    },
    rangeHeader: string | undefined,
  ) {
    const absolutePath = resolveStoragePath(storageDir, video.attachment.storageKey);
    const fileStat = await stat(absolutePath);
    const fileSize = fileStat.size;
    const parsed = parseByteRangeHeader(rangeHeader, fileSize);

    if (parsed === "invalid") {
      return { kind: "invalid_range" as const, fileSize };
    }

    const range = parsed;
    const stream = createReadStream(
      absolutePath,
      range ? { start: range.start, end: range.end } : undefined,
    );

    return {
      kind: "stream" as const,
      meta: toVehicleVideo(video.vehicleId, {
        id: video.id,
        attachmentId: video.attachment.id,
        durationSec: video.durationSec,
        attachment: { mimeType: video.attachment.mimeType, size: video.attachment.size },
      }),
      mimeType: video.attachment.mimeType,
      fileSize,
      stream,
      range,
      filename: video.attachment.originalName,
    };
  }

  function sendStreamReply(
    reply: import("fastify").FastifyReply,
    opened: Extract<Awaited<ReturnType<typeof openStreamForAttachment>>, { kind: "stream" }>,
  ) {
    const { range, fileSize, stream, mimeType, filename } = opened;
    if (range) {
      const contentLength = range.end - range.start + 1;
      return sendRangedFile(reply, {
        mimeType,
        fileSize,
        range,
        stream,
        statusCode: 206,
        contentRange: `bytes ${range.start}-${range.end}/`,
        contentLength,
        dispositionFilename: filename,
      });
    }
    return sendRangedFile(reply, {
      mimeType,
      fileSize,
      range: null,
      stream,
      statusCode: 200,
      dispositionFilename: filename,
    });
  }

  return {
    upload,
    finalizeReplacement,
    remove,
    mintPlayAccess,
    openStreamWithAuth,
    openStreamWithToken,
    sendStreamReply,
  };
}

export type VehicleVideoService = ReturnType<typeof createVehicleVideoService>;
