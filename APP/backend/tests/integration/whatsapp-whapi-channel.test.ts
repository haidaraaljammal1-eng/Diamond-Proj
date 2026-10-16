import { test, before, after, describe } from "node:test";
import assert from "node:assert/strict";
import type { FastifyInstance } from "fastify";
import type { PrismaClient } from "@prisma/client";
import { PERMISSIONS } from "src/constants/permissions";
import { auth, login, seedPaymentUser } from "../helpers/payment-integration-helpers";
import { resetWhatsAppTables } from "../helpers/whatsapp-reset";
import { decryptWhatsAppCredential } from "src/modules/whatsapp/whatsapp.credentials";
import { decodeWhapiWebhookMaterial } from "src/modules/whatsapp/whapi.webhook-material";
import { whapiWebhookSecretHeaderName } from "src/modules/whatsapp/whapi.config";
import { WHAPI_CAPABILITIES } from "src/modules/whatsapp/whatsapp.capabilities";
import { setWhatsAppProviderForTests } from "src/modules/whatsapp/whatsapp.provider";
import type { WhatsAppProvider, WhatsAppProviderResult } from "src/modules/whatsapp/whatsapp.types";

const RUN = process.env.RUN_INTEGRATION === "true" && Boolean(process.env.TEST_DATABASE_URL);

const TOKEN_A = "valid-token-channel-a-0001";
const TOKEN_B = "valid-token-channel-b-0002";
const TOKEN_C = "valid-token-channel-c-0003";
const CHANNEL_A = "CHAN-A";
const CHANNEL_B = "CHAN-B";
const CHANNEL_C = "CHAN-C";

function reason(body: string): string | undefined {
  try {
    return JSON.parse(body)?.error?.context?.reason as string | undefined;
  } catch {
    return undefined;
  }
}

if (!RUN) {
  test("whapi channel configuration skipped", { skip: true });
} else {
  process.env.DATABASE_URL = process.env.TEST_DATABASE_URL!;
  process.env.WHATSAPP_PROVIDER = "WHAPI";
  process.env.PUBLIC_BACKEND_URL = "https://office.example";

  describe("Whapi office channel configuration", { concurrency: false }, () => {
    let app: FastifyInstance;
    let prisma: PrismaClient;
    let managerToken = "";
    let strangerToken = "";
    let senderToken = "";
    let identityChannel = CHANNEL_A;
    let failWebhook = false;
    let sendCalls = 0;
    const run = Date.now().toString(36);

    const provider = {
      name: "whapi",
      configured: true,
      capabilities: () => WHAPI_CAPABILITIES,
      getSession: async (token: string) => {
        if (!token.startsWith("valid-token-")) {
          return { ok: false, code: "AUTH_FAILED" } as WhatsAppProviderResult<never>;
        }
        return { ok: true, value: { status: "AUTHENTICATED" as const, rawStatus: "AUTH" } };
      },
      getInstanceIdentity: async () => ({
        ok: true as const,
        value: {
          chatId: identityChannel,
          displayPhone: "971500000111",
          displayName: "Office",
        },
      }),
      applyWebhookSettings: async (
        _token: string,
        settings: { webhookUrl?: string | null },
      ) => {
        if (failWebhook) return { ok: false as const, code: "SEND_UNKNOWN" as const };
        return {
          ok: true as const,
          value: {
            sendDelay: 0,
            sendDelayMax: 0,
            webhookUrl: settings.webhookUrl ?? null,
            webhookMessageReceived: true,
            webhookMessageCreate: true,
            webhookMessageAck: true,
            webhookMessageDownloadMedia: false,
          },
        };
      },
      sendTextMessage: async () => {
        sendCalls += 1;
        return { ok: true as const, value: { providerMessageId: "should-not-send" } };
      },
    } as unknown as WhatsAppProvider;

    before(async () => {
      const { env } = await import("src/config/env");
      if (!/haidara_test(?:\?|$)/.test(env.DATABASE_URL)) {
        throw new Error("whapi channel tests require haidara_test");
      }
      setWhatsAppProviderForTests(provider);
      const { buildApp } = await import("src/app");
      app = await buildApp();
      prisma = app.prisma;
      await resetWhatsAppTables(prisma);
      const manager = { email: `wa-p1-mgr-${run}@example.test`, password: "wa-manager-pass-123" };
      const stranger = { email: `wa-p1-str-${run}@example.test`, password: "wa-stranger-pass-123" };
      const sender = { email: `wa-p1-snd-${run}@example.test`, password: "wa-sender-pass-123" };
      await seedPaymentUser(prisma, manager.email, manager.password, `wa_p1_mgr_${run}`, [
        PERMISSIONS.WHATSAPP_MANAGE_CONNECTION,
        PERMISSIONS.WHATSAPP_READ,
      ]);
      await seedPaymentUser(prisma, stranger.email, stranger.password, `wa_p1_str_${run}`, [
        "vehicles.read",
      ]);
      await seedPaymentUser(prisma, sender.email, sender.password, `wa_p1_snd_${run}`, [
        PERMISSIONS.WHATSAPP_SEND,
        PERMISSIONS.WHATSAPP_READ,
      ]);
      managerToken = await login(app, manager);
      strangerToken = await login(app, stranger);
      senderToken = await login(app, sender);
    });

    after(async () => {
      setWhatsAppProviderForTests(undefined);
      await app.close();
    });

    function configure(token: string, channelId: string, access = managerToken) {
      return app.inject({
        method: "POST",
        url: "/whatsapp/connection/whapi",
        headers: auth(access),
        payload: { token, channelId },
      });
    }

    test("a user without manage permission cannot configure the channel", async () => {
      const res = await configure(TOKEN_A, CHANNEL_A, strangerToken);
      assert.equal(res.statusCode, 403);
      assert.equal(await prisma.whatsAppConnection.count(), 0);
    });

    test("invalid credentials do not create a connection", async () => {
      const res = await configure("not-a-valid-token", CHANNEL_A);
      assert.notEqual(res.statusCode, 200);
      assert.equal(res.body.includes(TOKEN_A), false);
      assert.equal(await prisma.whatsAppConnection.count(), 0);
    });

    test("valid credentials persist encrypted material and hide it from the response", async () => {
      identityChannel = CHANNEL_A;
      const res = await configure(TOKEN_A, CHANNEL_A);
      assert.equal(res.statusCode, 200, res.body);
      assert.equal(res.body.includes(TOKEN_A), false);
      assert.equal(res.body.includes("enc:v1:"), false);
      const body = res.json() as { data: { status: string; webhookStatus: string; providerSessionStatus: string } };
      assert.equal(body.data.status, "LINKED");
      assert.equal(body.data.webhookStatus, "ACTIVE");
      assert.equal(body.data.providerSessionStatus, "AUTHENTICATED");
      const row = await prisma.whatsAppConnection.findFirstOrThrow({
        where: { providerInstanceId: CHANNEL_A },
      });
      assert.equal(decryptWhatsAppCredential(row.credentialCiphertext ?? ""), TOKEN_A);
      const material = decodeWhapiWebhookMaterial(
        decryptWhatsAppCredential(row.webhookCallbackCiphertext ?? ""),
      );
      assert.ok(material.webhookSecret);
      assert.notEqual(material.webhookSecret, process.env.WHAPI_WEBHOOK_SECRET ?? "");
    });

    test("a bad replacement leaves the active channel authenticated", async () => {
      const before = await prisma.whatsAppConnection.findFirstOrThrow({
        where: { providerInstanceId: CHANNEL_A },
      });
      const res = await configure("not-a-valid-token", CHANNEL_B);
      assert.notEqual(res.statusCode, 200);
      const after = await prisma.whatsAppConnection.findUniqueOrThrow({ where: { id: before.id } });
      assert.equal(after.status, "LINKED");
      assert.equal(after.providerSessionStatus, "AUTHENTICATED");
      assert.equal(after.credentialCiphertext, before.credentialCiphertext);
    });

    test("a channel mismatch does not suspend the active channel", async () => {
      identityChannel = "SOME-OTHER-CHANNEL";
      const res = await configure(TOKEN_B, CHANNEL_B);
      assert.equal(reason(res.body), "WHATSAPP_WHAPI_CHANNEL_MISMATCH");
      const row = await prisma.whatsAppConnection.findFirstOrThrow({
        where: { providerInstanceId: CHANNEL_A },
      });
      assert.equal(row.providerSessionStatus, "AUTHENTICATED");
      identityChannel = CHANNEL_B;
    });

    test("replacement isolates history and rejects the old channel", async () => {
      const current = await prisma.whatsAppConnection.findFirstOrThrow({
        where: { providerInstanceId: CHANNEL_A, status: "LINKED" },
      });
      const oldMaterial = decodeWhapiWebhookMaterial(
        decryptWhatsAppCredential(current.webhookCallbackCiphertext ?? ""),
      );
      await prisma.whatsAppConversation.create({
        data: {
          connectionId: current.id,
          customerWaId: "971500000201",
          providerChatId: "971500000201@s.whatsapp.net",
          customerDisplayName: "Archived test",
          lastMessageAt: new Date(),
          lastMessagePreview: "old channel",
        },
      });
      identityChannel = CHANNEL_B;
      const res = await configure(TOKEN_B, CHANNEL_B);
      assert.equal(res.statusCode, 200, res.body);
      assert.equal(res.body.includes(TOKEN_B), false);
      const archived = await prisma.whatsAppConnection.findUniqueOrThrow({ where: { id: current.id } });
      assert.equal(archived.status, "DISCONNECTED");
      assert.equal(archived.credentialCiphertext, null);
      assert.equal(await prisma.whatsAppConversation.count({ where: { connectionId: current.id } }), 1);
      const list = await app.inject({
        method: "GET",
        url: "/whatsapp/conversations",
        headers: auth(managerToken),
      });
      assert.equal(list.statusCode, 200);
      assert.equal(list.body.includes("971500000201"), false);
      const active = await prisma.whatsAppConnection.findFirstOrThrow({
        where: { providerInstanceId: CHANNEL_B, status: "LINKED" },
      });
      const material = decodeWhapiWebhookMaterial(
        decryptWhatsAppCredential(active.webhookCallbackCiphertext ?? ""),
      );
      const header = whapiWebhookSecretHeaderName();
      const oldEvent = await app.inject({
        method: "POST",
        url: `/whatsapp/webhooks/whapi/${oldMaterial.callbackKey}`,
        headers: { "content-type": "application/json", [header]: oldMaterial.webhookSecret ?? "" },
        payload: Buffer.from(
          JSON.stringify({
            channel_id: CHANNEL_A,
            messages: [
              {
                id: "old-channel-message",
                from_me: false,
                type: "text",
                chat_id: "971500000201@s.whatsapp.net",
                timestamp: 1_790_000_400,
                text: { body: "from the old channel" },
              },
            ],
            event: { type: "messages", event: "post" },
          }),
        ),
      });
      assert.equal(oldEvent.statusCode, 403);
      const wrongChannel = await app.inject({
        method: "POST",
        url: `/whatsapp/webhooks/whapi/${material.callbackKey}`,
        headers: { "content-type": "application/json", [header]: material.webhookSecret ?? "" },
        payload: Buffer.from(
          JSON.stringify({
            channel_id: CHANNEL_A,
            messages: [
              {
                id: "wrong-channel-message",
                from_me: false,
                type: "text",
                chat_id: "971500000301@s.whatsapp.net",
                timestamp: 1_790_000_401,
                text: { body: "wrong channel" },
              },
            ],
            event: { type: "messages", event: "post" },
          }),
        ),
      });
      assert.equal(wrongChannel.statusCode, 200);
      assert.equal(
        await prisma.whatsAppMessage.count({ where: { providerMessageId: "wrong-channel-message" } }),
        0,
      );
      const live = await app.inject({
        method: "POST",
        url: `/whatsapp/webhooks/whapi/${material.callbackKey}`,
        headers: { "content-type": "application/json", [header]: material.webhookSecret ?? "" },
        payload: Buffer.from(
          JSON.stringify({
            channel_id: CHANNEL_B,
            messages: [
              {
                id: "new-channel-message",
                from_me: false,
                type: "text",
                chat_id: "971500000301@s.whatsapp.net",
                timestamp: 1_790_000_402,
                text: { body: "office inbox" },
              },
            ],
            event: { type: "messages", event: "post" },
          }),
        ),
      });
      assert.equal(live.statusCode, 200);
      const created = await prisma.whatsAppMessage.findFirst({
        where: { providerMessageId: "new-channel-message" },
      });
      assert.equal(created?.connectionId, active.id);
      const visible = await app.inject({
        method: "GET",
        url: "/whatsapp/conversations",
        headers: auth(managerToken),
      });
      assert.equal(visible.body.includes("971500000301"), true);
      assert.equal(visible.body.includes("971500000201"), false);
    });

    test("a failed cutover stays suspended and does not send", async () => {
      failWebhook = true;
      identityChannel = CHANNEL_C;
      const sendsBefore = sendCalls;
      const res = await configure(TOKEN_C, CHANNEL_C);
      assert.notEqual(res.statusCode, 200);
      assert.equal(await prisma.whatsAppConnection.count({ where: { providerInstanceId: CHANNEL_C } }), 0);
      const suspended = await prisma.whatsAppConnection.findFirstOrThrow({
        where: { providerInstanceId: CHANNEL_B },
      });
      assert.equal(suspended.status, "LINKED");
      assert.equal(suspended.providerSessionStatus, "STANDBY");
      assert.ok(suspended.credentialCiphertext);
      const conversation = await prisma.whatsAppConversation.findFirstOrThrow({
        where: { connectionId: suspended.id },
      });
      const send = await app.inject({
        method: "POST",
        url: `/whatsapp/conversations/${conversation.id}/messages`,
        headers: { ...auth(senderToken), "idempotency-key": `p1-suspended-${run}` },
        payload: { text: "must not leave" },
      });
      assert.notEqual(send.statusCode, 200);
      assert.equal(sendCalls, sendsBefore);
      failWebhook = false;
      identityChannel = CHANNEL_C;
      const recovered = await configure(TOKEN_C, CHANNEL_C);
      assert.equal(recovered.statusCode, 200, recovered.body);
      const previous = await prisma.whatsAppConnection.findUniqueOrThrow({ where: { id: suspended.id } });
      assert.equal(previous.status, "DISCONNECTED");
      assert.equal(previous.credentialCiphertext, null);
      const active = await prisma.whatsAppConnection.findFirstOrThrow({
        where: { status: "LINKED" },
      });
      assert.equal(active.providerInstanceId, CHANNEL_C);
      assert.equal(active.providerSessionStatus, "AUTHENTICATED");
    });
  });
}
