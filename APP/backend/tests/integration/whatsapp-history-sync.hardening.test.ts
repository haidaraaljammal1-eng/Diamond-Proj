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
import { reconcileWhatsAppHistorySyncOnBoot } from "src/modules/whatsapp/whatsapp.history-sync.lifecycle";
import { whapiHistoryHttpError } from "src/modules/whatsapp/whatsapp.history-sync.provider-errors";
import type { WhapiHistoryClient } from "src/modules/whatsapp/whapi.history.client";
import { whapiHistoryNoGroups } from "../helpers/whapi-history-no-groups";
import { materializeInboundMessage } from "src/modules/whatsapp/whatsapp.inbound.service";

const RUN =
  process.env.RUN_INTEGRATION === "true" && Boolean(process.env.TEST_DATABASE_URL);

if (!RUN) {
  test("whatsapp history sync hardening skipped", { skip: true });
} else {
  process.env.DATABASE_URL = process.env.TEST_DATABASE_URL!;
  process.env.WHATSAPP_HISTORY_SYNC_AUTO_EXECUTE = "false";

  describe("Whapi history sync hardening", { concurrency: false }, () => {
    let app: FastifyInstance;
    let prisma: PrismaClient;
    let connectionId = "";
    let adminToken = "";
    const chatId = "971500000088@s.whatsapp.net";

    before(async () => {
      const { buildApp } = await import("src/app");
      app = await buildApp();
      prisma = app.prisma;
      await resetWhatsAppTables(prisma);

      const connection = await prisma.whatsAppConnection.create({
        data: {
          provider: "WHAPI",
          status: "LINKED",
          providerInstanceId: "hist-hardening",
          providerSessionStatus: "AUTHENTICATED",
          credentialCiphertext: encryptWhatsAppCredential("hist-hardening-token"),
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

    test("boot reconcile re-queues RUNNING when auto execute is off", async () => {
      let whapiCalled = false;
      setWhapiHistoryClientForTests({
        listGroups: whapiHistoryNoGroups,
        async listChats() {
          whapiCalled = true;
          return { items: [], pageSize: 50, hasMore: false };
        },
        async listMessages() {
          whapiCalled = true;
          return { items: [], pageSize: 50, hasMore: false };
        },
      });

      const run = await prisma.whatsAppHistorySyncRun.create({
        data: {
          connectionId,
          status: "RUNNING",
          phase: "CHATS",
          startedAt: new Date(),
        },
      });

      const sync = createWhatsAppHistorySyncService(app);
      await reconcileWhatsAppHistorySyncOnBoot(prisma, app.log, (id) => sync.scheduleRun(id));

      const updated = await prisma.whatsAppHistorySyncRun.findUniqueOrThrow({
        where: { id: run.id },
      });
      assert.equal(updated.status, "QUEUED");
      assert.equal(updated.lastErrorCode, "WHATSAPP_HISTORY_SYNC_INTERRUPTED");
      assert.equal(whapiCalled, false);
    });

    test("webhook inbound then history import keeps one row and unread", async () => {
      const providerMessageId = randomUUID();
      const sync = createWhatsAppHistorySyncService(app);

      await materializeInboundMessage(prisma, {
        connectionId,
        customerWaId: "971500000088",
        providerChatId: chatId,
        customerDisplayName: "Race User",
        providerMessageId,
        messageType: "text",
        textBody: "live webhook",
        providerMediaId: null,
        providerOccurredAt: new Date("2024-01-02T10:00:00.000Z"),
        receivedAt: new Date("2024-01-02T10:00:01.000Z"),
      });

      const convoBefore = await prisma.whatsAppConversation.findFirstOrThrow({
        where: { connectionId, customerWaId: "971500000088" },
      });
      assert.equal(convoBefore.unreadCount, 1);

      setWhapiHistoryClientForTests({
        listGroups: whapiHistoryNoGroups,
        async listChats(_count, offset) {
          if (offset > 0) return { items: [], pageSize: 50, hasMore: false };
          return { items: [{ id: chatId, name: "Race User" }], pageSize: 50, hasMore: false };
        },
        async listMessages(id, _count, offset, sort) {
          assert.equal(id, chatId);
          assert.equal(sort, "asc");
          if (offset > 0) return { items: [], pageSize: 100, hasMore: false };
          return {
            items: [
              {
                id: providerMessageId,
                chat_id: chatId,
                type: "text",
                from_me: false,
                timestamp: 1_704_187_200,
                text: { body: "history duplicate" },
              },
            ],
            pageSize: 100,
            hasMore: false,
          };
        },
      });

      const run = await prisma.whatsAppHistorySyncRun.create({
        data: { connectionId, status: "RUNNING", phase: "MESSAGES", chatQueue: [{ chatId, displayName: "Race User" }] },
      });

      for (let i = 0; i < 20; i += 1) {
        const more = await sync.processHistorySyncBatch(run.id);
        if (!more) break;
      }

      const messages = await prisma.whatsAppMessage.findMany({
        where: { connectionId, providerMessageId },
      });
      assert.equal(messages.length, 1);
      assert.equal(messages[0]?.textBody, "live webhook");
      assert.equal(messages[0]?.providerStatus, null);

      const convoAfter = await prisma.whatsAppConversation.findUniqueOrThrow({
        where: { id: convoBefore.id },
      });
      assert.equal(convoAfter.unreadCount, 1);
    });

    test("retries retriable Whapi errors then completes", async () => {
      const msgId = randomUUID();
      let chatAttempts = 0;
      setWhapiHistoryClientForTests({
        listGroups: whapiHistoryNoGroups,
        async listChats(count, offset) {
          chatAttempts += 1;
          if (chatAttempts < 2) throw whapiHistoryHttpError("chats", 429);
          if (offset > 0) return { items: [], pageSize: count, hasMore: false };
          return {
            items: [{ id: chatId, name: "Retry User" }],
            pageSize: count,
            hasMore: false,
          };
        },
        async listMessages(id, count, offset, sort) {
          assert.equal(sort, "asc");
          if (offset > 0) return { items: [], pageSize: count, hasMore: false };
          return {
            items: [
              {
                id: msgId,
                chat_id: chatId,
                type: "text",
                from_me: false,
                timestamp: 1_700_000_000,
                text: { body: "after retry" },
              },
            ],
            pageSize: count,
            hasMore: false,
          };
        },
      });

      const sync = createWhatsAppHistorySyncService(app);
      const run = await prisma.whatsAppHistorySyncRun.create({
        data: { connectionId, status: "RUNNING", phase: "CHATS" },
      });

      let steps = 0;
      while (steps < 30) {
        steps += 1;
        const more = await sync.processHistorySyncBatch(run.id);
        if (!more) break;
      }

      const done = await prisma.whatsAppHistorySyncRun.findUniqueOrThrow({ where: { id: run.id } });
      assert.equal(done.status, "COMPLETED");
      assert.ok(chatAttempts >= 2);
      const imported = await prisma.whatsAppMessage.findFirst({
        where: { connectionId, providerMessageId: msgId },
      });
      assert.ok(imported);
    });

    test("inactive connection run is cancelled and does not import", async () => {
      const oldConnection = await prisma.whatsAppConnection.create({
        data: {
          provider: "WHAPI",
          status: "DISCONNECTED",
          providerInstanceId: "old-account",
          disconnectedAt: new Date(),
        },
      });
      const msgId = randomUUID();
      setWhapiHistoryClientForTests({
        listGroups: whapiHistoryNoGroups,
        async listChats() {
          throw new Error("must not call Whapi for inactive connection");
        },
        async listMessages() {
          return {
            items: [
              {
                id: msgId,
                chat_id: chatId,
                type: "text",
                from_me: false,
                timestamp: 1_700_000_000,
                text: { body: "orphan" },
              },
            ],
            pageSize: 100,
            hasMore: false,
          };
        },
      });

      const sync = createWhatsAppHistorySyncService(app);
      const run = await prisma.whatsAppHistorySyncRun.create({
        data: {
          connectionId: oldConnection.id,
          status: "RUNNING",
          phase: "MESSAGES",
          chatQueue: [{ chatId, displayName: null }],
        },
      });

      const more = await sync.processHistorySyncBatch(run.id);
      assert.equal(more, false);

      const updated = await prisma.whatsAppHistorySyncRun.findUniqueOrThrow({ where: { id: run.id } });
      assert.equal(updated.status, "CANCELLED");
      assert.equal(updated.lastErrorCode, "WHATSAPP_HISTORY_SYNC_CONNECTION_INACTIVE");

      const orphan = await prisma.whatsAppMessage.findFirst({
        where: { connectionId: oldConnection.id, providerMessageId: msgId },
      });
      assert.equal(orphan, null);
    });

    test("history sync status readable; start requires auth", async () => {
      const status = await app.inject({
        method: "GET",
        url: "/whatsapp/connection/history-sync",
        headers: { authorization: `Bearer ${adminToken}` },
      });
      assert.equal(status.statusCode, 200);

      const denied = await app.inject({
        method: "POST",
        url: "/whatsapp/connection/history-sync/start",
        payload: { execute: true },
      });
      assert.equal(denied.statusCode, 401);
    });
  });
}
