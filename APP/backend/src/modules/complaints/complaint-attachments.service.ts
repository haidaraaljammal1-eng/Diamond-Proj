import type { FastifyInstance } from "fastify";
import type { MultipartFile } from "@fastify/multipart";
import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { env } from "src/config/env";
import type { AuthUser } from "src/lib/context/auth-context";
import { generateStorageKey, resolveStoragePath } from "src/lib/files/storage-key";
import { verifyContentType } from "src/lib/files/magic-bytes";
import { encryptSecret, decryptSecret } from "src/lib/security/encryption";
import type { createComplaintsService } from "src/modules/complaints/complaints.service";
import {
  attachmentInvalidContentError, attachmentNotAvailableError, attachmentTooLargeError, attachmentTypeNotAllowedError,
} from "src/modules/complaints/complaints.errors";

const ACCESS_TTL_SECONDS = 300;

export function createComplaintAttachmentsService(fastify: FastifyInstance, complaints: ReturnType<typeof createComplaintsService>) {
  const prisma = fastify.prisma;
  const storageDir = env.FILE_STORAGE_DIR;

  const toPublic = (a: { id: string; originalName: string; mimeType: string; size: number; checksum: string | null; uploadedByUserId: number | null; actionId: number | null; status: string; createdAt: Date }) =>
    ({ id: a.id, originalName: a.originalName, mimeType: a.mimeType, size: a.size, checksum: a.checksum, uploadedByUserId: a.uploadedByUserId, actionId: a.actionId, status: a.status, createdAt: a.createdAt });

  async function upload(complaintId: number, actionId: number | null, file: MultipartFile, viewer: AuthUser) {
    await complaints.loadScoped(complaintId, viewer); // existence + branch scope (404 if out of scope)
    if (actionId != null) {
      const action = await prisma.complaintAction.findFirst({ where: { id: actionId, complaintId }, select: { id: true } });
      if (!action) throw attachmentNotAvailableError();
    }
    if (!env.ALLOWED_UPLOAD_MIME.includes(file.mimetype)) throw attachmentTypeNotAllowedError();
    const buffer = await file.toBuffer();
    if (file.file.truncated) throw attachmentTooLargeError();
    const { ok, detected } = verifyContentType(buffer, file.mimetype);
    if (!ok || !detected) throw attachmentInvalidContentError();

    const storageKey = generateStorageKey(file.filename);
    await mkdir(path.resolve(storageDir), { recursive: true });
    await writeFile(resolveStoragePath(storageDir, storageKey), buffer);
    const checksum = createHash("sha256").update(buffer).digest("hex");
    const att = await prisma.complaintAttachment.create({
      data: { complaintId, actionId, originalName: file.filename, mimeType: detected, size: buffer.length, checksum, storageKey, uploadedByUserId: viewer.id, status: "ACTIVE" },
    });
    await prisma.complaintTimelineEvent.create({ data: { complaintId, type: "ATTACHMENT_ADDED", actorUserId: viewer.id, metadata: { attachmentId: att.id } } });
    return toPublic(att);
  }

  async function list(complaintId: number, viewer: AuthUser) {
    await complaints.loadScoped(complaintId, viewer);
    const rows = await prisma.complaintAttachment.findMany({ where: { complaintId, status: "ACTIVE" }, orderBy: { createdAt: "desc" } });
    return rows.map(toPublic);
  }

  /** Mint a short-lived signed access token — no permanent URL is ever stored. */
  async function access(complaintId: number, attachmentId: string, viewer: AuthUser) {
    await complaints.loadScoped(complaintId, viewer);
    const att = await prisma.complaintAttachment.findFirst({ where: { id: attachmentId, complaintId, status: "ACTIVE" }, select: { id: true } });
    if (!att) throw attachmentNotAvailableError();
    const expiresAt = new Date(Date.now() + ACCESS_TTL_SECONDS * 1000);
    const token = encryptSecret(JSON.stringify({ aid: attachmentId, cid: complaintId, exp: expiresAt.getTime() }));
    return { attachmentId, url: `/complaints/attachments/stream?token=${encodeURIComponent(token)}`, expiresAt };
  }

  /** Validate a signed token + re-check branch scope, then stream from private storage. */
  async function openStream(token: string, viewer: AuthUser) {
    let claim: { aid: string; cid: number; exp: number };
    try { claim = JSON.parse(decryptSecret(token)); } catch { throw attachmentNotAvailableError(); }
    if (!claim || typeof claim.exp !== "number" || claim.exp < Date.now()) throw attachmentNotAvailableError();
    await complaints.loadScoped(claim.cid, viewer); // scope re-check on stream
    const att = await prisma.complaintAttachment.findFirst({ where: { id: claim.aid, complaintId: claim.cid, status: "ACTIVE" } });
    if (!att) throw attachmentNotAvailableError();
    const absolutePath = resolveStoragePath(storageDir, att.storageKey);
    return { attachment: toPublic(att), stream: createReadStream(absolutePath) };
  }

  return { upload, list, access, openStream };
}
