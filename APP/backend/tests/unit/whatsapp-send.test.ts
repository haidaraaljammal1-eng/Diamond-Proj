import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { PERMISSIONS } from "src/constants/permissions";
import { WHATSAPP_TEXT_BODY_MAX } from "src/modules/whatsapp/whatsapp.constants";
import {
  evaluateMessagingEligibility,
  isCustomerServiceWindowOpen,
} from "src/modules/whatsapp/whatsapp.eligibility";
import { WhatsAppErrorReason } from "src/modules/whatsapp/whatsapp.errors";
import { nextProviderStatus } from "src/modules/whatsapp/whatsapp.status";
import { assertOutboundText, normalizeOutboundText } from "src/modules/whatsapp/whatsapp.text";
import {
  WhatsAppSendTextBodySchema,
  WhatsAppMessageSchema,
} from "src/modules/whatsapp/whatsapp.schema";

const linked = {
  id: "conn-a",
  status: "LINKED" as const,
  webhookStatus: "ACTIVE" as const,
  hasCredential: true,
};

describe("whatsapp.send permission", () => {
  it("is a catalog key distinct from read and manage_connection", () => {
    assert.equal(PERMISSIONS.WHATSAPP_SEND, "whatsapp.send");
    assert.notEqual(PERMISSIONS.WHATSAPP_SEND, PERMISSIONS.WHATSAPP_READ);
    assert.notEqual(PERMISSIONS.WHATSAPP_SEND, PERMISSIONS.WHATSAPP_MANAGE_CONNECTION);
  });
});

describe("24h customer service window", () => {
  const inbound = new Date("2026-09-12T12:00:00.000Z");

  it("is open before 24 hours and closed at the exact boundary", () => {
    assert.equal(isCustomerServiceWindowOpen(inbound, new Date("2026-09-13T11:59:59.000Z")), true);
    assert.equal(isCustomerServiceWindowOpen(inbound, new Date("2026-09-13T12:00:00.000Z")), false);
    assert.equal(isCustomerServiceWindowOpen(inbound, new Date("2026-09-13T12:00:01.000Z")), false);
  });
});

describe("messaging eligibility", () => {
  const now = new Date("2026-09-12T18:00:00.000Z");
  const lastInboundAt = new Date("2026-09-12T10:00:00.000Z");

  it("is ready only when linked, webhook active, window open, and provider configured", () => {
    const ready = evaluateMessagingEligibility({
      conversationConnectionId: "conn-a",
      lastInboundAt,
      currentConnection: linked,
      providerConfigured: true,
      now,
    });
    assert.equal(ready.canSendText, true);
    assert.equal(ready.canSendMedia, true);
    assert.equal(ready.canSendTemplate, true);
    assert.equal(ready.reason, "READY");
    assert.ok(ready.windowExpiresAt);
  });

  it("rejects missing lastInboundAt, closed window, inactive connection, and webhook", () => {
    assert.equal(
      evaluateMessagingEligibility({
        conversationConnectionId: "conn-a",
        lastInboundAt: null,
        currentConnection: linked,
        providerConfigured: true,
        now,
      }).reason,
      "CUSTOMER_SERVICE_WINDOW_UNKNOWN",
    );
    const closed = evaluateMessagingEligibility({
      conversationConnectionId: "conn-a",
      lastInboundAt: new Date("2026-09-11T10:00:00.000Z"),
      currentConnection: linked,
      providerConfigured: true,
      now,
    });
    assert.equal(closed.reason, "CUSTOMER_SERVICE_WINDOW_CLOSED");
    assert.equal(closed.canSendText, false);
    assert.equal(closed.canSendMedia, false);
    assert.equal(closed.canSendTemplate, true);
    assert.equal(
      evaluateMessagingEligibility({
        conversationConnectionId: "conn-old",
        lastInboundAt,
        currentConnection: linked,
        providerConfigured: true,
        now,
      }).reason,
      "CONNECTION_INACTIVE",
    );
    assert.equal(
      evaluateMessagingEligibility({
        conversationConnectionId: "conn-a",
        lastInboundAt,
        currentConnection: { ...linked, status: "REAUTH_REQUIRED" },
        providerConfigured: true,
        now,
      }).reason,
      "CONNECTION_INACTIVE",
    );
    assert.equal(
      evaluateMessagingEligibility({
        conversationConnectionId: "conn-a",
        lastInboundAt,
        currentConnection: { ...linked, webhookStatus: "PENDING" },
        providerConfigured: true,
        now,
      }).reason,
      "WEBHOOK_NOT_ACTIVE",
    );
    assert.equal(
      evaluateMessagingEligibility({
        conversationConnectionId: "conn-a",
        lastInboundAt,
        currentConnection: linked,
        providerConfigured: false,
        now,
      }).reason,
      "PROVIDER_NOT_CONFIGURED",
    );
    assert.equal(
      evaluateMessagingEligibility({
        conversationConnectionId: "conn-a",
        lastInboundAt,
        currentConnection: null,
        providerConfigured: true,
        now,
      }).reason,
      "NO_ACTIVE_CONNECTION",
    );
  });
});

describe("outbound text", () => {
  it("trims ends only and preserves line breaks", () => {
    assert.equal(normalizeOutboundText("  hello\nthere  "), "hello\nthere");
    assert.throws(() => assertOutboundText("   "));
    assert.throws(() => assertOutboundText(""));
    const max = "x".repeat(WHATSAPP_TEXT_BODY_MAX);
    assert.equal(assertOutboundText(max), max);
    assert.throws(() => assertOutboundText(`${max}y`));
  });
});

describe("provider status monotonicity", () => {
  it("does not regress READ or DELIVERED", () => {
    assert.equal(nextProviderStatus("READ", "DELIVERED"), "READ");
    assert.equal(nextProviderStatus("DELIVERED", "SENT"), "DELIVERED");
    assert.equal(nextProviderStatus("SENT", "DELIVERED"), "DELIVERED");
    assert.equal(nextProviderStatus("DELIVERED", "READ"), "READ");
    assert.equal(nextProviderStatus("READ", "FAILED"), "READ");
    assert.equal(nextProviderStatus("FAILED", "SENT"), "FAILED");
    assert.equal(nextProviderStatus("SENT", "FAILED"), "FAILED");
  });
});

describe("send request schema", () => {
  it("accepts text only and rejects client recipient fields", () => {
    assert.equal(WhatsAppSendTextBodySchema.parse({ text: "Hello" }).text, "Hello");
    assert.throws(() =>
      WhatsAppSendTextBodySchema.parse({ text: "Hello", to: "15550001111" }),
    );
    assert.equal("to" in WhatsAppSendTextBodySchema.shape, false);
    assert.equal("providerMediaId" in WhatsAppMessageSchema.shape, false);
    assert.equal("sendState" in WhatsAppMessageSchema.shape, true);
  });
});

describe("provider send POST retries", () => {
  it("does not configure an automatic retry loop for message POST", () => {
    const source = readFileSync(
      join(process.cwd(), "src/modules/whatsapp/providers/meta-cloud-api.provider.ts"),
      "utf8",
    );
    assert.match(source, /postJsonOnce/);
    assert.match(source, /Single HTTP POST — no retries/);
    assert.equal(source.includes("for (let retry"), false);
    assert.equal(source.includes("maxRetries"), false);
  });
});

describe("send route rate limit", () => {
  it("applies a dedicated send rate limit", () => {
    const source = readFileSync(
      join(process.cwd(), "src/modules/whatsapp/routes/admin/conversations/route.ts"),
      "utf8",
    );
    assert.match(source, /whatsappSendRateLimit/);
    assert.match(source, /permissions: \[PERMISSIONS.WHATSAPP_SEND\]/);
  });
});

describe("send error reasons", () => {
  it("names window, webhook, and idempotency conflicts", () => {
    assert.equal(
      WhatsAppErrorReason.CUSTOMER_SERVICE_WINDOW_CLOSED,
      "WHATSAPP_CUSTOMER_SERVICE_WINDOW_CLOSED",
    );
    assert.equal(WhatsAppErrorReason.IDEMPOTENCY_KEY_REUSED, "IDEMPOTENCY_KEY_REUSED");
    assert.equal(WhatsAppErrorReason.WEBHOOK_NOT_ACTIVE, "WHATSAPP_WEBHOOK_NOT_ACTIVE");
  });
});
