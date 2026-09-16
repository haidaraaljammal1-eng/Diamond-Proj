import type { FastifyInstance } from "fastify";
import type { MultipartFile } from "@fastify/multipart";
import type { Attachment } from "@prisma/client";
import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { mkdir, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { env } from "src/config/env";
import { AppError } from "src/lib/errors/app-error";
import { ErrorCode } from "src/constants/error-codes";
import { generateStorageKey, resolveStoragePath } from "src/lib/files/storage-key";
import { verifyContentType } from "src/lib/files/magic-bytes";
import type { AttachmentPublic } from "src/modules/files/files.schema";

function toAttachmentPublic(attachment: Attachment): AttachmentPublic {
  return {
    id: attachment.id,
    originalName: attachment.originalName,
    mimeType: attachment.mimeType,
    size: attachment.size,
    checksum: attachment.checksum,
    uploadedById: attachment.uploadedById,
    createdAt: attachment.createdAt,
  };
}

export function createFilesService(fastify: FastifyInstance) {
  const prisma = fastify.prisma;
  const storageDir = env.FILE_STORAGE_DIR;

  async function save(
    file: MultipartFile,
    uploadedById: number | null,
    options?: { allowedMime?: readonly string[] },
  ): Promise<AttachmentPublic> {
    const declaredMime = file.mimetype;
    const allowed = [...(options?.allowedMime ?? env.ALLOWED_UPLOAD_MIME)];
    if (!allowed.includes(declaredMime)) {
      throw new AppError({
        code: ErrorCode.VALIDATION_ERROR,
        message: "File type is not allowed",
      });
    }

    const buffer = await file.toBuffer();
    if (file.file.truncated || buffer.length > env.MAX_UPLOAD_SIZE) {
      throw new AppError({
        code: ErrorCode.VALIDATION_ERROR,
        statusCode: 413,
        message: "File is too large",
      });
    }

    // Never trust the declared Content-Type — verify by content.
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
    const attachment = await prisma.attachment.create({
      data: {
        originalName: file.filename,
        storageKey,
        mimeType: detected,
        size: buffer.length,
        checksum,
        uploadedById: uploadedById ?? null,
      },
    });
    return toAttachmentPublic(attachment);
  }

  async function loadOrThrow(id: string): Promise<Attachment> {
    const attachment = await prisma.attachment.findUnique({ where: { id } });
    if (!attachment) throw AppError.notFound("Attachment not found");
    return attachment;
  }

  async function openDownload(id: string) {
    const attachment = await loadOrThrow(id);
    const absolutePath = resolveStoragePath(storageDir, attachment.storageKey);
    return { attachment, stream: createReadStream(absolutePath) };
  }

  async function remove(id: string) {
    const attachment = await loadOrThrow(id);
    const absolutePath = resolveStoragePath(storageDir, attachment.storageKey);
    await prisma.attachment.delete({ where: { id } });
    // Best-effort filesystem cleanup — the row is the source of truth.
    await unlink(absolutePath).catch(() => undefined);
  }

  return { save, openDownload, remove };
}
