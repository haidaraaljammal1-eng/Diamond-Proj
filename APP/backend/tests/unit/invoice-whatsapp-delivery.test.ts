import { describe, it, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import {
  createWhatsAppProvider,
  setWhatsAppProviderForTests,
} from "src/modules/whatsapp/whatsapp.provider";
import { WHAPI_CAPABILITIES, META_CLOUD_CAPABILITIES } from "src/modules/whatsapp/whatsapp.capabilities";
import type { WhatsAppProvider } from "src/modules/whatsapp/whatsapp.types";

describe("invoice WhatsApp delivery routing", () => {
  afterEach(() => {
    setWhatsAppProviderForTests(undefined);
  });

  it("uses direct outbound media capability not QR auth for routing decision", () => {
    const caps = { ...WHAPI_CAPABILITIES, supportsQrAuthentication: false };
    assert.equal(caps.supportsDirectOutboundMedia, true);
    assert.equal(caps.supportsQrAuthentication, false);
    const meta = META_CLOUD_CAPABILITIES;
    assert.equal(meta.supportsDirectOutboundMedia, false);
    assert.equal(meta.supportsQrAuthentication, false);
  });

  it("WHAPI provider sendOutboundMedia is used when capability is direct media", async () => {
    let outboundCalled = false;
    const mock: WhatsAppProvider = {
      name: "whapi-mock",
      configured: true,
      capabilities: () => WHAPI_CAPABILITIES,
      getSession: async () => ({ ok: false, code: "NOT_CONFIGURED" }),
      getInstanceIdentity: async () => ({ ok: false, code: "NOT_CONFIGURED" }),
      getInstanceSettings: async () => ({ ok: false, code: "NOT_CONFIGURED" }),
      getQr: async () => ({ ok: false, code: "NOT_CONFIGURED" }),
      applyWebhookSettings: async () => ({ ok: false, code: "NOT_CONFIGURED" }),
      sendOutboundMedia: async () => {
        outboundCalled = true;
        return { ok: true, value: { providerMessageId: "doc-1" } };
      },
      exchangeAuthorizationCode: async () => ({ ok: false, code: "NOT_CONFIGURED" }),
      inspectGrantedBusinessAccess: async () => ({ ok: false, code: "NOT_CONFIGURED" }),
      listGrantedWhatsAppBusinessAccounts: async () => ({ ok: false, code: "NOT_CONFIGURED" }),
      listGrantedPhoneNumbers: async () => ({ ok: false, code: "NOT_CONFIGURED" }),
      validatePhoneNumberAccess: async () => ({ ok: false, code: "NOT_CONFIGURED" }),
      validateCredential: async () => ({ ok: false, code: "NOT_CONFIGURED" }),
      subscribeWaba: async () => ({ ok: false, code: "NOT_CONFIGURED" }),
      getWebhookSubscriptionStatus: async () => ({ ok: false, code: "NOT_CONFIGURED" }),
      sendTextMessage: async () => ({ ok: false, code: "NOT_CONFIGURED" }),
      listMessageTemplates: async () => ({ ok: true, value: [] }),
      sendTemplateMessage: async () => ({ ok: false, code: "NOT_CONFIGURED" }),
      getMediaMetadata: async () => ({ ok: false, code: "NOT_CONFIGURED" }),
      downloadMedia: async () => ({ ok: false, code: "NOT_CONFIGURED" }),
      uploadMedia: async () => {
        throw new Error("uploadMedia should not be called for WHAPI invoice path");
      },
      sendMediaMessage: async () => ({ ok: false, code: "NOT_CONFIGURED" }),
      markProviderMessageRead: async () => ({ ok: false, code: "NOT_CONFIGURED" }),
    };
    setWhatsAppProviderForTests(mock);
    const provider = createWhatsAppProvider();
    assert.equal(provider.capabilities().supportsDirectOutboundMedia, true);
    const sent = await provider.sendOutboundMedia({
      accessToken: "t",
      phoneNumberId: "",
      toChatId: "971500000000@s.whatsapp.net",
      kind: "DOCUMENT",
      bytes: Buffer.from("%PDF"),
      mimeType: "application/pdf",
      filename: "Diamond-Invoice-1100.pdf",
      caption: "Invoice",
    });
    assert.equal(outboundCalled, true);
    assert.equal(sent.ok, true);
  });
});
