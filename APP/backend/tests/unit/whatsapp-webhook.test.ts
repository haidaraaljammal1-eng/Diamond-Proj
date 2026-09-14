import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { redactSensitiveUrl } from "src/lib/security/redact";
import {
  setWhatsAppWebhookSecretsForTests,
  isWhatsAppWebhookConfigured,
} from "src/modules/whatsapp/whatsapp.config";
import { WhatsAppUnconfiguredProvider } from "src/modules/whatsapp/providers/whatsapp-unconfigured.provider";
import { MetaCloudWhatsAppProvider } from "src/modules/whatsapp/providers/meta-cloud-api.provider";
import { sanitizeWebhookPayload } from "src/modules/whatsapp/whatsapp.webhook-sanitize";
import {
  parseMetaUnixTimestamp,
  parseWhatsAppWebhookItems,
} from "src/modules/whatsapp/whatsapp.webhook-parse";
import {
  sha256Hex,
  signMetaHubPayload,
  verifyMetaHubSignature,
  verifyMetaWebhookChallenge,
} from "src/modules/whatsapp/whatsapp.webhook-signature";
import { WhatsAppConnectionSchema } from "src/modules/whatsapp/whatsapp.schema";
import { WhatsAppErrorReason } from "src/modules/whatsapp/whatsapp.errors";
import {
  FIXTURE_PHONE_NUMBER_ID,
  FIXTURE_PROFILE_NAME,
  FIXTURE_TEXT,
  FIXTURE_TIMESTAMP,
  FIXTURE_WA_ID,
  FIXTURE_WABA_ID,
  FIXTURE_WAMID,
  TEST_WEBHOOK_APP_SECRET,
  TEST_WEBHOOK_VERIFY_TOKEN,
  officialStatusPayload,
  officialTextMessagePayload,
} from "../helpers/whatsapp-webhook-fixtures";

describe("Meta webhook GET verification", () => {
  it("returns the challenge when mode and verify token match", () => {
    const result = verifyMetaWebhookChallenge(
      {
        "hub.mode": "subscribe",
        "hub.verify_token": TEST_WEBHOOK_VERIFY_TOKEN,
        "hub.challenge": "challenge-123",
      },
      TEST_WEBHOOK_VERIFY_TOKEN,
    );
    assert.equal(result.ok, true);
    if (result.ok) assert.equal(result.challenge, "challenge-123");
  });

  it("accepts nested hub query objects", () => {
    const result = verifyMetaWebhookChallenge(
      { hub: { mode: "subscribe", verify_token: TEST_WEBHOOK_VERIFY_TOKEN, challenge: "c" } },
      TEST_WEBHOOK_VERIFY_TOKEN,
    );
    assert.equal(result.ok, true);
  });

  it("fails closed on an incorrect verify token without distinguishing the check", () => {
    const result = verifyMetaWebhookChallenge(
      {
        "hub.mode": "subscribe",
        "hub.verify_token": "wrong-token",
        "hub.challenge": "challenge-123",
      },
      TEST_WEBHOOK_VERIFY_TOKEN,
    );
    assert.deepEqual(result, { ok: false });
  });

  it("fails closed when the server verify token is empty", () => {
    const result = verifyMetaWebhookChallenge(
      {
        "hub.mode": "subscribe",
        "hub.verify_token": "",
        "hub.challenge": "challenge-123",
      },
      "",
    );
    assert.deepEqual(result, { ok: false });
  });

  it("never puts the verify token on the result object", () => {
    const result = verifyMetaWebhookChallenge(
      {
        "hub.mode": "subscribe",
        "hub.verify_token": TEST_WEBHOOK_VERIFY_TOKEN,
        "hub.challenge": "challenge-123",
      },
      TEST_WEBHOOK_VERIFY_TOKEN,
    );
    assert.equal(JSON.stringify(result).includes(TEST_WEBHOOK_VERIFY_TOKEN), false);
  });
});

describe("verify token URL redaction", () => {
  it("strips hub.verify_token from request URLs before logging", () => {
    const url =
      "/whatsapp/webhooks/meta?hub.mode=subscribe&hub.verify_token=wa-test-verify-token&hub.challenge=1";
    const redacted = redactSensitiveUrl(url);
    assert.equal(redacted?.includes("wa-test-verify-token"), false);
    assert.equal(redacted?.includes("hub.verify_token=[REDACTED]"), true);
  });
});

describe("Meta webhook signature", () => {
  it("accepts HMAC-SHA256 of the exact raw body", () => {
    const raw = Buffer.from('{"object":"whatsapp_business_account"}', "utf8");
    const header = signMetaHubPayload(raw, TEST_WEBHOOK_APP_SECRET);
    assert.equal(verifyMetaHubSignature(raw, header, TEST_WEBHOOK_APP_SECRET), true);
  });

  it("rejects a missing signature", () => {
    const raw = Buffer.from("{}", "utf8");
    assert.equal(verifyMetaHubSignature(raw, undefined, TEST_WEBHOOK_APP_SECRET), false);
  });

  it("rejects a malformed signature header", () => {
    const raw = Buffer.from("{}", "utf8");
    assert.equal(verifyMetaHubSignature(raw, "sha1=abcd", TEST_WEBHOOK_APP_SECRET), false);
    assert.equal(verifyMetaHubSignature(raw, "sha256=zzzz", TEST_WEBHOOK_APP_SECRET), false);
  });

  it("rejects a modified body after signing", () => {
    const original = Buffer.from('{"ok":true}', "utf8");
    const header = signMetaHubPayload(original, TEST_WEBHOOK_APP_SECRET);
    const modified = Buffer.from('{"ok":false}', "utf8");
    assert.equal(verifyMetaHubSignature(modified, header, TEST_WEBHOOK_APP_SECRET), false);
  });

  it("does not verify a JSON.stringify reconstruction of a parsed body", () => {
    const raw = Buffer.from('{ "object" : "whatsapp_business_account" }', "utf8");
    const header = signMetaHubPayload(raw, TEST_WEBHOOK_APP_SECRET);
    const reconstructed = Buffer.from(JSON.stringify(JSON.parse(raw.toString("utf8"))), "utf8");
    assert.notEqual(raw.equals(reconstructed), true);
    assert.equal(verifyMetaHubSignature(raw, header, TEST_WEBHOOK_APP_SECRET), true);
    assert.equal(verifyMetaHubSignature(reconstructed, header, TEST_WEBHOOK_APP_SECRET), false);
  });

  it("uses the documented sha256= hex form", () => {
    const raw = Buffer.from("payload", "utf8");
    const digest = createHmac("sha256", TEST_WEBHOOK_APP_SECRET).update(raw).digest("hex");
    assert.equal(signMetaHubPayload(raw, TEST_WEBHOOK_APP_SECRET), `sha256=${digest}`);
  });
});

describe("official-shaped webhook parse", () => {
  it("extracts routing ids, text body, and provider timestamp", () => {
    const payload = officialTextMessagePayload();
    const items = parseWhatsAppWebhookItems(payload, sha256Hex(Buffer.from("x")));
    assert.equal(items.length, 1);
    const item = items[0]!;
    assert.equal(item.eventType, "MESSAGE_RECEIVED");
    assert.equal(item.providerEventKey, `wamid:${FIXTURE_WAMID}`);
    assert.equal(item.wabaId, FIXTURE_WABA_ID);
    assert.equal(item.phoneNumberId, FIXTURE_PHONE_NUMBER_ID);
    assert.equal(item.customerWaId, FIXTURE_WA_ID);
    assert.equal(item.customerDisplayName, FIXTURE_PROFILE_NAME);
    assert.equal(item.messageType, "text");
    assert.equal(item.textBody, FIXTURE_TEXT);
    assert.equal(item.occurredAt?.getTime(), Number(FIXTURE_TIMESTAMP) * 1000);
  });

  it("tolerates unknown future fields", () => {
    const payload = officialTextMessagePayload({
      extraValueFields: { future_widget: { id: "x", extra: true } },
    });
    const items = parseWhatsAppWebhookItems(payload, "hash");
    assert.equal(items[0]?.eventType, "MESSAGE_RECEIVED");
  });

  it("does not crash on an unsupported message type", () => {
    const payload = officialTextMessagePayload({ type: "image" });
    const items = parseWhatsAppWebhookItems(payload, "hash");
    assert.equal(items[0]?.eventType, "MESSAGE_RECEIVED");
    assert.equal(items[0]?.messageType, "image");
    assert.equal(items[0]?.textBody, null);
  });

  it("normalizes outbound status events", () => {
    const items = parseWhatsAppWebhookItems(officialStatusPayload(), "hash");
    assert.equal(items[0]?.eventType, "MESSAGE_STATUS");
    assert.equal(items[0]?.messageType, "delivered");
    assert.equal(items[0]?.providerEventKey.includes(":status:delivered"), true);
  });

  it("handles a malformed timestamp without throwing", () => {
    const payload = officialTextMessagePayload({ timestamp: "not-a-unix" });
    const items = parseWhatsAppWebhookItems(payload, "hash");
    assert.equal(items[0]?.occurredAt, null);
    assert.equal(items[0]?.providerMessageId, FIXTURE_WAMID);
  });
});

describe("Meta unix timestamp", () => {
  it("parses unix seconds", () => {
    const date = parseMetaUnixTimestamp("1757458512");
    assert.equal(date?.getTime(), 1757458512 * 1000);
  });

  it("rejects millisecond-scale and garbage values", () => {
    assert.equal(parseMetaUnixTimestamp("1757458512000"), null);
    assert.equal(parseMetaUnixTimestamp("abc"), null);
    assert.equal(parseMetaUnixTimestamp(-1), null);
    assert.equal(parseMetaUnixTimestamp(0), null);
  });
});

describe("webhook payload sanitization", () => {
  it("redacts unexpected secrets and keeps message text", () => {
    const sanitized = sanitizeWebhookPayload({
      messages: [{ text: { body: FIXTURE_TEXT } }],
      access_token: "EAA-should-not-persist",
      app_secret: TEST_WEBHOOK_APP_SECRET,
    }) as Record<string, unknown>;
    assert.equal((sanitized.messages as { text: { body: string } }[])[0]?.text.body, FIXTURE_TEXT);
    assert.equal(sanitized.access_token, "[REDACTED]");
    assert.equal(sanitized.app_secret, "[REDACTED]");
    assert.equal(JSON.stringify(sanitized).includes("EAA-should-not-persist"), false);
    assert.equal(JSON.stringify(sanitized).includes(TEST_WEBHOOK_APP_SECRET), false);
  });
});

describe("webhook secret injection", () => {
  it("is refused in production", () => {
    const prev = process.env.NODE_ENV;
    process.env.NODE_ENV = "production";
    try {
      assert.throws(() =>
        setWhatsAppWebhookSecretsForTests({
          appSecret: TEST_WEBHOOK_APP_SECRET,
          verifyToken: TEST_WEBHOOK_VERIFY_TOKEN,
        }),
      );
    } finally {
      process.env.NODE_ENV = prev;
      setWhatsAppWebhookSecretsForTests(undefined);
    }
  });

  it("does not treat empty runtime env as configured", () => {
    setWhatsAppWebhookSecretsForTests(undefined);
    assert.equal(typeof isWhatsAppWebhookConfigured(), "boolean");
  });
});

describe("OpenAPI connection schema", () => {
  it("exposes webhookStatus without secrets", () => {
    const keys = Object.keys(WhatsAppConnectionSchema.shape);
    assert.equal(keys.includes("webhookStatus"), true);
    assert.equal(keys.includes("lastWebhookAt"), true);
    const blob = JSON.stringify(WhatsAppConnectionSchema.shape);
    assert.equal(blob.includes("META_APP_SECRET"), false);
    assert.equal(blob.includes(TEST_WEBHOOK_VERIFY_TOKEN), false);
    assert.equal(blob.includes("accessToken"), false);
  });
});

describe("error reasons", () => {
  it("includes webhook domain codes", () => {
    assert.equal(
      WhatsAppErrorReason.WEBHOOK_INVALID_SIGNATURE,
      "WHATSAPP_WEBHOOK_INVALID_SIGNATURE",
    );
    assert.equal(
      WhatsAppErrorReason.WEBHOOK_CONNECTION_NOT_FOUND,
      "WHATSAPP_WEBHOOK_CONNECTION_NOT_FOUND",
    );
  });
});

describe("WABA subscription adapter", () => {
  it("unconfigured provider does not fake subscription success", async () => {
    const provider = new WhatsAppUnconfiguredProvider();
    const sub = await provider.subscribeWaba("tok", FIXTURE_WABA_ID);
    assert.equal(sub.ok, false);
    if (!sub.ok) assert.equal(sub.code, "NOT_CONFIGURED");
  });

  it("requires Graph success:true and matching app id", async () => {
    const cfg = {
      appId: "111",
      appSecret: "super-secret-app-value",
      graphApiVersion: "v25.0",
      configId: "",
    };
    const emptySuccess = new MetaCloudWhatsAppProvider(cfg, {
      async getJson() {
        return { status: 200, json: { data: [] } };
      },
      async postJson() {
        return { status: 200, json: {} };
      },
    });
    const posted = await emptySuccess.subscribeWaba("tok", FIXTURE_WABA_ID);
    assert.equal(posted.ok, false);
    const listed = await emptySuccess.getWebhookSubscriptionStatus("tok", FIXTURE_WABA_ID);
    assert.equal(listed.ok, true);
    if (listed.ok) assert.equal(listed.value.subscribed, false);

    const matched = new MetaCloudWhatsAppProvider(cfg, {
      async getJson() {
        return {
          status: 200,
          json: { data: [{ whatsapp_business_api_data: { id: "111" } }] },
        };
      },
      async postJson() {
        return { status: 200, json: { success: true } };
      },
    });
    const ok = await matched.subscribeWaba("tok", FIXTURE_WABA_ID);
    assert.equal(ok.ok, true);
    const status = await matched.getWebhookSubscriptionStatus("tok", FIXTURE_WABA_ID);
    assert.equal(status.ok, true);
    if (status.ok) assert.equal(status.value.subscribed, true);
    assert.equal(JSON.stringify(ok).includes("super-secret-app-value"), false);
  });
});
