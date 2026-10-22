import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { mapInvoiceDeliveryFromWhatsAppMessage } from "src/modules/invoices/invoice-delivery-whatsapp-map";
import type { WhatsAppMessageDto } from "src/modules/whatsapp/whatsapp.schema";

function msg(sendState: WhatsAppMessageDto["sendState"]): WhatsAppMessageDto {
  return {
    id: "00000000-0000-4000-8000-000000000001",
    direction: "OUTBOUND",
    messageType: "DOCUMENT",
    textBody: null,
    caption: "Invoice",
    mediaFilename: "inv.pdf",
    mediaMimeType: "application/pdf",
    mediaSizeBytes: 10,
    hasProtectedMedia: false,
    mediaExpired: false,
    voiceNote: false,
    templateName: null,
    templateLanguage: null,
    templatePreview: null,
    location: null,
    contacts: null,
    reaction: null,
    interactive: null,
    providerOccurredAt: null,
    receivedAt: new Date(),
    providerStatus: null,
    sendState,
    edited: false,
    revoked: false,
    groupSenderDisplayName: null,
    groupQuotedPreview: null,
  };
}

describe("mapInvoiceDeliveryFromWhatsAppMessage", () => {
  it("maps ACCEPTED to SENT with provider message id", () => {
    const patch = mapInvoiceDeliveryFromWhatsAppMessage(msg("ACCEPTED"), "wamid.1");
    assert.equal(patch.status, "SENT");
    assert.equal(patch.providerMessageId, "wamid.1");
    assert.ok(patch.sentAt);
    assert.equal(patch.failedAt, null);
  });

  it("maps PENDING to SENDING without failure fields", () => {
    const patch = mapInvoiceDeliveryFromWhatsAppMessage(msg("PENDING"), null);
    assert.equal(patch.status, "SENDING");
    assert.equal(patch.failureCode, null);
    assert.equal(patch.failedAt, null);
  });

  it("maps UNKNOWN to SENDING with SEND_UNKNOWN (not FAILED)", () => {
    const patch = mapInvoiceDeliveryFromWhatsAppMessage(msg("UNKNOWN"), null);
    assert.equal(patch.status, "SENDING");
    assert.equal(patch.failureCode, "SEND_UNKNOWN");
    assert.equal(patch.failedAt, null);
    assert.equal(patch.sentAt, null);
  });

  it("maps FAILED to FAILED with timestamp", () => {
    const patch = mapInvoiceDeliveryFromWhatsAppMessage(msg("FAILED"), null);
    assert.equal(patch.status, "FAILED");
    assert.equal(patch.failureCode, "FAILED");
    assert.ok(patch.failedAt);
  });
});
