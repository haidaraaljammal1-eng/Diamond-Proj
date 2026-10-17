import { test, before, after, describe } from "node:test";
import assert from "node:assert/strict";
import type { FastifyInstance } from "fastify";
import type { PrismaClient } from "@prisma/client";
import { randomUUID } from "node:crypto";
import { PERMISSIONS } from "src/constants/permissions";
import { resetWhatsAppTables } from "../helpers/whatsapp-reset";
import { auth, login, seedPaymentUser } from "../helpers/payment-integration-helpers";
import { encryptWhatsAppCredential } from "src/modules/whatsapp/whatsapp.credentials";
import {
  setWhapiHistoryClientForTests,
  createWhatsAppHistorySyncService,
} from "src/modules/whatsapp/whatsapp.history-sync.service";
import type { WhapiHistoryClient } from "src/modules/whatsapp/whapi.history.client";
import { materializeInboundMessage } from "src/modules/whatsapp/whatsapp.inbound.service";

const RUN =
  process.env.RUN_INTEGRATION === "true" && Boolean(process.env.TEST_DATABASE_URL);

if (!RUN) {
  test("whatsapp history sync safety skipped", { skip: true });
} else {
  process.env.DATABASE_URL = process.env.TEST_DATABASE_URL!;
  process.env.WHATSAPP_HISTORY_SYNC_AUTO_EXECUTE = "false";
  process.env.FUNCTIONAL_RBAC_V2_ENABLED = "false";

  describe("Whapi history sync safety", { concurrency: false }, () => {
    let app: FastifyInstance;
    let prisma: PrismaClient;
    let connectionId = "";
    let adminToken = "";
    let readerToken = "";
    const chatId = "971500000077@s.whatsapp.net";
    const runId = () => randomUUID().slice(0, 8);

    before(async () => {
      const { buildApp } = await import("src/app");
      app = await buildApp();
      prisma = app.prisma;
      await resetWhatsAppTables(prisma);

      const connection = await prisma.whatsAppConnection.create({
        data: {
          provider: "WHAPI",
          status: "LINKED",
          providerInstanceId: `hist-safety-${runId()}`,
          providerSessionStatus: "AUTHENTICATED",
          credentialCiphertext: encryptWhatsAppCredential("safety-token"),
          webhookCallbackCiphertext: encryptWhatsAppCredential("callback"),
        },
      });
      connectionId = connection.id;

      const suffix = runId();
      await seedPaymentUser(
        prisma,
        `wa-reader-${suffix}@example.test`,
        "pass-reader",
        `wa_reader_${suffix}`,
        [PERMISSIONS.WHATSAPP_READ],
      );
      readerToken = await login(app, {
        email: `wa-reader-${suffix}@example.test`,
        password: "pass-reader",
      });

      adminToken = await login(app, {
        email: "admin@diamond.test",
        password: process.env.DEV_ADMIN_PASSWORD ?? "Diamond123!",
      });
    });

    after(async () => {
      setWhapiHistoryClientForTests(null);
      delete process.env.FUNCTIONAL_RBAC_V2_ENABLED;
      await app.close();
    });

    test("user with read only cannot start history sync (403)", async () => {
      const res = await app.inject({
        method: "POST",
        url: "/whatsapp/connection/history-sync/start",
        headers: auth(readerToken),
        payload: { execute: true },
      });
      assert.equal(res.statusCode, 403);
    });

    test("cancel during pagination stops with partial progress", async () => {
      const msgIds = [randomUUID(), randomUUID(), randomUUID()];
      setWhapiHistoryClientForTests({
        async listChats(count, offset) {
          if (offset > 0) return { items: [], pageSize: count, hasMore: false };
          return { items: [{ id: chatId, name: "Cancel User" }], pageSize: count, hasMore: false };
        },
        async listMessages(id, count, offset, sort) {
          assert.equal(sort, "asc");
          if (offset >= msgIds.length) return { items: [], pageSize: count, hasMore: false };
          const slice = msgIds.slice(offset, offset + 1).map((id, i) => ({
            id,
            chat_id: chatId,
            type: "text",
            from_me: false,
            timestamp: 1_700_000_000 + offset + i,
            text: { body: `m${offset}` },
          }));
          return {
            items: slice,
            pageSize: count,
            hasMore: offset + slice.length < msgIds.length,
          };
        },
      });

      const sync = createWhatsAppHistorySyncService(app);
      const run = await prisma.whatsAppHistorySyncRun.create({
        data: {
          connectionId,
          status: "RUNNING",
          phase: "MESSAGES",
          chatQueue: [{ chatId, displayName: "Cancel User" }],
        },
      });

      await sync.processHistorySyncBatch(run.id);
      await prisma.whatsAppHistorySyncRun.update({
        where: { id: run.id },
        data: { cancelRequested: true },
      });
      await sync.processHistorySyncBatch(run.id);

      const updated = await prisma.whatsAppHistorySyncRun.findUniqueOrThrow({
        where: { id: run.id },
      });
      assert.equal(updated.status, "CANCELLED");
      assert.ok(updated.messagesImported >= 1);
      assert.ok(updated.messagesImported < msgIds.length);
    });

    test("concurrent batches do not double-count imports", async () => {
      const msgId = randomUUID();
      let listCalls = 0;
      setWhapiHistoryClientForTests({
        async listChats(count, offset) {
          if (offset > 0) return { items: [], pageSize: count, hasMore: false };
          return { items: [{ id: chatId, name: "Concurrent" }], pageSize: count, hasMore: false };
        },
        async listMessages(_id, count, offset, sort) {
          assert.equal(sort, "asc");
          listCalls += 1;
          await new Promise((r) => setTimeout(r, 40));
          if (offset > 0) return { items: [], pageSize: count, hasMore: false };
          return {
            items: [
              {
                id: msgId,
                chat_id: chatId,
                type: "text",
                from_me: false,
                timestamp: 1_700_000_000,
                text: { body: "once" },
              },
            ],
            pageSize: count,
            hasMore: false,
          };
        },
      });

      const sync = createWhatsAppHistorySyncService(app);
      const run = await prisma.whatsAppHistorySyncRun.create({
        data: {
          connectionId,
          status: "RUNNING",
          phase: "MESSAGES",
          chatQueue: [{ chatId, displayName: "Concurrent" }],
        },
      });

      await Promise.all([
        sync.processHistorySyncBatch(run.id),
        sync.processHistorySyncBatch(run.id),
      ]);

      const done = await prisma.whatsAppHistorySyncRun.findUniqueOrThrow({ where: { id: run.id } });
      const rows = await prisma.whatsAppMessage.count({
        where: { connectionId, providerMessageId: msgId },
      });
      assert.equal(rows, 1);
      assert.equal(done.messagesImported, 1);
      assert.ok(listCalls >= 1);
    });

    test("older history does not replace newer conversation preview", async () => {
      const newerId = randomUUID();
      const olderId = randomUUID();
      const sync = createWhatsAppHistorySyncService(app);

      await materializeInboundMessage(
        prisma,
        {
          connectionId,
          customerWaId: "971500000077",
          providerChatId: chatId,
          customerDisplayName: "Preview User",
          providerMessageId: newerId,
          messageType: "text",
          textBody: "newer live preview",
          providerMediaId: null,
          providerOccurredAt: new Date("2025-06-01T12:00:00.000Z"),
          receivedAt: new Date("2025-06-01T12:00:01.000Z"),
        },
      );

      const before = await prisma.whatsAppConversation.findFirstOrThrow({
        where: { connectionId, customerWaId: "971500000077" },
      });
      assert.equal(before.lastMessagePreview, "newer live preview");

      setWhapiHistoryClientForTests({
        async listChats(count, offset) {
          if (offset > 0) return { items: [], pageSize: count, hasMore: false };
          return { items: [{ id: chatId, name: "Preview User" }], pageSize: count, hasMore: false };
        },
        async listMessages(id, count, offset, sort) {
          assert.equal(id, chatId);
          assert.equal(sort, "asc");
          if (offset > 0) return { items: [], pageSize: count, hasMore: false };
          return {
            items: [
              {
                id: olderId,
                chat_id: chatId,
                type: "text",
                from_me: false,
                timestamp: 1_600_000_000,
                text: { body: "older history" },
              },
            ],
            pageSize: count,
            hasMore: false,
          };
        },
      });

      const run = await prisma.whatsAppHistorySyncRun.create({
        data: {
          connectionId,
          status: "RUNNING",
          phase: "MESSAGES",
          chatQueue: [{ chatId, displayName: "Preview User" }],
        },
      });
      for (let i = 0; i < 10; i += 1) {
        const more = await sync.processHistorySyncBatch(run.id);
        if (!more) break;
      }

      const after = await prisma.whatsAppConversation.findUniqueOrThrow({
        where: { id: before.id },
      });
      assert.equal(after.lastMessagePreview, "newer live preview");
      const olderRow = await prisma.whatsAppMessage.findFirst({
        where: { connectionId, providerMessageId: olderId },
      });
      assert.ok(olderRow);
    });

    test("checkpoint resumes after simulated interrupt", async () => {
      const msgA = randomUUID();
      const msgB = randomUUID();
      setWhapiHistoryClientForTests({
        async listChats(count, offset) {
          if (offset > 0) return { items: [], pageSize: count, hasMore: false };
          return { items: [{ id: chatId, name: "Resume" }], pageSize: count, hasMore: false };
        },
        async listMessages(_id, count, offset, sort) {
          assert.equal(sort, "asc");
          if (offset === 0) {
            return {
              items: [
                {
                  id: msgA,
                  chat_id: chatId,
                  type: "text",
                  from_me: false,
                  timestamp: 1_700_000_000,
                  text: { body: "a" },
                },
              ],
              pageSize: count,
              hasMore: true,
            };
          }
          if (offset === 1) {
            return {
              items: [
                {
                  id: msgB,
                  chat_id: chatId,
                  type: "text",
                  from_me: false,
                  timestamp: 1_700_000_100,
                  text: { body: "b" },
                },
              ],
              pageSize: count,
              hasMore: false,
            };
          }
          return { items: [], pageSize: count, hasMore: false };
        },
      });

      const sync = createWhatsAppHistorySyncService(app);
      const run = await prisma.whatsAppHistorySyncRun.create({
        data: {
          connectionId,
          status: "RUNNING",
          phase: "MESSAGES",
          chatQueue: [{ chatId, displayName: "Resume" }],
          messagesOffset: 0,
        },
      });

      await sync.processHistorySyncBatch(run.id);
      const mid = await prisma.whatsAppHistorySyncRun.findUniqueOrThrow({ where: { id: run.id } });
      assert.equal(mid.messagesImported, 1);
      assert.ok(mid.messagesOffset >= 1);

      for (let i = 0; i < 10; i += 1) {
        const more = await sync.processHistorySyncBatch(run.id);
        if (!more) break;
      }

      const done = await prisma.whatsAppHistorySyncRun.findUniqueOrThrow({ where: { id: run.id } });
      assert.equal(done.status, "COMPLETED");
      assert.equal(done.messagesImported, 2);
    });
  });
}
