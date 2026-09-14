import type { FastifyInstance } from "fastify";
import { WHATSAPP_PROTECTED_MEDIA_TYPES } from "src/modules/whatsapp/whatsapp.constants";
import { decryptWhatsAppCredential } from "src/modules/whatsapp/whatsapp.credentials";
import { whatsappError } from "src/modules/whatsapp/whatsapp.errors";
import { sanitizeMediaFilename } from "src/modules/whatsapp/whatsapp.media";
import { createWhatsAppProvider } from "src/modules/whatsapp/whatsapp.provider";

export function createWhatsAppMediaService(fastify: FastifyInstance) {
  const prisma = fastify.prisma;

  /**
   * On-demand authenticated proxy. Does not persist binaries into Attachment storage.
   * Provider media IDs expire; unavailable media returns WHATSAPP_MEDIA_UNAVAILABLE.
   */
  async function openProtectedMedia(messageId: string) {
    const message = await prisma.whatsAppMessage.findUnique({
      where: { id: messageId },
      select: {
        id: true,
        conversationId: true,
        messageType: true,
        providerMediaId: true,
        mediaFilename: true,
        mediaMimeType: true,
        connection: {
          select: {
            credentialCiphertext: true,
          },
        },
      },
    });
    if (!message) throw whatsappError.conversationNotFound();
    const protectedType = WHATSAPP_PROTECTED_MEDIA_TYPES.includes(
      message.messageType as (typeof WHATSAPP_PROTECTED_MEDIA_TYPES)[number],
    );
    if (!protectedType || !message.providerMediaId) throw whatsappError.mediaUnavailable();
    if (!message.connection.credentialCiphertext) throw whatsappError.mediaUnavailable();

    const provider = createWhatsAppProvider();
    if (!provider.configured) throw whatsappError.providerNotConfigured();
    let accessToken: string;
    try {
      accessToken = decryptWhatsAppCredential(message.connection.credentialCiphertext);
    } catch {
      throw whatsappError.mediaUnavailable();
    }
    const meta = await provider.getMediaMetadata(accessToken, message.providerMediaId);
    if (!meta.ok) throw whatsappError.mediaUnavailable();
    const downloaded = await provider.downloadMedia(accessToken, meta.value.url);
    if (!downloaded.ok) throw whatsappError.mediaUnavailable();
    const filename = sanitizeMediaFilename(message.mediaFilename);
    const contentType =
      downloaded.value.contentType || message.mediaMimeType || meta.value.mimeType || "application/octet-stream";
    return {
      body: downloaded.value.body,
      contentType,
      filename,
      inline: message.messageType === "IMAGE" || message.messageType === "AUDIO" || message.messageType === "VIDEO" || message.messageType === "STICKER",
    };
  }

  return { openProtectedMedia };
}
