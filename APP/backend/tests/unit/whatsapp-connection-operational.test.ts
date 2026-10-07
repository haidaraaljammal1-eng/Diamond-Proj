import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { isWhatsAppConnectionOperational } from "src/modules/whatsapp/whatsapp.connection-operational";

describe("WhatsApp connection operational", () => {
  it("requires Meta phone and WABA", () => {
    assert.equal(
      isWhatsAppConnectionOperational({
        provider: "META_CLOUD_API",
        status: "LINKED",
        credentialCiphertext: "enc",
        phoneNumberId: "123",
        wabaId: "456",
        providerInstanceId: null,
        providerSessionStatus: null,
      }),
      true,
    );
    assert.equal(
      isWhatsAppConnectionOperational({
        provider: "META_CLOUD_API",
        status: "LINKED",
        credentialCiphertext: "enc",
        phoneNumberId: null,
        wabaId: "456",
        providerInstanceId: null,
        providerSessionStatus: null,
      }),
      false,
    );
  });

  it("requires Whapi channel and authenticated session without phoneNumberId", () => {
    assert.equal(
      isWhatsAppConnectionOperational({
        provider: "WHAPI",
        status: "LINKED",
        credentialCiphertext: "enc",
        phoneNumberId: null,
        wabaId: null,
        providerInstanceId: "chan-1",
        providerSessionStatus: "AUTHENTICATED",
      }),
      true,
    );
    assert.equal(
      isWhatsAppConnectionOperational({
        provider: "WHAPI",
        status: "LINKED",
        credentialCiphertext: "enc",
        phoneNumberId: "fake-meta-id",
        wabaId: null,
        providerInstanceId: "chan-1",
        providerSessionStatus: "QR_REQUIRED",
      }),
      false,
    );
  });
});
