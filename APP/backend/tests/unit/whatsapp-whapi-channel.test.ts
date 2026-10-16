import { test } from "node:test";
import assert from "node:assert/strict";
import { WhapiWhatsAppProvider } from "src/modules/whatsapp/providers/whapi.provider";
import { whapiReportedChannelMatches } from "src/modules/whatsapp/whapi.config";
import { outboundCredentialStillCurrent } from "src/modules/whatsapp/whapi.outbound-gate";
import {
  decodeWhapiWebhookMaterial,
  encodeWhapiWebhookMaterial,
  whapiWebhookAuthorized,
} from "src/modules/whatsapp/whapi.webhook-material";

test("legacy callback material stays a raw key", () => {
  const material = decodeWhapiWebhookMaterial("callback-key-12345678");
  assert.equal(material.callbackKey, "callback-key-12345678");
  assert.equal(material.webhookSecret, null);
});

test("version 2 material round-trips the callback and secret", () => {
  const encoded = encodeWhapiWebhookMaterial({
    callbackKey: "callback-key-12345678",
    webhookSecret: "generated-webhook-secret",
  });
  const material = decodeWhapiWebhookMaterial(encoded);
  assert.equal(material.callbackKey, "callback-key-12345678");
  assert.equal(material.webhookSecret, "generated-webhook-secret");
});

test("legacy webhook auth uses the env secret and ignores a different env callback", () => {
  assert.equal(
    whapiWebhookAuthorized({
      presentedCallbackKey: "stored-callback",
      presentedSecret: "env-secret",
      storedPlaintext: "stored-callback",
      envCallbackKey: "env-callback",
      envSecret: "env-secret",
    }),
    true,
  );
  assert.equal(
    whapiWebhookAuthorized({
      presentedCallbackKey: "env-callback",
      presentedSecret: "env-secret",
      storedPlaintext: "stored-callback",
      envCallbackKey: "env-callback",
      envSecret: "env-secret",
    }),
    false,
  );
});

test("version 2 webhook auth rejects the previous env secret and callback", () => {
  const stored = encodeWhapiWebhookMaterial({
    callbackKey: "new-callback",
    webhookSecret: "new-secret",
  });
  assert.equal(
    whapiWebhookAuthorized({
      presentedCallbackKey: "new-callback",
      presentedSecret: "new-secret",
      storedPlaintext: stored,
      envCallbackKey: "old-callback",
      envSecret: "old-secret",
    }),
    true,
  );
  assert.equal(
    whapiWebhookAuthorized({
      presentedCallbackKey: "old-callback",
      presentedSecret: "old-secret",
      storedPlaintext: stored,
      envCallbackKey: "old-callback",
      envSecret: "old-secret",
    }),
    false,
  );
  assert.equal(
    whapiWebhookAuthorized({
      presentedCallbackKey: "new-callback",
      presentedSecret: "old-secret",
      storedPlaintext: stored,
      envCallbackKey: "old-callback",
      envSecret: "old-secret",
    }),
    false,
  );
});

test("outbound gate refuses a suspended or replaced credential", () => {
  const linked = {
    provider: "WHAPI",
    status: "LINKED",
    providerSessionStatus: "AUTHENTICATED",
    credentialCiphertext: "enc-current",
  };
  assert.equal(outboundCredentialStillCurrent(linked, "enc-current"), true);
  assert.equal(
    outboundCredentialStillCurrent({ ...linked, providerSessionStatus: "STANDBY" }, "enc-current"),
    false,
  );
  assert.equal(outboundCredentialStillCurrent(linked, "enc-previous"), false);
  assert.equal(outboundCredentialStillCurrent(null, "enc-current"), false);
  assert.equal(
    outboundCredentialStillCurrent(
      { ...linked, provider: "META_CLOUD_API", providerSessionStatus: null },
      "enc-current",
    ),
    true,
  );
});

test("forced webhook setup uses the supplied secret and keeps an unrelated hook", async () => {
  const calls: string[] = [];
  const saved: { body: Record<string, unknown> | null } = { body: null };
  const fetchImpl: typeof fetch = async (input, init) => {
    const url = String(input);
    calls.push(`${init?.method ?? "GET"} ${url}`);
    if (url.endsWith("/settings") && (!init?.method || init.method === "GET")) {
      return new Response(
        JSON.stringify({
          webhooks: [{ url: "https://other.example/hook", mode: "body", events: [] }],
          media: { auto_download: ["image"] },
        }),
        { status: 200 },
      );
    }
    if (url.endsWith("/settings") && init?.method === "PATCH") {
      saved.body = JSON.parse(String(init.body)) as Record<string, unknown>;
      return new Response(JSON.stringify(saved.body), { status: 200 });
    }
    return new Response("{}", { status: 404 });
  };
  const provider = new WhapiWhatsAppProvider("https://gate.whapi.cloud", fetchImpl);
  const webhookUrl = "https://office.example/whatsapp/webhooks/whapi/callback-key-12345678";
  const applied = await provider.applyWebhookSettings(
    "replacement-token",
    {
      sendDelay: 0,
      sendDelayMax: 0,
      webhookUrl,
      webhookMessageReceived: true,
      webhookMessageCreate: true,
      webhookMessageAck: true,
      webhookMessageDownloadMedia: false,
    },
    { webhookSecret: "generated-webhook-secret", force: true },
  );
  assert.equal(applied.ok, true);
  assert.ok(saved.body);
  const hooks = saved.body.webhooks as Record<string, unknown>[];
  assert.equal(hooks.length, 2);
  assert.equal(hooks[0]?.url, webhookUrl);
  const headers = hooks[0]?.headers as Record<string, string>;
  assert.equal(headers["X-Diamond-Whapi-Secret"], "generated-webhook-secret");
  assert.deepEqual(hooks[0]?.events, [
    { type: "messages", method: "post" },
    { type: "statuses", method: "post" },
  ]);
  assert.equal(hooks[1]?.url, "https://other.example/hook");
  assert.equal(calls.some((call) => call.startsWith("PATCH")), true);
});

test("forced webhook setup does not patch when the Diamond hook is already current", async () => {
  const calls: string[] = [];
  const webhookUrl = "https://office.example/whatsapp/webhooks/whapi/callback-key-12345678";
  const fetchImpl: typeof fetch = async (input, init) => {
    calls.push(init?.method ?? "GET");
    if (String(input).endsWith("/settings")) {
      return new Response(
        JSON.stringify({
          webhooks: [
            {
              url: webhookUrl,
              mode: "body",
              headers: { "X-Diamond-Whapi-Secret": "generated-webhook-secret" },
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
  const provider = new WhapiWhatsAppProvider("https://gate.whapi.cloud", fetchImpl);
  const applied = await provider.applyWebhookSettings(
    "replacement-token",
    {
      sendDelay: 0,
      sendDelayMax: 0,
      webhookUrl,
      webhookMessageReceived: true,
      webhookMessageCreate: true,
      webhookMessageAck: true,
      webhookMessageDownloadMedia: false,
    },
    { webhookSecret: "generated-webhook-secret", force: true },
  );
  assert.equal(applied.ok, true);
  assert.equal(calls.includes("PATCH"), false);
});

test("health channel_id is the channel and user.id stays the WhatsApp account", async () => {
  const fetchImpl: typeof fetch = async (input) => {
    if (String(input).endsWith("/health")) {
      return new Response(
        JSON.stringify({
          status: { text: "AUTH" },
          channel_id: "BLKWID-4FG3P",
          user: {
            id: "971500000111@s.whatsapp.net",
            name: "Office",
            phone: "971500000111",
          },
        }),
        { status: 200 },
      );
    }
    return new Response("{}", { status: 404 });
  };
  const provider = new WhapiWhatsAppProvider("https://gate.whapi.cloud", fetchImpl);
  const identity = await provider.getInstanceIdentity("channel-token");
  assert.equal(identity.ok, true);
  if (!identity.ok) return;
  assert.equal(identity.value.channelId, "BLKWID-4FG3P");
  assert.equal(identity.value.chatId, "971500000111@s.whatsapp.net");
  assert.equal(identity.value.displayPhone, "971500000111");
  assert.equal(whapiReportedChannelMatches("BLKWID-4FG3P", identity.value), true);
  assert.equal(whapiReportedChannelMatches("OTHER-CHANNEL", identity.value), false);
  assert.equal(
    whapiReportedChannelMatches("971500000111@s.whatsapp.net", identity.value),
    false,
  );
});

test("channel comparison falls back to chat id only when health has no channel_id", () => {
  assert.equal(whapiReportedChannelMatches("CHAN-A", { chatId: "CHAN-A" }), true);
  assert.equal(whapiReportedChannelMatches("CHAN-B", { chatId: "CHAN-A" }), false);
  assert.equal(whapiReportedChannelMatches("CHAN-A", {}), true);
});
