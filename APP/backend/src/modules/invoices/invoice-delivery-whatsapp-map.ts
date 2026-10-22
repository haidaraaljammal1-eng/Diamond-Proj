import type { WhatsAppMessageDto } from "src/modules/whatsapp/whatsapp.schema";

export function mapInvoiceDeliveryFromWhatsAppMessage(
  message: WhatsAppMessageDto,
  providerMessageId: string | null,
) {
  const state = message.sendState;
  if (state === "ACCEPTED") {
    return {
      status: "SENT" as const,
      sentAt: new Date(),
      providerMessageId,
      failedAt: null,
      failureCode: null,
      failureMessage: null,
    };
  }
  if (state === "PENDING") {
    return {
      status: "SENDING" as const,
      providerMessageId,
      failedAt: null,
      failureCode: null,
      failureMessage: null,
      sentAt: null,
    };
  }
  if (state === "UNKNOWN") {
    return {
      status: "SENDING" as const,
      providerMessageId,
      failedAt: null,
      sentAt: null,
      failureCode: "SEND_UNKNOWN",
      failureMessage:
        "WhatsApp provider outcome is unknown; do not retry automatically with the same key",
    };
  }
  return {
    status: "FAILED" as const,
    failedAt: new Date(),
    failureCode: state ?? "SEND_FAILED",
    failureMessage: "WhatsApp document send failed",
    providerMessageId,
    sentAt: null,
  };
}
