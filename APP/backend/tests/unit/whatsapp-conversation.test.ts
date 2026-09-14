import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { PERMISSIONS } from "src/constants/permissions";
import {
  buildMessagePreview,
  isNewerConversationMessage,
  mapWhatsAppMessageType,
  mapWhatsAppProviderStatus,
  nextCustomerDisplayName,
} from "src/modules/whatsapp/whatsapp.message-type";
import { WhatsAppErrorReason } from "src/modules/whatsapp/whatsapp.errors";
import {
  ListWhatsAppConversationsQuerySchema,
  WhatsAppConversationListItemSchema,
  WhatsAppMessageSchema,
} from "src/modules/whatsapp/whatsapp.schema";
import { setWhatsAppInboundFailureForTests } from "src/modules/whatsapp/whatsapp.inbound.service";

describe("whatsapp.read permission", () => {
  it("is a catalog key distinct from manage_connection", () => {
    assert.equal(PERMISSIONS.WHATSAPP_READ, "whatsapp.read");
    assert.notEqual(PERMISSIONS.WHATSAPP_READ, PERMISSIONS.WHATSAPP_MANAGE_CONNECTION);
  });
});

describe("message type mapping", () => {
  it("maps official provider types and unknown values", () => {
    assert.equal(mapWhatsAppMessageType("text"), "TEXT");
    assert.equal(mapWhatsAppMessageType("IMAGE"), "IMAGE");
    assert.equal(mapWhatsAppMessageType("sticker"), "STICKER");
    assert.equal(mapWhatsAppMessageType("future-type"), "UNKNOWN");
    assert.equal(mapWhatsAppMessageType(null), "UNKNOWN");
  });
});

describe("provider status mapping", () => {
  it("maps outbound statuses and ignores inbound-looking values", () => {
    assert.equal(mapWhatsAppProviderStatus("delivered"), "DELIVERED");
    assert.equal(mapWhatsAppProviderStatus("sent"), "SENT");
    assert.equal(mapWhatsAppProviderStatus("read"), "READ");
    assert.equal(mapWhatsAppProviderStatus("text"), null);
  });
});

describe("message preview", () => {
  it("truncates text and strips tags without storing HTML", () => {
    const preview = buildMessagePreview("TEXT", "Hello Diamond test message");
    assert.equal(preview, "Hello Diamond test message");
    const html = buildMessagePreview("TEXT", "<b>hi</b> there");
    assert.equal(html?.includes("<"), false);
    const long = buildMessagePreview("TEXT", "x".repeat(200));
    assert.equal(long?.endsWith("…"), true);
    assert.equal(long && long.length <= 161, true);
  });

  it("uses null preview for non-text", () => {
    assert.equal(buildMessagePreview("IMAGE", "ignore"), null);
  });
});

describe("display name", () => {
  it("keeps a useful name when the incoming value is empty", () => {
    assert.equal(nextCustomerDisplayName("Test Customer", null), "Test Customer");
    assert.equal(nextCustomerDisplayName("Test Customer", "   "), "Test Customer");
    assert.equal(nextCustomerDisplayName("Old", "New Name"), "New Name");
    assert.equal(nextCustomerDisplayName(null, "First"), "First");
  });
});

describe("last-message chronology", () => {
  const older = {
    occurredAt: new Date(1_000_000),
    createdAt: new Date(5_000_000),
    id: "a",
  };
  const newer = {
    occurredAt: new Date(2_000_000),
    createdAt: new Date(4_000_000),
    id: "b",
  };

  it("prefers providerOccurredAt over ingestion order", () => {
    assert.equal(isNewerConversationMessage(newer, older), true);
    assert.equal(isNewerConversationMessage(older, newer), false);
  });

  it("treats the first message as last", () => {
    assert.equal(isNewerConversationMessage(older, null), true);
  });

  it("does not let an undated event replace a dated last message", () => {
    const undated = { occurredAt: null, createdAt: new Date(9_000_000), id: "c" };
    assert.equal(isNewerConversationMessage(undated, newer), false);
  });

  it("breaks identical timestamps with createdAt then id", () => {
    const a = { occurredAt: new Date(1_000), createdAt: new Date(10), id: "m1" };
    const b = { occurredAt: new Date(1_000), createdAt: new Date(20), id: "m2" };
    assert.equal(isNewerConversationMessage(b, a), true);
    const c = { occurredAt: new Date(1_000), createdAt: new Date(20), id: "m3" };
    assert.equal(isNewerConversationMessage(c, b), true);
  });
});

describe("conversation OpenAPI schemas", () => {
  it("do not embed secrets or raw webhook envelopes", () => {
    const blob = JSON.stringify({
      list: WhatsAppConversationListItemSchema.shape,
      message: WhatsAppMessageSchema.shape,
      query: ListWhatsAppConversationsQuerySchema.shape,
    });
    assert.equal(blob.includes("META_APP_SECRET"), false);
    assert.equal(blob.includes("accessToken"), false);
    assert.equal(blob.includes("payload"), false);
    assert.equal(blob.includes("credentialCiphertext"), false);
    assert.equal("payload" in WhatsAppMessageSchema.shape, false);
  });
});

describe("inbound failure injection", () => {
  it("is refused in production", () => {
    const prev = process.env.NODE_ENV;
    process.env.NODE_ENV = "production";
    try {
      assert.throws(() => setWhatsAppInboundFailureForTests(new Error("nope")));
    } finally {
      process.env.NODE_ENV = prev;
      setWhatsAppInboundFailureForTests(undefined);
    }
  });
});

describe("error reasons", () => {
  it("includes conversation not found", () => {
    assert.equal(WhatsAppErrorReason.CONVERSATION_NOT_FOUND, "WHATSAPP_CONVERSATION_NOT_FOUND");
  });
});
