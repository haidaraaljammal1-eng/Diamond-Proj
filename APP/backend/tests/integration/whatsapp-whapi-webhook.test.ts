import { test, before, after, describe } from "node:test";
import assert from "node:assert/strict";
import type { FastifyInstance } from "fastify";
import type { PrismaClient } from "@prisma/client";
import { encryptWhatsAppCredential } from "src/modules/whatsapp/whatsapp.credentials";
import { whapiWebhookSecretHeaderName } from "src/modules/whatsapp/whapi.config";
import { resetWhatsAppTables } from "../helpers/whatsapp-reset";

const RUN =
  process.env.RUN_INTEGRATION === "true" && Boolean(process.env.TEST_DATABASE_URL);

const CALLBACK = "test-whapi-callback-key-12345678";
const SECRET = "test-whapi-webhook-secret-value";
const CHANNEL = "chan-integration-1";

function postWebhook(
  app: FastifyInstance,
  body: unknown,
  opts: { callback?: string; secret?: string } = {},
) {
  const callback = opts.callback ?? CALLBACK;
  const headers: Record<string, string> = { "content-type": "application/json" };
  const secret = opts.secret ?? SECRET;
  if (secret) headers[whapiWebhookSecretHeaderName()] = secret;
  return app.inject({
    method: "POST",
    url: `/whatsapp/webhooks/whapi/${callback}`,
    headers,
    payload: Buffer.from(JSON.stringify(body)),
  });
}

if (!RUN) {
  test("whatsapp whapi webhook skipped (RUN_INTEGRATION=true + TEST_DATABASE_URL)", { skip: true });
} else {
  process.env.DATABASE_URL = process.env.TEST_DATABASE_URL!;
  process.env.WHATSAPP_PROVIDER = "WHAPI";
  process.env.WHAPI_TOKEN = "integration-test-token";
  process.env.WHAPI_API_URL = "https://gate.whapi.cloud";
  process.env.WHAPI_WEBHOOK_SECRET = SECRET;
  process.env.WHAPI_WEBHOOK_CALLBACK_KEY = CALLBACK;
  process.env.WHAPI_CHANNEL_ID = CHANNEL;

  describe("Whapi webhook route", { concurrency: false }, () => {
    let app: FastifyInstance;
    let prisma: PrismaClient;
    let connectionId = "";

    before(async () => {
      const { env } = await import("src/config/env");
      if (!/haidara_test(?:\?|$)/.test(env.DATABASE_URL)) {
        throw new Error("whapi webhook tests require haidara_test");
      }
      const { buildApp } = await import("src/app");
      app = await buildApp();
      prisma = app.prisma;
      await resetWhatsAppTables(prisma);
      const row = await prisma.whatsAppConnection.create({
        data: {
          provider: "WHAPI",
          status: "LINKED",
          providerInstanceId: CHANNEL,
          providerSessionStatus: "AUTHENTICATED",
          credentialCiphertext: encryptWhatsAppCredential("whapi-token"),
          webhookCallbackCiphertext: encryptWhatsAppCredential(CALLBACK),
        },
      });
      connectionId = row.id;
    });

    after(async () => {
      await app.close();
    });

    test("rejects wrong callback key", async () => {
      const res = await postWebhook(app, { messages: [] }, { callback: "wrong-key-xxxxxxxx" });
      assert.equal(res.statusCode, 403);
    });

    test("rejects missing secret", async () => {
      const res = await postWebhook(app, { messages: [] }, { secret: "" });
      assert.equal(res.statusCode, 403);
    });

    test("rejects wrong secret", async () => {
      const res = await postWebhook(app, { messages: [] }, { secret: "bad-secret" });
      assert.equal(res.statusCode, 403);
    });

    test("ignores wrong channel with 200", async () => {
      const res = await postWebhook(app, {
        channel_id: "other-channel",
        messages: [
          {
            id: "m-wrong-ch",
            from_me: false,
            type: "text",
            chat_id: "971500000001@s.whatsapp.net",
            text: { body: "x" },
          },
        ],
        event: { type: "messages", event: "post" },
      });
      assert.equal(res.statusCode, 200);
    });

    test("inbound text materializes conversation", async () => {
      const res = await postWebhook(app, {
        channel_id: CHANNEL,
        messages: [
          {
            id: "m-in-100",
            from_me: false,
            type: "text",
            chat_id: "971500000002@s.whatsapp.net",
            timestamp: 1_790_000_100,
            text: { body: "hello whapi" },
          },
        ],
        event: { type: "messages", event: "post" },
      });
      assert.equal(res.statusCode, 200);
      const msg = await prisma.whatsAppMessage.findFirst({
        where: { providerMessageId: "m-in-100" },
      });
      assert.ok(msg);
      assert.equal(msg?.direction, "INBOUND");
    });

    test("duplicate inbound is idempotent", async () => {
      const payload = {
        channel_id: CHANNEL,
        messages: [
          {
            id: "m-in-dup",
            from_me: false,
            type: "text",
            chat_id: "971500000003@s.whatsapp.net",
            text: { body: "dup" },
          },
        ],
        event: { type: "messages", event: "post" },
      };
      assert.equal((await postWebhook(app, payload)).statusCode, 200);
      assert.equal((await postWebhook(app, payload)).statusCode, 200);
      const count = await prisma.whatsAppMessage.count({
        where: { providerMessageId: "m-in-dup" },
      });
      assert.equal(count, 1);
    });

    test("status delivered updates outbound monotonically", async () => {
      const conversation = await prisma.whatsAppConversation.create({
        data: {
          connectionId,
          customerWaId: "971500000004",
          providerChatId: "971500000004@s.whatsapp.net",
        },
      });
      const message = await prisma.whatsAppMessage.create({
        data: {
          conversationId: conversation.id,
          connectionId,
          direction: "OUTBOUND",
          messageType: "TEXT",
          textBody: "out",
          receivedAt: new Date(),
          providerMessageId: "m-out-status",
          sendState: "ACCEPTED",
          providerStatus: "SENT",
        },
      });
      const res = await postWebhook(app, {
        channel_id: CHANNEL,
        statuses: [{ id: "m-out-status", status: "delivered", timestamp: 1_790_000_200 }],
        event: { type: "statuses", event: "post" },
      });
      assert.equal(res.statusCode, 200);
      const updated = await prisma.whatsAppMessage.findUnique({ where: { id: message.id } });
      assert.equal(updated?.providerStatus, "DELIVERED");
    });

    test("group message is ignored", async () => {
      const res = await postWebhook(app, {
        channel_id: CHANNEL,
        messages: [
          {
            id: "m-grp",
            from_me: false,
            type: "text",
            chat_id: "120363@g.us",
            text: { body: "group" },
          },
        ],
        event: { type: "messages", event: "post" },
      });
      assert.equal(res.statusCode, 200);
      const msg = await prisma.whatsAppMessage.findFirst({ where: { providerMessageId: "m-grp" } });
      assert.equal(msg, null);
    });
  });
}
