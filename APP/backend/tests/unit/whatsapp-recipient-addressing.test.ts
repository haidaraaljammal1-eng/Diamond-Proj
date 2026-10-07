import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  META_CLOUD_CAPABILITIES,
  ULTRAMSG_CAPABILITIES,
  WHAPI_CAPABILITIES,
} from "src/modules/whatsapp/whatsapp.capabilities";
import { resolveProviderRecipient } from "src/modules/whatsapp/whatsapp.recipient-addressing";

describe("resolveProviderRecipient", () => {
  it("Meta uses customer wa id", () => {
    const resolved = resolveProviderRecipient(META_CLOUD_CAPABILITIES, {
      customerWaId: "971500000000",
      providerChatId: "971500000000@c.us",
    });
    assert.deepEqual(resolved, { toAddress: "971500000000", addressing: "WA_ID" });
  });

  it("Whapi prefers provider chat id including @lid without phone guess", () => {
    const lid = "12345678901234@lid";
    const resolved = resolveProviderRecipient(WHAPI_CAPABILITIES, {
      customerWaId: lid,
      providerChatId: lid,
    });
    assert.equal(resolved?.toAddress, lid);
    assert.equal(resolved?.addressing, "PROVIDER_CHAT_ID");
  });

  it("Whapi uses @s.whatsapp.net chat id", () => {
    const chat = "971500000000@s.whatsapp.net";
    const resolved = resolveProviderRecipient(WHAPI_CAPABILITIES, {
      customerWaId: "971500000000",
      providerChatId: chat,
    });
    assert.equal(resolved?.toAddress, chat);
  });

  it("UltraMsg uses @c.us chat id", () => {
    const chat = "971500000000@c.us";
    const resolved = resolveProviderRecipient(ULTRAMSG_CAPABILITIES, {
      customerWaId: "971500000000",
      providerChatId: chat,
    });
    assert.equal(resolved?.toAddress, chat);
  });

  it("direct media capability does not change recipient addressing", () => {
    const caps = { ...WHAPI_CAPABILITIES, supportsDirectOutboundMedia: false };
    const resolved = resolveProviderRecipient(caps, {
      customerWaId: "971500000000",
      providerChatId: "971500000000@s.whatsapp.net",
    });
    assert.equal(resolved?.toAddress, "971500000000@s.whatsapp.net");
    assert.equal(caps.supportsDirectOutboundMedia, false);
  });

  it("recipient addressing mode does not imply direct media transport", () => {
    const caps = { ...META_CLOUD_CAPABILITIES, supportsDirectOutboundMedia: true };
    const resolved = resolveProviderRecipient(caps, {
      customerWaId: "971500000000",
      providerChatId: null,
    });
    assert.equal(resolved?.addressing, "WA_ID");
    assert.equal(caps.supportsDirectOutboundMedia, true);
  });
});
