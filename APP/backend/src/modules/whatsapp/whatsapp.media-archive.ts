import type { Prisma, PrismaClient } from "@prisma/client";
import { WHAPI_MEDIA_MAX_BYTES } from "src/modules/whatsapp/whapi.config";
import { decryptWhatsAppCredential } from "src/modules/whatsapp/whatsapp.credentials";
import { sniffWhatsAppMedia } from "src/modules/whatsapp/whatsapp.media";
import {
  buildMediaStoreRecord,
  mediaStoreExpired,
  mergeMediaStore,
  readMediaStore,
  readVoiceNoteFlag,
  storedMediaExists,
  whatsappMediaRoot,
  writeStoredMedia,
} from "src/modules/whatsapp/whatsapp.media-store";
import { createWhatsAppProvider } from "src/modules/whatsapp/whatsapp.provider";

const inflight = new Map<string, Promise<boolean>>();

function acceptedMime(sniffed: string | null): sniffed is string {
  if (!sniffed) return false;
  return (
    sniffed === "image/jpeg" ||
    sniffed === "image/png" ||
    sniffed === "image/webp" ||
    sniffed === "application/pdf" ||
    sniffed.startsWith("audio/") ||
    sniffed.startsWith("video/")
  );
}

/**
 * Writes validated bytes once. An expired record is never filled again.
 * Returns true when a shared file exists afterwards.
 */
export async function archiveWhatsAppMediaBytes(
  prisma: PrismaClient,
  messageId: string,
  bytes: Buffer,
  voice: boolean,
  now: Date = new Date(),
  root: string = whatsappMediaRoot(),
): Promise<boolean> {
  const pending = inflight.get(messageId);
  if (pending) return pending;
  const run = archiveBody(prisma, messageId, bytes, voice, now, root).finally(() => {
    inflight.delete(messageId);
  });
  inflight.set(messageId, run);
  return run;
}

async function archiveBody(
  prisma: PrismaClient,
  messageId: string,
  bytes: Buffer,
  voice: boolean,
  now: Date,
  root: string,
): Promise<boolean> {
  const existing = await prisma.whatsAppMessage.findUnique({
    where: { id: messageId },
    select: { displayPayload: true },
  });
  if (!existing) return false;
  const current = readMediaStore(existing.displayPayload);
  if (current && mediaStoreExpired(current, now)) return false;
  if (current?.key && (await storedMediaExists(root, current.key))) return true;
  if (bytes.length === 0 || bytes.length > WHAPI_MEDIA_MAX_BYTES.VIDEO) return false;
  const sniffed = sniffWhatsAppMedia(bytes);
  if (!acceptedMime(sniffed)) return false;
  const written = await writeStoredMedia(root, bytes);
  const store = buildMediaStoreRecord({
    key: written.key,
    sha256: written.sha256,
    bytes: bytes.length,
    ingestedAt: now,
    voice: voice || readVoiceNoteFlag(existing.displayPayload),
  });
  await prisma.whatsAppMessage.update({
    where: { id: messageId },
    data: {
      displayPayload: mergeMediaStore(existing.displayPayload, store) as Prisma.InputJsonValue,
      mediaMimeType: sniffed,
      mediaSizeBytes: bytes.length,
    },
  });
  return true;
}

/** Downloads a provider file once into the shared store. Never rehydrates an expired file. */
export async function archiveWhatsAppProviderMedia(
  prisma: PrismaClient,
  messageId: string,
  now: Date = new Date(),
  root: string = whatsappMediaRoot(),
): Promise<boolean> {
  const message = await prisma.whatsAppMessage.findUnique({
    where: { id: messageId },
    select: {
      providerMediaId: true,
      displayPayload: true,
      connection: { select: { credentialCiphertext: true } },
    },
  });
  if (!message) return false;
  const current = readMediaStore(message.displayPayload);
  if (current && mediaStoreExpired(current, now)) return false;
  if (current?.key && (await storedMediaExists(root, current.key))) return true;
  if (!message.providerMediaId || !message.connection.credentialCiphertext) return false;
  let accessToken: string;
  try {
    accessToken = decryptWhatsAppCredential(message.connection.credentialCiphertext);
  } catch {
    return false;
  }
  const provider = createWhatsAppProvider();
  const metadata = await provider.getMediaMetadata(accessToken, message.providerMediaId);
  if (!metadata.ok) return false;
  const downloaded = await provider.downloadMedia(accessToken, metadata.value.url);
  if (!downloaded.ok) return false;
  return archiveWhatsAppMediaBytes(
    prisma,
    messageId,
    downloaded.value.body,
    readVoiceNoteFlag(message.displayPayload),
    now,
    root,
  );
}
