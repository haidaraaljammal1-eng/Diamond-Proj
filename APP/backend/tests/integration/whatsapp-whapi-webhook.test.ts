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

    test("materializes every message in one webhook batch", async () => {
      const res = await postWebhook(app, {
        channel_id: CHANNEL,
        messages: [
          {
            id: "m-batch-1",
            from_me: false,
            type: "text",
            chat_id: "971500000010@s.whatsapp.net",
            timestamp: 1_790_000_310,
            text: { body: "batch-one" },
          },
          {
            id: "m-batch-2",
            from_me: false,
            type: "text",
            chat_id: "971500000011@s.whatsapp.net",
            timestamp: 1_790_000_311,
            text: { body: "batch-two" },
          },
        ],
        statuses: [{ id: "m-out-status", status: "read", timestamp: 1_790_000_312 }],
        event: { type: "messages", event: "post" },
      });
      assert.equal(res.statusCode, 200);
      const count = await prisma.whatsAppMessage.count({
        where: { providerMessageId: { in: ["m-batch-1", "m-batch-2"] } },
      });
      assert.equal(count, 2);
      const statusRow = await prisma.whatsAppMessage.findFirst({
        where: { providerMessageId: "m-out-status" },
      });
      assert.equal(statusRow?.providerStatus, "READ");
    });

    test("applies a status that arrived before the mobile echo", async () => {
      const early = await postWebhook(app, {
        channel_id: CHANNEL,
        statuses: [{ id: "m-echo-early", status: "delivered", timestamp: 1_790_000_400 }],
        event: { type: "statuses", event: "post" },
      });
      assert.equal(early.statusCode, 200);
      const echo = await postWebhook(app, {
        channel_id: CHANNEL,
        messages: [
          {
            id: "m-echo-early",
            from_me: true,
            type: "text",
            chat_id: "971500000012@s.whatsapp.net",
            timestamp: 1_790_000_399,
            source: "mobile",
            text: { body: "sent from the phone" },
          },
        ],
        event: { type: "messages", event: "post" },
      });
      assert.equal(echo.statusCode, 200);
      const row = await prisma.whatsAppMessage.findFirst({
        where: { providerMessageId: "m-echo-early" },
      });
      assert.equal(row?.direction, "OUTBOUND");
      assert.equal(row?.providerStatus, "DELIVERED");
    });

    test("matches a phone echo to the pending Diamond send with the same text", async () => {
      const conversation = await prisma.whatsAppConversation.create({
        data: {
          connectionId,
          customerWaId: "971500000013",
          providerChatId: "971500000013@s.whatsapp.net",
        },
      });
      await prisma.whatsAppMessage.create({
        data: {
          conversationId: conversation.id,
          connectionId,
          direction: "OUTBOUND",
          messageType: "TEXT",
          textBody: "desk reply",
          receivedAt: new Date(),
          sendState: "ACCEPTED",
          providerStatus: "PENDING",
        },
      });
      const res = await postWebhook(app, {
        channel_id: CHANNEL,
        messages: [
          {
            id: "m-echo-match",
            from_me: true,
            type: "text",
            chat_id: "971500000013@s.whatsapp.net",
            timestamp: 1_790_000_420,
            source: "web",
            text: { body: "desk reply" },
          },
        ],
        event: { type: "messages", event: "post" },
      });
      assert.equal(res.statusCode, 200);
      const rows = await prisma.whatsAppMessage.findMany({
        where: { conversationId: conversation.id },
      });
      assert.equal(rows.length, 1);
      assert.equal(rows[0]?.providerMessageId, "m-echo-match");
    });

    test("does not move the conversation backward for an older message or a read receipt", async () => {
      const first = await postWebhook(app, {
        channel_id: CHANNEL,
        messages: [
          {
            id: "m-order-new",
            from_me: false,
            type: "text",
            chat_id: "971500000014@s.whatsapp.net",
            timestamp: 1_790_000_500,
            text: { body: "latest" },
          },
        ],
        event: { type: "messages", event: "post" },
      });
      assert.equal(first.statusCode, 200);
      const before = await prisma.whatsAppConversation.findFirstOrThrow({
        where: { providerChatId: "971500000014@s.whatsapp.net" },
      });
      const late = await postWebhook(app, {
        channel_id: CHANNEL,
        messages: [
          {
            id: "m-order-old",
            from_me: false,
            type: "text",
            chat_id: "971500000014@s.whatsapp.net",
            timestamp: 1_790_000_100,
            text: { body: "older" },
          },
        ],
        event: { type: "messages", event: "post" },
      });
      assert.equal(late.statusCode, 200);
      const after = await prisma.whatsAppConversation.findUniqueOrThrow({ where: { id: before.id } });
      assert.equal(after.lastMessageId, before.lastMessageId);
      assert.equal(after.lastMessageAt?.toISOString(), before.lastMessageAt?.toISOString());
      assert.equal(after.lastMessagePreview, "latest");
    });

    test("edits and deletes the message without reordering the conversation", async () => {
      const created = await postWebhook(app, {
        channel_id: CHANNEL,
        messages: [
          {
            id: "m-revise",
            from_me: false,
            type: "text",
            chat_id: "971500000015@s.whatsapp.net",
            timestamp: 1_790_000_600,
            text: { body: "original" },
          },
        ],
        event: { type: "messages", event: "post" },
      });
      assert.equal(created.statusCode, 200);
      const before = await prisma.whatsAppConversation.findFirstOrThrow({
        where: { providerChatId: "971500000015@s.whatsapp.net" },
      });
      const edited = await postWebhook(app, {
        channel_id: CHANNEL,
        messages: [
          {
            id: "m-revise",
            from_me: false,
            type: "text",
            chat_id: "971500000015@s.whatsapp.net",
            timestamp: 1_790_000_610,
            text: { body: "revised" },
          },
        ],
        event: { type: "messages", event: "patch" },
      });
      assert.equal(edited.statusCode, 200);
      const message = await prisma.whatsAppMessage.findFirstOrThrow({
        where: { providerMessageId: "m-revise" },
      });
      assert.equal(message.textBody, "revised");
      const afterEdit = await prisma.whatsAppConversation.findUniqueOrThrow({ where: { id: before.id } });
      assert.equal(afterEdit.lastMessageAt?.toISOString(), before.lastMessageAt?.toISOString());
      assert.equal(afterEdit.lastMessagePreview, "revised");

      const editedAgain = await postWebhook(app, {
        channel_id: CHANNEL,
        messages: [
          {
            id: "m-revise",
            from_me: false,
            type: "text",
            chat_id: "971500000015@s.whatsapp.net",
            timestamp: 1_790_000_611,
            text: { body: "revised again" },
          },
        ],
        event: { type: "messages", event: "patch" },
      });
      assert.equal(editedAgain.statusCode, 200);
      const second = await prisma.whatsAppMessage.findUniqueOrThrow({ where: { id: message.id } });
      assert.equal(second.textBody, "revised again");
      const edits = await prisma.whatsAppWebhookEvent.count({
        where: { providerMessageId: "m-revise", providerEventKey: { contains: ":update:" } },
      });
      assert.equal(edits, 2);

      const removed = await postWebhook(app, {
        channel_id: CHANNEL,
        messages: [
          {
            id: "m-revise",
            from_me: false,
            type: "text",
            chat_id: "971500000015@s.whatsapp.net",
            timestamp: 1_790_000_620,
          },
        ],
        event: { type: "messages", event: "delete" },
      });
      assert.equal(removed.statusCode, 200);
      const deleted = await prisma.whatsAppMessage.findUniqueOrThrow({ where: { id: message.id } });
      assert.equal(deleted.textBody, null);
      const afterDelete = await prisma.whatsAppConversation.findUniqueOrThrow({ where: { id: before.id } });
      assert.equal(afterDelete.lastMessageAt?.toISOString(), before.lastMessageAt?.toISOString());
      assert.equal(afterDelete.lastMessageId, before.lastMessageId);
    });

    test("does not regress READ when an older delivered status arrives", async () => {
      const conversation = await prisma.whatsAppConversation.create({
        data: {
          connectionId,
          customerWaId: "971500000016",
          providerChatId: "971500000016@s.whatsapp.net",
        },
      });
      const message = await prisma.whatsAppMessage.create({
        data: {
          conversationId: conversation.id,
          connectionId,
          direction: "OUTBOUND",
          messageType: "TEXT",
          textBody: "status-order",
          receivedAt: new Date(),
          providerMessageId: "m-status-order",
          sendState: "ACCEPTED",
          providerStatus: "SENT",
        },
      });
      assert.equal(
        (
          await postWebhook(app, {
            channel_id: CHANNEL,
            statuses: [{ id: "m-status-order", status: "read", timestamp: 1_790_000_700 }],
            event: { type: "statuses", event: "post" },
          })
        ).statusCode,
        200,
      );
      assert.equal(
        (
          await postWebhook(app, {
            channel_id: CHANNEL,
            statuses: [{ id: "m-status-order", status: "delivered", timestamp: 1_790_000_690 }],
            event: { type: "statuses", event: "post" },
          })
        ).statusCode,
        200,
      );
      const updated = await prisma.whatsAppMessage.findUniqueOrThrow({ where: { id: message.id } });
      assert.equal(updated.providerStatus, "READ");
      const listed = await prisma.whatsAppConversation.findUniqueOrThrow({ where: { id: conversation.id } });
      assert.equal(listed.lastMessageAt, null);
    });
  });
}
