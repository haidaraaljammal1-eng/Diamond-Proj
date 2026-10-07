import type { PrismaClient } from "@prisma/client";
import { WHATSAPP_CURRENT_STATUSES } from "src/modules/whatsapp/whatsapp.constants";
import { decryptWhatsAppCredential } from "src/modules/whatsapp/whatsapp.credentials";
import { isWhatsAppConnectionOperational } from "src/modules/whatsapp/whatsapp.connection-operational";
import { createWhatsAppProvider } from "src/modules/whatsapp/whatsapp.provider";
import { sanitizeMediaFilename } from "src/modules/whatsapp/whatsapp.media";
import { resolveProviderRecipient } from "src/modules/whatsapp/whatsapp.recipient-addressing";

export type InvoiceWhatsAppSendResult =
  | { ok: true; provider: string; providerMessageId?: string }
  | { ok: false; code: string; message: string; provider?: string };

/**
 * Provider-neutral invoice document send. No invoice-specific HTTP in providers.
 */
export async function sendInvoiceDocumentViaWhatsApp(
  prisma: PrismaClient,
  input: {
    recipientPhone: string;
    filename: string;
    buffer: Buffer;
    caption: string;
  },
): Promise<InvoiceWhatsAppSendResult> {
  const provider = createWhatsAppProvider();
  if (!provider.configured) {
    return { ok: false, code: "NOT_CONFIGURED", message: "WhatsApp provider is not configured" };
  }

  const caps = provider.capabilities();
  const connection = await prisma.whatsAppConnection.findFirst({
    where: { status: { in: [...WHATSAPP_CURRENT_STATUSES] } },
    orderBy: { updatedAt: "desc" },
  });
  if (!isWhatsAppConnectionOperational(connection, caps)) {
    return { ok: false, code: "NOT_CONFIGURED", message: "WhatsApp connection is not ready" };
  }
  if (!connection?.credentialCiphertext) {
    return { ok: false, code: "NOT_CONFIGURED", message: "WhatsApp connection is not ready" };
  }

  let accessToken: string;
  try {
    accessToken = decryptWhatsAppCredential(connection.credentialCiphertext);
  } catch {
    return { ok: false, code: "NOT_CONFIGURED", message: "WhatsApp credentials unavailable" };
  }

  const filename = sanitizeMediaFilename(input.filename);
  const toWaId = input.recipientPhone.replace(/\D/g, "");

  if (caps.supportsDirectOutboundMedia) {
    const recipient =
      resolveProviderRecipient(caps, { providerChatId: null, customerWaId: toWaId }) ??
      null;
    if (!recipient) {
      return { ok: false, code: "NOT_CONFIGURED", message: "WhatsApp recipient could not be resolved" };
    }
    const sent = await provider.sendOutboundMedia({
      accessToken,
      phoneNumberId: connection.phoneNumberId ?? "",
      toChatId: recipient.toAddress,
      kind: "DOCUMENT",
      bytes: input.buffer,
      mimeType: "application/pdf",
      filename,
      caption: input.caption.slice(0, 1024),
    });
    if (!sent.ok) {
      return {
        ok: false,
        code: sent.code ?? "PROVIDER_ERROR",
        message: sent.providerErrorCode ?? "Document send failed",
        provider: provider.name,
      };
    }
    return {
      ok: true,
      provider: provider.name,
      providerMessageId: sent.value.providerMessageId,
    };
  }

  if (!connection.phoneNumberId) {
    return { ok: false, code: "NOT_CONFIGURED", message: "WhatsApp connection is not ready" };
  }

  const upload = await provider.uploadMedia({
    accessToken,
    phoneNumberId: connection.phoneNumberId,
    bytes: input.buffer,
    mimeType: "application/pdf",
    filename,
  });
  if (!upload.ok) {
    return {
      ok: false,
      code: upload.code ?? "PROVIDER_ERROR",
      message: upload.providerErrorCode ?? "Media upload failed",
      provider: provider.name,
    };
  }

  const sent = await provider.sendMediaMessage({
    accessToken,
    phoneNumberId: connection.phoneNumberId,
    toWaId,
    kind: "DOCUMENT",
    mediaId: upload.value.mediaId,
    caption: input.caption.slice(0, 1024),
  });
  if (!sent.ok) {
    return {
      ok: false,
      code: sent.code ?? "PROVIDER_ERROR",
      message: sent.providerErrorCode ?? "Document send failed",
      provider: provider.name,
    };
  }

  return {
    ok: true,
    provider: provider.name,
    providerMessageId: sent.value.providerMessageId,
  };
}
