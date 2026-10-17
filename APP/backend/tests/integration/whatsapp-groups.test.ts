import { test, before, after, describe } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import type { FastifyInstance } from "fastify";
import type { PrismaClient } from "@prisma/client";
import { PERMISSIONS } from "src/constants/permissions";
import { auth, login, seedPaymentUser } from "../helpers/payment-integration-helpers";
import { encryptWhatsAppCredential } from "src/modules/whatsapp/whatsapp.credentials";
import { whapiWebhookSecretHeaderName } from "src/modules/whatsapp/whapi.config";
import { setWhatsAppProviderForTests } from "src/modules/whatsapp/whatsapp.provider";
import {
  setWhapiHistoryClientForTests,
  createWhatsAppHistorySyncService,
} from "src/modules/whatsapp/whatsapp.history-sync.service";
import { createFakeWhatsAppProvider } from "../helpers/fake-whatsapp-provider";
import { WHAPI_CAPABILITIES } from "src/modules/whatsapp/whatsapp.capabilities";
import { resetWhatsAppTables } from "../helpers/whatsapp-reset";

const RUN =
  process.env.RUN_INTEGRATION === "true" && Boolean(process.env.TEST_DATABASE_URL);

const CALLBACK = "p3d-groups-callback";
const SECRET = "p3d-groups-webhook-secret";
const CHANNEL = "p3d-groups-channel";
const GROUP_ID = "120363000000000001@g.us";

function postWebhook(app: FastifyInstance, body: unknown) {
  const headers: Record<string, string> = {
    "content-type": "application/json",
    [whapiWebhookSecretHeaderName()]: SECRET,
  };
  return app.inject({
    method: "POST",
    url: `/whatsapp/webhooks/whapi/${CALLBACK}`,
    headers,
    payload: Buffer.from(JSON.stringify(body)),
  });
}

if (!RUN) {
  test("whatsapp groups skipped", { skip: true });
} else {
  process.env.DATABASE_URL = process.env.TEST_DATABASE_URL!;
  process.env.WHATSAPP_PROVIDER = "WHAPI";
  process.env.WHAPI_WEBHOOK_SECRET = SECRET;
  process.env.WHAPI_WEBHOOK_CALLBACK_KEY = CALLBACK;
  process.env.WHAPI_CHANNEL_ID = CHANNEL;

  describe("WhatsApp P3-D groups", { concurrency: false }, () => {
    let app: FastifyInstance;
    let prisma: PrismaClient;
    let connectionId = "";
    let adminToken = "";
    let fake: ReturnType<typeof createFakeWhatsAppProvider>;

    before(async () => {
      const { env } = await import("src/config/env");
      if (!/haidara_test(?:\?|$)/.test(env.DATABASE_URL)) {
        throw new Error("whatsapp groups tests require haidara_test");
      }
      fake = createFakeWhatsAppProvider();
      setWhatsAppProviderForTests({
        ...fake.provider,
        capabilities: () => WHAPI_CAPABILITIES,
      });
      const { buildApp } = await import("src/app");
      app = await buildApp();
      prisma = app.prisma;
      await resetWhatsAppTables(prisma);

      const connection = await prisma.whatsAppConnection.create({
        data: {
          provider: "WHAPI",
          status: "LINKED",
          providerInstanceId: CHANNEL,
          providerSessionStatus: "AUTHENTICATED",
          credentialCiphertext: encryptWhatsAppCredential("p3d-token"),
          webhookCallbackCiphertext: encryptWhatsAppCredential(CALLBACK),
          webhookStatus: "ACTIVE",
        },
      });
      connectionId = connection.id;
      const sender = { email: `p3d-send-${Date.now()}@example.test`, password: "p3d-send-pass-123" };
      await seedPaymentUser(prisma, sender.email, sender.password, `p3d_${Date.now()}`, [
        PERMISSIONS.WHATSAPP_READ,
        PERMISSIONS.WHATSAPP_SEND,
      ]);
      adminToken = await login(app, sender);
    });

    after(async () => {
      setWhapiHistoryClientForTests(null);
      setWhatsAppProviderForTests(undefined);
      await app.close();
    });

    test("history sync discovers group and imports message", async () => {
      const msgId = randomUUID();
      setWhapiHistoryClientForTests({
        listGroups: async (count, offset) => {
          if (offset > 0) return { items: [], pageSize: count, hasMore: false };
          return {
            items: [
              {
                id: GROUP_ID,
                name: "Fleet Ops",
                participants: [{ id: "971500000001@s.whatsapp.net", name: "Driver" }],
              },
            ],
            pageSize: count,
            hasMore: false,
          };
        },
        async listChats(count, offset) {
          if (offset > 0) return { items: [], pageSize: count, hasMore: false };
          return { items: [], pageSize: count, hasMore: false };
        },
        async listMessages(id, count, offset, sort) {
          assert.equal(id, GROUP_ID);
          assert.equal(sort, "asc");
          if (offset > 0) return { items: [], pageSize: count, hasMore: false };
          return {
            items: [
              {
                id: msgId,
                chat_id: GROUP_ID,
                type: "text",
                from_me: false,
                timestamp: 1_700_000_000,
                from_name: "Driver",
                author: "971500000001@s.whatsapp.net",
                text: { body: "van ready" },
              },
            ],
            pageSize: count,
            hasMore: false,
          };
        },
      });

      const sync = createWhatsAppHistorySyncService(app);
      const run = await prisma.whatsAppHistorySyncRun.create({
        data: { connectionId, status: "RUNNING", phase: "CHATS", mode: "FULL" },
      });
      for (let i = 0; i < 40; i += 1) {
        const more = await sync.processHistorySyncBatch(run.id);
        if (!more) break;
      }
      const done = await prisma.whatsAppHistorySyncRun.findUniqueOrThrow({ where: { id: run.id } });
      assert.equal(done.status, "COMPLETED");

      const convo = await prisma.whatsAppConversation.findFirst({
        where: { connectionId, customerWaId: GROUP_ID },
      });
      assert.ok(convo);
      assert.equal(convo!.kind, "GROUP");
      const msg = await prisma.whatsAppMessage.findFirst({ where: { providerMessageId: msgId } });
      assert.ok(msg);

      const dup = await prisma.whatsAppMessage.count({ where: { providerMessageId: msgId } });
      assert.equal(dup, 1);
    });

    test("customer link APIs forbidden for GROUP", async () => {
      const convo = await prisma.whatsAppConversation.create({
        data: {
          connectionId,
          kind: "GROUP",
          customerWaId: "120363999999999999@g.us",
          providerChatId: "120363999999999999@g.us",
          customerDisplayName: "Test Group",
        },
      });
      const match = await app.inject({
        method: "GET",
        url: `/whatsapp/conversations/${convo.id}/customer-match`,
        headers: auth(adminToken),
      });
      assert.equal(match.json().error?.context?.reason, "WHATSAPP_GROUP_CUSTOMER_OPERATIONS_FORBIDDEN");
      const ctx = await app.inject({
        method: "GET",
        url: `/whatsapp/conversations/${convo.id}/customer-context`,
        headers: auth(adminToken),
      });
      assert.equal(ctx.json().error?.context?.reason, "WHATSAPP_GROUP_CUSTOMER_OPERATIONS_FORBIDDEN");
    });

    test("send text to group uses provider chat id and optional quote", async () => {
      const sendGroupId = "120363000000000002@g.us";
      const convo = await prisma.whatsAppConversation.create({
        data: {
          connectionId,
          kind: "GROUP",
          customerWaId: sendGroupId,
          providerChatId: sendGroupId,
          customerDisplayName: "Send Group",
          lastInboundAt: new Date(),
        },
      });
      const quoted = await prisma.whatsAppMessage.create({
        data: {
          conversationId: convo.id,
          connectionId,
          direction: "INBOUND",
          messageType: "TEXT",
          textBody: "quote me",
          providerMessageId: "prov-quote-1",
          receivedAt: new Date(),
        },
      });
      const res = await app.inject({
        method: "POST",
        url: `/whatsapp/conversations/${convo.id}/messages`,
        headers: {
          ...auth(adminToken),
          "idempotency-key": randomUUID(),
        },
        payload: { text: "On my way", replyToMessageId: quoted.id },
      });
      assert.equal(res.statusCode, 200);
      assert.equal(fake.lastSend?.toWaId, sendGroupId);
      assert.equal(fake.lastSend?.quotedProviderMessageId, "prov-quote-1");
    });

    test("group context endpoint returns sanitized participants", async () => {
      const contextGroupId = "120363000000000003@g.us";
      await prisma.whatsAppGroupProfile.upsert({
        where: {
          connectionId_providerGroupId: { connectionId, providerGroupId: contextGroupId },
        },
        create: {
          connectionId,
          providerGroupId: contextGroupId,
          groupName: "Context Group",
          participantCount: 1,
          hasIcon: false,
          participants: [{ providerId: "971500000001@s.whatsapp.net", displayName: "Driver" }],
        },
        update: {
          groupName: "Context Group",
          participantCount: 1,
          participants: [{ providerId: "971500000001@s.whatsapp.net", displayName: "Driver" }],
        },
      });
      const convo = await prisma.whatsAppConversation.create({
        data: {
          connectionId,
          kind: "GROUP",
          customerWaId: contextGroupId,
          providerChatId: contextGroupId,
          customerDisplayName: "Context Group",
        },
      });
      const res = await app.inject({
        method: "GET",
        url: `/whatsapp/conversations/${convo.id}/group`,
        headers: auth(adminToken),
      });
      assert.equal(res.statusCode, 200);
      const body = res.json().data;
      assert.equal(body.groupName, "Context Group");
      assert.equal(body.participants.length, 1);
      assert.equal(body.participants[0].displayName, "Driver");
    });
  });
}
