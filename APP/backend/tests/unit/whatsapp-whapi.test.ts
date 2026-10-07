import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { redactSensitiveUrl, sanitizeForAudit } from "src/lib/security/redact";
import { WHAPI_CAPABILITIES } from "src/modules/whatsapp/whatsapp.capabilities";
import { evaluateMessagingEligibility } from "src/modules/whatsapp/whatsapp.eligibility";
import {
  isWhapiConfigured,
  normalizeWhapiApiUrl,
  whapiChannelIdsMatch,
  WHAPI_DEFAULT_API_URL,
  timingSafeWhapiWebhookSecret,
} from "src/modules/whatsapp/whapi.config";
import { mapWhapiHealthStatus } from "src/modules/whatsapp/whapi.status";
import { mapWhapiDeliveryStatus } from "src/modules/whatsapp/whapi.ack";
import {
  customerWaIdFromWhapiChatId,
  isWhapiDirectChatId,
  isWhapiGroupChatId,
  isWhapiLidChatId,
  outboundWhapiChatId,
} from "src/modules/whatsapp/whapi.chat-id";
import { parseWhapiWebhook } from "src/modules/whatsapp/whapi.webhook-parse";
import { WhapiClient } from "src/modules/whatsapp/providers/whapi.client";
import { createWhatsAppProvider, setWhatsAppProviderForTests } from "src/modules/whatsapp/whatsapp.provider";
import { WhapiWhatsAppProvider } from "src/modules/whatsapp/providers/whapi.provider";
import { nextProviderStatus } from "src/modules/whatsapp/whatsapp.status";
import { WhatsAppErrorReason } from "src/modules/whatsapp/whatsapp.errors";
import { timingSafeCallbackKey } from "src/modules/whatsapp/ultramsg.webhook-parse";

const MODULE_ROOT = join(process.cwd(), "src/modules/whatsapp");

describe("Whapi messaging eligibility", () => {
  const linked = {
    id: "conn-w",
    status: "LINKED" as const,
    webhookStatus: "ACTIVE" as const,
    hasCredential: true,
    providerSessionStatus: "AUTHENTICATED" as const,
  };

  it("allows free text without Meta 24h window semantics", () => {
    const ready = evaluateMessagingEligibility({
      conversationConnectionId: "conn-w",
      lastInboundAt: null,
      currentConnection: linked,
      providerConfigured: true,
      capabilities: WHAPI_CAPABILITIES,
      now: new Date(),
    });
    assert.equal(ready.reason, "READY");
    assert.equal(ready.canSendText, true);
    assert.equal(ready.canSendMedia, true);
    assert.equal(ready.canSendTemplate, false);
    assert.equal(ready.windowExpiresAt, null);
    assert.equal(WHAPI_CAPABILITIES.requiresCustomerServiceWindow, false);
  });
});

describe("Whapi config", () => {
  it("validates API URL host and defaults", () => {
    assert.equal(normalizeWhapiApiUrl(""), WHAPI_DEFAULT_API_URL);
    assert.equal(normalizeWhapiApiUrl("https://gate.whapi.cloud/"), "https://gate.whapi.cloud");
    assert.equal(normalizeWhapiApiUrl("http://gate.whapi.cloud"), WHAPI_DEFAULT_API_URL);
    assert.equal(isWhapiConfigured({ apiUrl: "https://gate.whapi.cloud", token: "x" }), true);
    assert.equal(isWhapiConfigured({ apiUrl: "", token: "" }), false);
    assert.equal(whapiChannelIdsMatch("chan-1", "chan-1"), true);
    assert.equal(whapiChannelIdsMatch("chan-1", "chan-2"), false);
  });

  it("exposes WHAPI capabilities", () => {
    assert.equal(WHAPI_CAPABILITIES.provider, "WHAPI");
    assert.equal(WHAPI_CAPABILITIES.supportsTemplates, false);
    assert.equal(WHAPI_CAPABILITIES.supportsDirectOutboundMedia, true);
    assert.equal(WHAPI_CAPABILITIES.supportsProviderReadReceipt, true);
  });
});

describe("Whapi health mapping", () => {
  it("maps AUTH to AUTHENTICATED and does not fake auth", () => {
    assert.equal(mapWhapiHealthStatus({ status: { text: "AUTH" } }), "AUTHENTICATED");
    assert.equal(mapWhapiHealthStatus({ status: { text: "QR" } }), "QR_REQUIRED");
    assert.notEqual(mapWhapiHealthStatus({ status: { text: "LOADING" } }), "AUTHENTICATED");
  });
});

describe("Whapi client safety", () => {
  it("uses bearer auth and never retries", () => {
    const source = readFileSync(join(MODULE_ROOT, "providers/whapi.client.ts"), "utf8");
    assert.match(source, /authorization:\s*`Bearer \$\{this\.token\}`/);
    assert.doesNotMatch(source, /retry/i);
    assert.doesNotMatch(source, /rejectUnauthorized:\s*false/);
  });

  it("redacts callback keys from URLs", () => {
    const path = redactSensitiveUrl("https://office.example/whatsapp/webhooks/whapi/super-secret-callback");
    assert.equal(path?.includes("super-secret-callback"), false);
    assert.match(path ?? "", /\[REDACTED\]/);
    const source = readFileSync(join(MODULE_ROOT, "providers/whapi.client.ts"), "utf8");
    assert.doesNotMatch(source, /console\.log/i);
    void sanitizeForAudit({ body: "hello" });
  });
});

describe("Whapi webhook settings", () => {
  it("PATCHes webhooks array and reads messages/statuses events", async () => {
    let stored: Record<string, unknown> | null = null;
    const webhookUrl = "https://office.example/whatsapp/webhooks/whapi/callback-key-12345678";
    const fetchImpl: typeof fetch = async (input, init) => {
      const url = String(input);
      if (url.endsWith("/settings") && init?.method === "PATCH") {
        stored = JSON.parse(String(init.body)) as Record<string, unknown>;
        return new Response(JSON.stringify(stored), { status: 200 });
      }
      if (url.endsWith("/settings") && init?.method === "GET") {
        return new Response(
          JSON.stringify({
            webhooks: [
              {
                url: webhookUrl,
                mode: "body",
                headers: { "X-Diamond-Whapi-Secret": "secret" },
                events: [
                  { type: "messages", method: "post" },
                  { type: "statuses", method: "post" },
                ],
              },
            ],
            media: { auto_download: [] },
          }),
          { status: 200 },
        );
      }
      return new Response("{}", { status: 404 });
    };
    const prior = process.env.WHAPI_CONFIGURE_WEBHOOK;
    const priorSecret = process.env.WHAPI_WEBHOOK_SECRET;
    process.env.WHAPI_CONFIGURE_WEBHOOK = "true";
    process.env.WHAPI_WEBHOOK_SECRET = "secret";
    const provider = new WhapiWhatsAppProvider("https://gate.whapi.cloud", fetchImpl);
    const applied = await provider.applyWebhookSettings("token", {
      sendDelay: 0,
      sendDelayMax: 0,
      webhookUrl,
      webhookMessageReceived: true,
      webhookMessageCreate: true,
      webhookMessageAck: true,
      webhookMessageDownloadMedia: false,
    });
    process.env.WHAPI_CONFIGURE_WEBHOOK = prior;
    process.env.WHAPI_WEBHOOK_SECRET = priorSecret;
    assert.equal(applied.ok, true);
    if (!applied.ok) return;
    assert.equal(applied.value.webhookUrl, webhookUrl);
    assert.equal(applied.value.webhookMessageReceived, true);
    assert.equal(applied.value.webhookMessageAck, true);
    assert.equal(applied.value.webhookMessageDownloadMedia, false);
    assert.ok(stored);
    const hooks = (stored as Record<string, unknown>).webhooks as unknown[];
    assert.ok(Array.isArray(hooks) && hooks.length === 1);
    const hook = hooks[0] as Record<string, unknown>;
    assert.equal(hook.mode, "body");
    const events = hook.events as { type: string; method: string }[];
    assert.deepEqual(events, [
      { type: "messages", method: "post" },
      { type: "statuses", method: "post" },
    ]);
  });
});

describe("Whapi send (mocked HTTP)", () => {
  it("posts text without retry", async () => {
    const calls: string[] = [];
    const fetchImpl: typeof fetch = async (input, init) => {
      calls.push(String(input));
      const url = String(input);
      if (url.endsWith("/health")) {
        return new Response(JSON.stringify({ status: { text: "AUTH" } }), { status: 200 });
      }
      if (url.endsWith("/messages/text")) {
        assert.equal(init?.method, "POST");
        const body = JSON.parse(String(init?.body)) as { to: string; body: string };
        assert.equal(body.to, "971500000000@s.whatsapp.net");
        assert.equal(body.body, "hello");
        return new Response(JSON.stringify({ message: { id: "msg-1" } }), { status: 200 });
      }
      return new Response("{}", { status: 404 });
    };
    const provider = new WhapiWhatsAppProvider("https://gate.whapi.cloud", fetchImpl);
    const sent = await provider.sendTextMessage({
      accessToken: "token",
      phoneNumberId: "chan",
      toWaId: "971500000000@s.whatsapp.net",
      text: "hello",
    });
    assert.equal(sent.ok, true);
    if (sent.ok) assert.equal(sent.value.providerMessageId, "msg-1");
    assert.equal(calls.filter((c) => c.includes("/messages/text")).length, 1);
  });

  it("posts document base64 with filename and mime", async () => {
    const fetchImpl: typeof fetch = async (input, init) => {
      const url = String(input);
      if (url.endsWith("/health")) {
        return new Response(JSON.stringify({ status: { text: "AUTH" } }), { status: 200 });
      }
      if (url.endsWith("/messages/document")) {
        const body = JSON.parse(String(init?.body)) as Record<string, string>;
        assert.match(body.media ?? "", /^data:application\/pdf;base64,/);
        assert.equal(body.mime_type, "application/pdf");
        assert.equal(body.filename, "Diamond-Invoice-1100.pdf");
        return new Response(JSON.stringify({ id: "doc-1" }), { status: 200 });
      }
      return new Response("{}", { status: 404 });
    };
    const provider = new WhapiWhatsAppProvider("https://gate.whapi.cloud", fetchImpl);
    const sent = await provider.sendOutboundMedia({
      accessToken: "token",
      phoneNumberId: "chan",
      toChatId: "971500000000@s.whatsapp.net",
      kind: "DOCUMENT",
      bytes: Buffer.from("%PDF-1.4"),
      mimeType: "application/pdf",
      filename: "Diamond-Invoice-1100.pdf",
      caption: "Invoice",
    });
    assert.equal(sent.ok, true);
  });
});

describe("Whapi webhook parse", () => {
  it("parses inbound text and ignores groups", () => {
    const inbound = parseWhapiWebhook(
      {
        channel_id: "chan-1",
        messages: [
          {
            id: "m-in-1",
            from_me: false,
            type: "text",
            chat_id: "971500000000@s.whatsapp.net",
            timestamp: 1_790_000_000,
            text: { body: "customer-secret" },
          },
        ],
        event: { type: "messages", event: "post" },
      },
      "env",
    );
    assert.equal(inbound.kind, "message");
    assert.equal(inbound.fromMe, false);
    assert.equal(inbound.customerWaId, "971500000000");
    assert.equal(inbound.ignoreReason, null);

    const group = parseWhapiWebhook(
      {
        channel_id: "chan-1",
        messages: [{ id: "g1", from_me: false, type: "text", chat_id: "120363@g.us", text: { body: "x" } }],
        event: { type: "messages", event: "post" },
      },
      "env2",
    );
    assert.equal(group.ignoreReason, WhatsAppErrorReason.GROUP_NOT_SUPPORTED);
  });

  it("handles outbound echo and @lid safely", () => {
    const echo = parseWhapiWebhook(
      {
        channel_id: "chan-1",
        messages: [
          {
            id: "m-out-1",
            from_me: true,
            type: "text",
            chat_id: "971500000000@s.whatsapp.net",
            source: "mobile",
            text: { body: "from phone" },
          },
        ],
        event: { type: "messages", event: "post" },
      },
      "env3",
    );
    assert.equal(echo.fromMe, true);
    assert.equal(echo.source, "mobile");

    const lid = "123456789@lid";
    assert.equal(isWhapiLidChatId(lid), true);
    assert.equal(isWhapiDirectChatId(lid), true);
    assert.equal(customerWaIdFromWhapiChatId(lid), lid);
    assert.equal(outboundWhapiChatId({ providerChatId: lid, customerWaId: "x" }), lid);
  });

  it("maps delivery statuses monotonically", () => {
    assert.equal(mapWhapiDeliveryStatus("sent"), "SENT");
    assert.equal(mapWhapiDeliveryStatus("delivered"), "DELIVERED");
    assert.equal(mapWhapiDeliveryStatus("read"), "READ");
    assert.equal(nextProviderStatus("READ", "DELIVERED"), "READ");
    const status = parseWhapiWebhook(
      {
        channel_id: "chan-1",
        statuses: [{ id: "m1", status: "delivered", timestamp: 1_790_000_000 }],
        event: { type: "statuses", event: "post" },
      },
      "env4",
    );
    assert.equal(status.kind, "status");
    assert.equal(status.status, "DELIVERED");
  });

  it("validates callback keys and webhook secrets", () => {
    assert.equal(timingSafeCallbackKey("abcd1234", "abcd1234"), true);
    assert.equal(timingSafeCallbackKey("abcd1234", "zzzz1234"), false);
    assert.equal(timingSafeWhapiWebhookSecret("secret-a", "secret-a"), true);
    assert.equal(timingSafeWhapiWebhookSecret("secret-a", "secret-b"), false);
  });
});

describe("Whapi provider factory", () => {
  it("honors test provider injection", () => {
    const mock = new WhapiWhatsAppProvider("https://gate.whapi.cloud");
    setWhatsAppProviderForTests(mock);
    const provider = createWhatsAppProvider();
    assert.equal(provider.name, "whapi");
    setWhatsAppProviderForTests(undefined);
  });
});
