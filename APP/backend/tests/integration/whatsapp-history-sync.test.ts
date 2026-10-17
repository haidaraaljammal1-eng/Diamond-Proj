import { test, before, after, describe } from "node:test";
import assert from "node:assert/strict";
import type { FastifyInstance } from "fastify";
import type { PrismaClient } from "@prisma/client";
import { randomUUID } from "node:crypto";
import { resetWhatsAppTables } from "../helpers/whatsapp-reset";
import { encryptWhatsAppCredential } from "src/modules/whatsapp/whatsapp.credentials";
import {
  setWhapiHistoryClientForTests,
  createWhatsAppHistorySyncService,
} from "src/modules/whatsapp/whatsapp.history-sync.service";
import type { WhapiHistoryClient } from "src/modules/whatsapp/whapi.history.client";

const RUN =
  process.env.RUN_INTEGRATION === "true" && Boolean(process.env.TEST_DATABASE_URL);

if (!RUN) {
  test("whatsapp history sync skipped", { skip: true });
} else {
  process.env.DATABASE_URL = process.env.TEST_DATABASE_URL!;
  process.env.WHATSAPP_HISTORY_SYNC_AUTO_EXECUTE = "false";

  describe("Whapi history sync P3-A", { concurrency: false }, () => {
    let app: FastifyInstance;
    let prisma: PrismaClient;
    let connectionId = "";
    let adminToken = "";
    const chatId = "971500000099@s.whatsapp.net";
    const msgInbound = randomUUID();
    const msgOutbound = randomUUID();

    const fakeClient: WhapiHistoryClient = {
      async listChats(count, offset) {
        if (offset > 0) return { items: [], pageSize: count, hasMore: false };
        return {
          items: [{ id: chatId, name: "History User" }],
          pageSize: count,
          hasMore: false,
        };
      },
      async listMessages(id, count, offset, sort) {
        assert.equal(id, chatId);
        assert.equal(sort, "asc");
        if (offset > 0) return { items: [], pageSize: count, hasMore: false };
        return {
          items: [
            {
              id: msgInbound,
              chat_id: chatId,
              type: "text",
              from_me: false,
              timestamp: 1_700_000_000,
              text: { body: "old inbound" },
              from_name: "History User",
            },
            {
              id: msgOutbound,
              chat_id: chatId,
              type: "text",
              from_me: true,
              timestamp: 1_700_000_100,
              text: { body: "old outbound" },
            },
            {
              id: msgInbound,
              chat_id: chatId,
              type: "text",
              from_me: false,
              timestamp: 1_700_000_000,
              text: { body: "duplicate" },
            },
          ],
          pageSize: count,
          hasMore: false,
        };
      },
    };

    before(async () => {
      const { buildApp } = await import("src/app");
      app = await buildApp();
      prisma = app.prisma;
      await resetWhatsAppTables(prisma);
      setWhapiHistoryClientForTests(fakeClient);

      const connection = await prisma.whatsAppConnection.create({
        data: {
          provider: "WHAPI",
          status: "LINKED",
          providerInstanceId: "hist-sync-test",
          providerSessionStatus: "AUTHENTICATED",
          credentialCiphertext: encryptWhatsAppCredential("hist-sync-token"),
          webhookCallbackCiphertext: encryptWhatsAppCredential("callback"),
        },
      });
      connectionId = connection.id;

      const login = await app.inject({
        method: "POST",
        url: "/auth/login",
        payload: {
          email: "admin@diamond.test",
          password: process.env.DEV_ADMIN_PASSWORD ?? "Diamond123!",
        },
      });
      adminToken = login.json().data.accessToken;
    });

    after(async () => {
      setWhapiHistoryClientForTests(null);
      await app.close();
    });

    test("manual start imports messages without raising unread", async () => {
      const convo = await prisma.whatsAppConversation.create({
        data: {
          connectionId,
          customerWaId: "971500000099",
          providerChatId: chatId,
          unreadCount: 3,
        },
      });

      const start = await app.inject({
        method: "POST",
        url: "/whatsapp/connection/history-sync/start",
        headers: { authorization: `Bearer ${adminToken}` },
        payload: { execute: true },
      });
      assert.equal(start.statusCode, 200, start.body);

      const sync = createWhatsAppHistorySyncService(app);
      const run = await prisma.whatsAppHistorySyncRun.findFirst({
        where: { connectionId },
        orderBy: { createdAt: "desc" },
      });
      assert.ok(run);
      for (let i = 0; i < 40; i += 1) {
        const more = await sync.processHistorySyncBatch(run!.id);
        if (!more) break;
      }

      const messages = await prisma.whatsAppMessage.findMany({
        where: { connectionId },
        orderBy: { providerOccurredAt: "asc" },
      });
      assert.equal(messages.length, 2);
      assert.equal(messages[0]?.providerMessageId, msgInbound);
      assert.equal(messages[1]?.providerMessageId, msgOutbound);

      const afterConvo = await prisma.whatsAppConversation.findUniqueOrThrow({
        where: { id: convo.id },
      });
      assert.equal(afterConvo.unreadCount, 3);

      const completed = await prisma.whatsAppHistorySyncRun.findUniqueOrThrow({
        where: { id: run!.id },
      });
      assert.equal(completed.status, "COMPLETED");
      assert.equal(completed.messagesImported, 2);
      assert.ok(completed.messagesSkipped >= 1);
    });

    test("reader without manage cannot start sync", async () => {
      const denied = await app.inject({
        method: "POST",
        url: "/whatsapp/connection/history-sync/start",
        payload: { execute: true },
      });
      assert.equal(denied.statusCode, 401);
    });
  });
}
