import { test, before, after, describe } from "node:test";
import assert from "node:assert/strict";
import type { FastifyInstance } from "fastify";
import type { PrismaClient } from "@prisma/client";
import { randomUUID } from "node:crypto";
import { PERMISSIONS } from "src/constants/permissions";
import { FN } from "src/lib/rbac/functional-permissions/keys";
import { resetWhatsAppTables } from "../helpers/whatsapp-reset";
import { auth, login, seedPaymentUser } from "../helpers/payment-integration-helpers";
import { encryptWhatsAppCredential } from "src/modules/whatsapp/whatsapp.credentials";
import {
  setWhapiHistoryClientForTests,
  createWhatsAppHistorySyncService,
} from "src/modules/whatsapp/whatsapp.history-sync.service";
import { WHAPI_HISTORY_CHAT_SKIP } from "src/modules/whatsapp/whapi.history.messages-list";
import type { WhapiHistoryClient } from "src/modules/whatsapp/whapi.history.client";
import { upsertChatSyncCheckpoint } from "src/modules/whatsapp/whatsapp.history-sync.checkpoints";
import { materializeInboundMessage } from "src/modules/whatsapp/whatsapp.inbound.service";

const RUN =
  process.env.RUN_INTEGRATION === "true" && Boolean(process.env.TEST_DATABASE_URL);

if (!RUN) {
  test("whatsapp history sync P3-B skipped", { skip: true });
} else {
  process.env.DATABASE_URL = process.env.TEST_DATABASE_URL!;
  process.env.WHATSAPP_HISTORY_SYNC_AUTO_EXECUTE = "false";

  describe("Whapi history sync P3-B", { concurrency: false }, () => {
    let app: FastifyInstance;
    let prisma: PrismaClient;
    let connectionId = "";
    const chatOk = "971500000066@s.whatsapp.net";
    const chatBad = "971500000055@s.whatsapp.net";

    before(async () => {
      const { buildApp } = await import("src/app");
      app = await buildApp();
      prisma = app.prisma;
      await resetWhatsAppTables(prisma);
      const connection = await prisma.whatsAppConnection.create({
        data: {
          provider: "WHAPI",
          status: "LINKED",
          providerInstanceId: "p3b-test",
          providerSessionStatus: "AUTHENTICATED",
          credentialCiphertext: encryptWhatsAppCredential("p3b-token"),
          webhookCallbackCiphertext: encryptWhatsAppCredential("callback"),
        },
      });
      connectionId = connection.id;
    });

    after(async () => {
      setWhapiHistoryClientForTests(null);
      await app.close();
    });

    test("records skipped chat on HTTP 400 list outcome", async () => {
      const msgOk = randomUUID();
      setWhapiHistoryClientForTests({
        async listChats(count, offset) {
          if (offset > 0) return { items: [], pageSize: count, hasMore: false };
          return {
            items: [
              { id: chatOk, name: "Ok" },
              { id: chatBad, name: "Bad" },
            ],
            pageSize: count,
            hasMore: false,
          };
        },
        async listMessages(id, count, offset, sort) {
          if (id === chatBad) {
            return {
              items: [],
              pageSize: count,
              hasMore: false,
              skipChat: {
                reasonCode: WHAPI_HISTORY_CHAT_SKIP.MESSAGES_LIST_UNSUPPORTED,
                httpStatus: 400,
              },
            };
          }
          if (offset > 0) return { items: [], pageSize: count, hasMore: false };
          return {
            items: [
              {
                id: msgOk,
                chat_id: chatOk,
                type: "text",
                from_me: false,
                timestamp: 1_700_000_000,
                text: { body: "ok" },
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
      for (let i = 0; i < 30; i += 1) {
        const more = await sync.processHistorySyncBatch(run.id);
        if (!more) break;
      }

      const done = await prisma.whatsAppHistorySyncRun.findUniqueOrThrow({ where: { id: run.id } });
      assert.equal(done.status, "COMPLETED");
      assert.equal(done.chatsSkipped, 1);
      assert.equal(done.completedWithSkips, true);
      assert.equal(done.chatsCompleted, 2);
    });

    test("incremental catch-up imports only messages after checkpoint", async () => {
      const liveId = randomUUID();
      const oldId = randomUUID();
      const newId = randomUUID();

      await materializeInboundMessage(prisma, {
        connectionId,
        customerWaId: "971500000066",
        providerChatId: chatOk,
        customerDisplayName: "Inc",
        providerMessageId: liveId,
        messageType: "text",
        textBody: "live baseline",
        providerMediaId: null,
        providerOccurredAt: new Date("2025-08-01T12:00:00.000Z"),
        receivedAt: new Date("2025-08-01T12:00:01.000Z"),
      });

      await upsertChatSyncCheckpoint(
        prisma,
        connectionId,
        chatOk,
        new Date("2025-08-01T12:00:00.000Z"),
      );

      setWhapiHistoryClientForTests({
        async listChats(count, offset) {
          if (offset > 0) return { items: [], pageSize: count, hasMore: false };
          return { items: [{ id: chatOk, name: "Inc" }], pageSize: count, hasMore: false };
        },
        async listMessages(id, count, offset, sort) {
          assert.equal(sort, "desc");
          if (offset > 0) return { items: [], pageSize: count, hasMore: false };
          return {
            items: [
              {
                id: newId,
                chat_id: chatOk,
                type: "text",
                from_me: false,
                timestamp: Math.floor(new Date("2025-08-02T12:00:00.000Z").getTime() / 1000),
                text: { body: "new" },
              },
              {
                id: oldId,
                chat_id: chatOk,
                type: "text",
                from_me: false,
                timestamp: Math.floor(new Date("2025-07-01T12:00:00.000Z").getTime() / 1000),
                text: { body: "old" },
              },
            ],
            pageSize: count,
            hasMore: false,
          };
        },
      });

      const sync = createWhatsAppHistorySyncService(app);
      const run = await prisma.whatsAppHistorySyncRun.create({
        data: { connectionId, status: "RUNNING", phase: "CHATS", mode: "INCREMENTAL" },
      });
      for (let i = 0; i < 20; i += 1) {
        const more = await sync.processHistorySyncBatch(run.id);
        if (!more) break;
      }

      const rows = await prisma.whatsAppMessage.findMany({
        where: { connectionId },
      });
      assert.equal(rows.some((r) => r.providerMessageId === newId), true);
      assert.equal(rows.some((r) => r.providerMessageId === oldId), false);
    });

    test("repeated incremental sync imports zero new rows", async () => {
      const sync = createWhatsAppHistorySyncService(app);
      const msgId = randomUUID();
      setWhapiHistoryClientForTests({
        async listChats(count, offset) {
          if (offset > 0) return { items: [], pageSize: count, hasMore: false };
          return { items: [{ id: chatOk, name: "Inc" }], pageSize: count, hasMore: false };
        },
        async listMessages(_id, count, offset, sort) {
          assert.equal(sort, "desc");
          if (offset > 0) return { items: [], pageSize: count, hasMore: false };
          return {
            items: [
              {
                id: msgId,
                chat_id: chatOk,
                type: "text",
                from_me: false,
                timestamp: Math.floor(new Date("2025-08-03T12:00:00.000Z").getTime() / 1000),
                text: { body: "x" },
              },
            ],
            pageSize: count,
            hasMore: false,
          };
        },
      });

      const run1 = await prisma.whatsAppHistorySyncRun.create({
        data: { connectionId, status: "RUNNING", phase: "CHATS", mode: "INCREMENTAL" },
      });
      for (let i = 0; i < 15; i += 1) {
        if (!(await sync.processHistorySyncBatch(run1.id))) break;
      }
      const countAfterFirst = await prisma.whatsAppMessage.count({ where: { connectionId } });

      const run2 = await prisma.whatsAppHistorySyncRun.create({
        data: { connectionId, status: "RUNNING", phase: "CHATS", mode: "INCREMENTAL" },
      });
      for (let i = 0; i < 15; i += 1) {
        if (!(await sync.processHistorySyncBatch(run2.id))) break;
      }
      const countAfterSecond = await prisma.whatsAppMessage.count({ where: { connectionId } });
      assert.equal(countAfterSecond, countAfterFirst);

      const second = await prisma.whatsAppHistorySyncRun.findUniqueOrThrow({ where: { id: run2.id } });
      assert.ok(second.messagesSkipped >= 1);
    });

    test("RBAC V2: user without whatsapp.full cannot start sync", async () => {
      process.env.FUNCTIONAL_RBAC_V2_ENABLED = "true";
      const suffix = randomUUID().slice(0, 8);
      await seedPaymentUser(
        prisma,
        `wa-fin-${suffix}@example.test`,
        "pass-fin",
        `wa_fin_${suffix}`,
        [FN.finance.viewPage],
      );
      const token = await login(app, {
        email: `wa-fin-${suffix}@example.test`,
        password: "pass-fin",
      });
      const res = await app.inject({
        method: "POST",
        url: "/whatsapp/connection/history-sync/start",
        headers: auth(token),
        payload: { execute: false, mode: "INCREMENTAL" },
      });
      process.env.FUNCTIONAL_RBAC_V2_ENABLED = "false";
      assert.equal(res.statusCode, 403);
    });
  });
}
