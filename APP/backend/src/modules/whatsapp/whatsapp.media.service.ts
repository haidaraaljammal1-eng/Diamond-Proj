import type { FastifyInstance } from "fastify";
import { WHATSAPP_PROTECTED_MEDIA_TYPES } from "src/modules/whatsapp/whatsapp.constants";
import { decryptWhatsAppCredential } from "src/modules/whatsapp/whatsapp.credentials";
import { whatsappError } from "src/modules/whatsapp/whatsapp.errors";
import { sanitizeMediaFilename } from "src/modules/whatsapp/whatsapp.media";
import {
  archiveWhatsAppMediaBytes,
  archiveWhatsAppProviderMedia,
} from "src/modules/whatsapp/whatsapp.media-archive";
import {
  mediaStoreExpired,
  readMediaStore,
  readStoredMedia,
  readVoiceNoteFlag,
  whatsappMediaRoot,
} from "src/modules/whatsapp/whatsapp.media-store";
import { createWhatsAppProvider } from "src/modules/whatsapp/whatsapp.provider";

export function createWhatsAppMediaService(fastify: FastifyInstance) {
  const prisma = fastify.prisma;

  /**
   * Authenticated staff download. A shared file inside the seven-day window
   * is served from disk. An expired file is not fetched from the provider again.
   */
  async function openProtectedMedia(messageId: string) {
    const message = await prisma.whatsAppMessage.findUnique({
      where: { id: messageId },
      select: {
        id: true,
        messageType: true,
        providerMediaId: true,
        mediaFilename: true,
        mediaMimeType: true,
        displayPayload: true,
        connection: { select: { credentialCiphertext: true } },
      },
    });
    if (!message) throw whatsappError.conversationNotFound();
    const protectedType = WHATSAPP_PROTECTED_MEDIA_TYPES.includes(
      message.messageType as (typeof WHATSAPP_PROTECTED_MEDIA_TYPES)[number],
    );
    const payload =
      message.displayPayload && typeof message.displayPayload === "object" && !Array.isArray(message.displayPayload)
        ? (message.displayPayload as { mediaUrl?: unknown })
        : null;
    const mediaUrl =
      typeof payload?.mediaUrl === "string" && /^https?:\/\//i.test(payload.mediaUrl)
        ? payload.mediaUrl
        : null;
    if (!protectedType || (!message.providerMediaId && !mediaUrl && !readMediaStore(message.displayPayload)?.key)) {
      throw whatsappError.mediaUnavailable();
    }

    const now = new Date();
    const root = whatsappMediaRoot();
    const stored = readMediaStore(message.displayPayload);
    if (mediaStoreExpired(stored, now)) throw whatsappError.mediaUnavailable();
    if (stored?.key) {
      try {
        const body = await readStoredMedia(root, stored.key);
        return present(message, body);
      } catch {
        throw whatsappError.mediaUnavailable();
      }
    }

    if (message.providerMediaId && !mediaUrl) {
      const archived = await archiveWhatsAppProviderMedia(prisma, message.id, now, root);
      if (!archived) throw whatsappError.mediaUnavailable();
      const fresh = await prisma.whatsAppMessage.findUnique({
        where: { id: message.id },
        select: { displayPayload: true, mediaMimeType: true, mediaFilename: true, messageType: true },
      });
      const record = readMediaStore(fresh?.displayPayload);
      if (!record?.key || mediaStoreExpired(record, now)) throw whatsappError.mediaUnavailable();
      const body = await readStoredMedia(root, record.key);
      return present(
        {
          ...message,
          mediaFilename: fresh?.mediaFilename ?? message.mediaFilename,
          mediaMimeType: fresh?.mediaMimeType ?? message.mediaMimeType,
          messageType: fresh?.messageType ?? message.messageType,
        },
        body,
      );
    }

    if (!mediaUrl || !message.connection.credentialCiphertext) throw whatsappError.mediaUnavailable();
    const provider = createWhatsAppProvider();
    if (!provider.configured) throw whatsappError.providerNotConfigured();
    let accessToken: string;
    try {
      accessToken = decryptWhatsAppCredential(message.connection.credentialCiphertext);
    } catch {
      throw whatsappError.mediaUnavailable();
    }
    const downloaded = await provider.downloadMedia(accessToken, mediaUrl);
    if (!downloaded.ok) throw whatsappError.mediaUnavailable();
    await archiveWhatsAppMediaBytes(
      prisma,
      message.id,
      downloaded.value.body,
      readVoiceNoteFlag(message.displayPayload),
      now,
      root,
    );
    return present(message, downloaded.value.body, downloaded.value.contentType);
  }

  return { openProtectedMedia };
}

function present(
  message: {
    messageType: string;
    mediaFilename: string | null;
    mediaMimeType: string | null;
  },
  body: Buffer,
  contentType?: string | null,
) {
  return {
    body,
    contentType: contentType || message.mediaMimeType || "application/octet-stream",
    filename: sanitizeMediaFilename(message.mediaFilename),
    inline:
      message.messageType === "IMAGE" ||
      message.messageType === "AUDIO" ||
      message.messageType === "VIDEO" ||
      message.messageType === "STICKER",
  };
}
