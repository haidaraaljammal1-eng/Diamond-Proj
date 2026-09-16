import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { redactSensitiveUrl, sanitizeForAudit } from "src/lib/security/redact";
import { ULTRAMSG_CAPABILITIES } from "src/modules/whatsapp/whatsapp.capabilities";
import {
  isForbiddenUltraMsgPath,
  normalizeUltraMsgApiUrl,
  ultramsgInstanceIdsMatch,
  ULTRAMSG_DEFAULT_API_URL,
  ULTRAMSG_INSTANCE_ID,
  ULTRAMSG_GET_TIMEOUT_MS,
  ULTRAMSG_SEND_TIMEOUT_MS,
  ULTRAMSG_MEDIA_MAX_BYTES,
  ULTRAMSG_TEXT_BODY_MAX,
} from "src/modules/whatsapp/ultramsg.config";
import { mapUltraMsgAccountStatus } from "src/modules/whatsapp/ultramsg.status";
import { mapUltraMsgAck } from "src/modules/whatsapp/ultramsg.ack";
import {
  digitsFromUltraMsgContactChatId,
  isUltraMsgContactChatId,
  isUltraMsgGroupChatId,
  outboundUltraMsgChatId,
} from "src/modules/whatsapp/ultramsg.chat-id";
import { parseUltraMsgWebhook, timingSafeCallbackKey } from "src/modules/whatsapp/ultramsg.webhook-parse";
import { UltraMsgClient } from "src/modules/whatsapp/providers/ultramsg.client";
import { evaluateMessagingEligibility } from "src/modules/whatsapp/whatsapp.eligibility";
import { nextProviderStatus } from "src/modules/whatsapp/whatsapp.status";
import { WhatsAppErrorReason } from "src/modules/whatsapp/whatsapp.errors";
import { WhatsAppConnectionSchema } from "src/modules/whatsapp/whatsapp.schema";

const MODULE_ROOT = join(process.cwd(), "src/modules/whatsapp");

describe("UltraMsg client safety", () => {
  it("uses the configured instance base URL and never disables TLS", () => {
    assert.equal(ULTRAMSG_DEFAULT_API_URL, "");
    assert.equal(ULTRAMSG_INSTANCE_ID, "");
    assert.equal(normalizeUltraMsgApiUrl("https://api.ultramsg.com/instance000/"), "https://api.ultramsg.com/instance000");
    const source = readFileSync(join(MODULE_ROOT, "providers/ultramsg.client.ts"), "utf8");
    assert.doesNotMatch(source, /rejectUnauthorized:\s*false/);
    assert.doesNotMatch(source, /NODE_TLS_REJECT_UNAUTHORIZED/);
    assert.match(source, /AbortController/);
    assert.doesNotMatch(source, /retry/i);
    assert.ok(ULTRAMSG_GET_TIMEOUT_MS < ULTRAMSG_SEND_TIMEOUT_MS);
  });

  it("refuses destructive instance paths", async () => {
    assert.equal(isForbiddenUltraMsgPath("/instance/clear"), true);
    assert.equal(isForbiddenUltraMsgPath("/instance/logout"), true);
    assert.equal(isForbiddenUltraMsgPath("/instance/restart"), true);
    assert.equal(isForbiddenUltraMsgPath("/chats/clear"), true);
    assert.equal(isForbiddenUltraMsgPath("/messages/delete"), true);
    assert.equal(isForbiddenUltraMsgPath("/instance/status"), false);
    const client = new UltraMsgClient({
      apiUrl: ULTRAMSG_DEFAULT_API_URL,
      instanceId: ULTRAMSG_INSTANCE_ID,
      token: "secret-token-value",
    });
    await assert.rejects(() => client.getJson("/instance/clear"));
  });

  it("redacts token from URLs, logs, and errors", () => {
    const url = redactSensitiveUrl("https://api.ultramsg.com/instance000/instance/status?token=secret-token-value");
    assert.equal(url?.includes("secret-token-value"), false);
    assert.match(url ?? "", /\[REDACTED\]/);
    const path = redactSensitiveUrl("https://office.example/whatsapp/webhooks/ultramsg/super-secret-callback");
    assert.equal(path?.includes("super-secret-callback"), false);
    const sanitized = sanitizeForAudit({ token: "secret-token-value", body: "hello" });
    assert.equal(JSON.stringify(sanitized).includes("secret-token-value"), false);
  });
});

describe("UltraMsg status mapping", () => {
  it("maps documented statuses and keeps unknown safe", () => {
    assert.equal(mapUltraMsgAccountStatus("initialize"), "INITIALIZING");
    assert.equal(mapUltraMsgAccountStatus("qr"), "QR_REQUIRED");
    assert.equal(mapUltraMsgAccountStatus("retrying"), "RETRYING");
    assert.equal(mapUltraMsgAccountStatus("loading"), "LOADING");
    assert.equal(mapUltraMsgAccountStatus("authenticated"), "AUTHENTICATED");
    assert.equal(mapUltraMsgAccountStatus("disconnected"), "DISCONNECTED");
    assert.equal(mapUltraMsgAccountStatus("standby"), "STANDBY");
    assert.equal(mapUltraMsgAccountStatus("nope"), "UNKNOWN");
  });
});

describe("UltraMsg chat identity", () => {
  it("accepts 1:1 contacts and ignores groups", () => {
    assert.equal(isUltraMsgContactChatId("971500000000@c.us"), true);
    assert.equal(isUltraMsgGroupChatId("120363@g.us"), true);
    assert.equal(digitsFromUltraMsgContactChatId("971500000000@c.us"), "971500000000");
    assert.equal(outboundUltraMsgChatId({ providerChatId: "120363@g.us", customerWaId: "1" }), null);
    assert.equal(
      outboundUltraMsgChatId({ providerChatId: "971500000000@c.us", customerWaId: "1" }),
      "971500000000@c.us",
    );
  });
});

describe("UltraMsg ACK mapping", () => {
  it("maps documented ACK values without regression", () => {
    assert.equal(mapUltraMsgAck("pending"), "PENDING");
    assert.equal(mapUltraMsgAck("server"), "SENT");
    assert.equal(mapUltraMsgAck("device"), "DELIVERED");
    assert.equal(mapUltraMsgAck("read"), "READ");
    assert.equal(mapUltraMsgAck("played"), "READ");
    assert.equal(nextProviderStatus("READ", "DELIVERED"), "READ");
    assert.equal(nextProviderStatus("DELIVERED", "SENT"), "DELIVERED");
    assert.equal(nextProviderStatus("SENT", "READ"), "READ");
  });
});

describe("UltraMsg webhook parse", () => {
  it("parses message_received and ignores groups", () => {
    const parsed = parseUltraMsgWebhook(
      {
        event_type: "message_received",
        instanceId: "instance000",
        hash: "abc123",
        data: {
          id: "true_971500000000@c.us_3EB0",
          from: "971500000000@c.us",
          to: "971511111111@c.us",
          ack: "0",
          type: "chat",
          body: "customer-secret-text",
          fromMe: false,
          time: 1_726_300_000,
        },
      },
      "envelope",
    );
    assert.equal(parsed.kind, "message_received");
    assert.equal(parsed.chatId, "971500000000@c.us");
    assert.equal(parsed.customerWaId, "971500000000");
    assert.equal(parsed.providerEventKey, "ultramsg:hash:abc123");
    assert.equal(parsed.ignoreReason, null);
    const group = parseUltraMsgWebhook(
      {
        event_type: "message_received",
        instanceId: "instance000",
        data: { id: "g1", from: "120363@g.us", fromMe: false, type: "chat", body: "g", time: 1_726_300_000 },
      },
      "envelope",
    );
    assert.equal(group.ignoreReason, WhatsAppErrorReason.GROUP_NOT_SUPPORTED);
    assert.equal(timingSafeCallbackKey("abcd1234", "abcd1234"), true);
    assert.equal(timingSafeCallbackKey("abcd1234", "zzzz1234"), false);
    assert.equal(ultramsgInstanceIdsMatch("instance100", "100"), true);
    assert.equal(ultramsgInstanceIdsMatch("instance100", "instance000"), false);
  });
});

describe("UltraMsg eligibility", () => {
  const linked = {
    id: "conn-u",
    status: "LINKED" as const,
    webhookStatus: "ACTIVE" as const,
    hasCredential: true,
    providerSessionStatus: "AUTHENTICATED" as const,
  };

  it("requires authenticated session and does not use the 24h Meta window", () => {
    const ready = evaluateMessagingEligibility({
      conversationConnectionId: "conn-u",
      lastInboundAt: null,
      currentConnection: linked,
      providerConfigured: true,
      capabilities: ULTRAMSG_CAPABILITIES,
      now: new Date(),
    });
    assert.equal(ready.reason, "READY");
    assert.equal(ready.canSendText, true);
    assert.equal(ready.canSendTemplate, false);
    assert.equal(ready.windowExpiresAt, null);
    const qr = evaluateMessagingEligibility({
      conversationConnectionId: "conn-u",
      lastInboundAt: null,
      currentConnection: { ...linked, providerSessionStatus: "QR_REQUIRED" },
      providerConfigured: true,
      capabilities: ULTRAMSG_CAPABILITIES,
      now: new Date(),
    });
    assert.equal(qr.reason, "QR_REQUIRED");
    const offline = evaluateMessagingEligibility({
      conversationConnectionId: "conn-u",
      lastInboundAt: null,
      currentConnection: { ...linked, providerSessionStatus: "DISCONNECTED" },
      providerConfigured: true,
      capabilities: ULTRAMSG_CAPABILITIES,
      now: new Date(),
    });
    assert.equal(offline.reason, "PROVIDER_NOT_AUTHENTICATED");
  });
});

describe("UltraMsg schema and source scan", () => {
  it("does not document the token and does not call instance/clear", () => {
    assert.equal("token" in WhatsAppConnectionSchema.shape, false);
    assert.ok(WhatsAppConnectionSchema.shape.capabilities);
    assert.ok(WhatsAppConnectionSchema.shape.providerSessionStatus);
    const files = [
      "providers/ultramsg.client.ts",
      "providers/ultramsg.provider.ts",
      "whatsapp.service.ts",
      "ultramsg.webhook.service.ts",
    ];
    for (const file of files) {
      const source = readFileSync(join(MODULE_ROOT, file), "utf8");
      assert.doesNotMatch(source, /instance\/clear/);
      assert.doesNotMatch(source, /instance\/logout/);
      assert.doesNotMatch(source, /instance\/restart/);
    }
    assert.equal(ULTRAMSG_TEXT_BODY_MAX, 4096);
    assert.equal(ULTRAMSG_MEDIA_MAX_BYTES.IMAGE, 16 * 1024 * 1024);
    assert.equal(ULTRAMSG_MEDIA_MAX_BYTES.VIDEO, 32 * 1024 * 1024);
    assert.equal(ULTRAMSG_MEDIA_MAX_BYTES.DOCUMENT, 30 * 1024 * 1024);
  });
});
