import { test, before, after, describe } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import type { FastifyInstance } from "fastify";
import type { PrismaClient } from "@prisma/client";
import { auth, login, seedPaymentUser } from "../helpers/payment-integration-helpers";
import { encryptWhatsAppCredential } from "src/modules/whatsapp/whatsapp.credentials";
import { setWhatsAppWebhookSecretsForTests } from "src/modules/whatsapp/whatsapp.config";
import { setWhatsAppProviderForTests } from "src/modules/whatsapp/whatsapp.provider";
import { signMetaHubPayload } from "src/modules/whatsapp/whatsapp.webhook-signature";
import { PERMISSIONS } from "src/constants/permissions";
import {
  createFakeWhatsAppProvider,
  TEST_WHATSAPP_TOKEN,
} from "../helpers/fake-whatsapp-provider";
import {
  FIXTURE_DISPLAY_PHONE,
  FIXTURE_PHONE_NUMBER_ID,
  FIXTURE_TEXT,
  FIXTURE_WA_ID,
  FIXTURE_WABA_ID,
  TEST_WEBHOOK_APP_SECRET,
  TEST_WEBHOOK_VERIFY_TOKEN,
  officialStatusPayload,
  officialTextMessagePayload,
} from "../helpers/whatsapp-webhook-fixtures";
import { resetWhatsAppTables } from "../helpers/whatsapp-reset";

const RUN =
  process.env.RUN_INTEGRATION === "true" && Boolean(process.env.TEST_DATABASE_URL);

function reason(body: string): string | undefined {
  try {
    return JSON.parse(body)?.error?.context?.reason as string | undefined;
  } catch {
    return undefined;
  }
}

if (!RUN) {
  test("whatsapp send skipped (set RUN_INTEGRATION=true and TEST_DATABASE_URL)", {
    skip: true,
  });
} else {
  process.env.DATABASE_URL = process.env.TEST_DATABASE_URL!;

  describe("whatsapp manual outbound send", { concurrency: false }, () => {
    let app: FastifyInstance;
    let prisma: PrismaClient;
    const run = Date.now().toString(36).toUpperCase();
    const sender = { email: `wa-send-${run}@example.test`, password: "wa-sender-pass-123" };
    const reader = { email: `wa-read2-${run}@example.test`, password: "wa-reader-pass-123" };
    let senderToken = "";
    let readerToken = "";
    let fake: ReturnType<typeof createFakeWhatsAppProvider>;

    before(async () => {
      const { env } = await import("src/config/env");
      if (!/haidara_test(?:\?|$)/.test(env.DATABASE_URL)) {
        throw new Error("whatsapp send tests require haidara_test");
      }
      fake = createFakeWhatsAppProvider();
      setWhatsAppProviderForTests(fake.provider);
      setWhatsAppWebhookSecretsForTests({
        appSecret: TEST_WEBHOOK_APP_SECRET,
        verifyToken: TEST_WEBHOOK_VERIFY_TOKEN,
      });
      const { buildApp } = await import("src/app");
      app = await buildApp();
      prisma = app.prisma;
      await resetWhatsAppTables(prisma);
      for (const key of [PERMISSIONS.WHATSAPP_READ, PERMISSIONS.WHATSAPP_SEND]) {
        const perm = await prisma.permission.upsert({
          where: { key },
          update: { category: "whatsapp" },
          create: { key, category: "whatsapp", description: key },
        });
        const sys = await prisma.role.findUnique({ where: { key: "system_admin" } });
        if (sys) {
          await prisma.rolePermission.upsert({
            where: { roleId_permissionId: { roleId: sys.id, permissionId: perm.id } },
            update: {},
            create: { roleId: sys.id, permissionId: perm.id },
          });
        }
      }
      await seedPaymentUser(prisma, sender.email, sender.password, `wa_sd_${run}`, [
        PERMISSIONS.WHATSAPP_READ,
        PERMISSIONS.WHATSAPP_SEND,
      ]);
      await seedPaymentUser(prisma, reader.email, reader.password, `wa_rd2_${run}`, [
        PERMISSIONS.WHATSAPP_READ,
      ]);
      senderToken = await login(app, sender);
      readerToken = await login(app, reader);
    });

    after(async () => {
      setWhatsAppProviderForTests(undefined);
      setWhatsAppWebhookSecretsForTests(undefined);
      await app.close();
    });

    async function seedLinked(input?: {
      status?: "LINKED" | "DISCONNECTED" | "REAUTH_REQUIRED" | "ERROR";
      webhookStatus?: "ACTIVE" | "PENDING" | "NOT_CONFIGURED";
    }) {
      return prisma.whatsAppConnection.create({
        data: {
          provider: "META_CLOUD_API",
          status: input?.status ?? "LINKED",
          wabaId: FIXTURE_WABA_ID,
          phoneNumberId: FIXTURE_PHONE_NUMBER_ID,
          displayPhoneNumber: FIXTURE_DISPLAY_PHONE,
          verifiedName: "Test Business",
          credentialCiphertext: encryptWhatsAppCredential(TEST_WHATSAPP_TOKEN),
          connectedAt: new Date(),
          webhookStatus: input?.webhookStatus ?? "ACTIVE",
        },
      });
    }

    async function seedConversation(
      connectionId: string,
      lastInboundAt: Date | null,
      waId = FIXTURE_WA_ID,
    ) {
      return prisma.whatsAppConversation.create({
        data: {
          connectionId,
          customerWaId: waId,
          customerDisplayName: "Send Test Contact",
          lastInboundAt,
          unreadCount: 2,
        },
      });
    }

    function send(conversationId: string, text: string, key: string, token = senderToken) {
      return app.inject({
        method: "POST",
        url: `/whatsapp/conversations/${conversationId}/messages`,
        headers: { ...auth(token), "idempotency-key": key },
        payload: { text },
      });
    }

    test("whatsapp.send appears on /auth/me and read-only cannot send", async () => {
      const me = await app.inject({ method: "GET", url: "/auth/me", headers: auth(senderToken) });
      assert.equal((me.json().data.permissions as string[]).includes(PERMISSIONS.WHATSAPP_SEND), true);
      const readerMe = await app.inject({
        method: "GET",
        url: "/auth/me",
        headers: auth(readerToken),
      });
      assert.equal(
        (readerMe.json().data.permissions as string[]).includes(PERMISSIONS.WHATSAPP_SEND),
        false,
      );
      await resetWhatsAppTables(prisma);
      const connection = await seedLinked();
      const convo = await seedConversation(connection.id, new Date());
      const denied = await send(convo.id, "Hello", randomUUID(), readerToken);
      assert.equal(denied.statusCode, 403);
    });

    test("open window sends once, stores ACCEPTED not SENT, and does not change unread", async () => {
      await resetWhatsAppTables(prisma);
      fake.setSendMessageId("wamid.out.001");
      const connection = await seedLinked();
      const convo = await seedConversation(connection.id, new Date());
      const beforeUnread = convo.unreadCount;
      const beforeCounts = await Promise.all([
        prisma.customer.count(),
        prisma.contract.count(),
        prisma.vehicle.count(),
        prisma.financialLedgerEntry.count(),
      ]);
      const key = randomUUID();
      const res = await send(convo.id, "Office hello", key);
      assert.equal(res.statusCode, 200, res.body);
      const message = res.json().data.message;
      assert.equal(message.direction, "OUTBOUND");
      assert.equal(message.textBody, "Office hello");
      assert.equal(message.sendState, "ACCEPTED");
      assert.equal(message.providerStatus, null);
      assert.equal(fake.sendCount, 1);
      assert.equal(fake.lastSend?.toWaId, FIXTURE_WA_ID);
      assert.equal(fake.lastSend?.accessToken, TEST_WHATSAPP_TOKEN);
      const replay = await send(convo.id, "Office hello", key);
      assert.equal(replay.statusCode, 200, replay.body);
      assert.equal(replay.json().data.message.id, message.id);
      assert.equal(fake.sendCount, 1);
      const row = await prisma.whatsAppConversation.findUniqueOrThrow({ where: { id: convo.id } });
      assert.equal(row.unreadCount, beforeUnread);
      assert.equal(row.lastMessagePreview, "Office hello");
      const afterCounts = await Promise.all([
        prisma.customer.count(),
        prisma.contract.count(),
        prisma.vehicle.count(),
        prisma.financialLedgerEntry.count(),
      ]);
      assert.deepEqual(afterCounts, beforeCounts);
      const blob = res.body;
      assert.equal(blob.includes(TEST_WHATSAPP_TOKEN), false);
      assert.equal(blob.includes("credentialCiphertext"), false);
    });

    test("same key different text or conversation is rejected", async () => {
      await resetWhatsAppTables(prisma);
      const connection = await seedLinked();
      const a = await seedConversation(connection.id, new Date(), "15550000001");
      const b = await seedConversation(connection.id, new Date(), "15550000002");
      const key = randomUUID();
      const first = await send(a.id, "First", key);
      assert.equal(first.statusCode, 200, first.body);
      const differentText = await send(a.id, "Second", key);
      assert.equal(differentText.statusCode, 409);
      assert.equal(reason(differentText.body), "IDEMPOTENCY_KEY_REUSED");
      const differentConvo = await send(b.id, "First", key);
      assert.equal(differentConvo.statusCode, 409);
    });

    test("concurrent identical keys produce one provider call", async () => {
      await resetWhatsAppTables(prisma);
      const connection = await seedLinked();
      const convo = await seedConversation(connection.id, new Date());
      const key = randomUUID();
      const before = fake.sendCount;
      const [a, b] = await Promise.all([
        send(convo.id, "Concurrent", key),
        send(convo.id, "Concurrent", key),
      ]);
      assert.equal(a.statusCode, 200, a.body);
      assert.equal(b.statusCode, 200, b.body);
      assert.equal(a.json().data.message.id, b.json().data.message.id);
      assert.equal(fake.sendCount, before + 1);
    });

    test("closed window and missing lastInboundAt reject before provider call", async () => {
      await resetWhatsAppTables(prisma);
      const connection = await seedLinked();
      const closed = await seedConversation(
        connection.id,
        new Date(Date.now() - 25 * 60 * 60 * 1000),
      );
      const before = fake.sendCount;
      const closedRes = await send(closed.id, "Too late", randomUUID());
      assert.equal(closedRes.statusCode, 409);
      assert.equal(reason(closedRes.body), "WHATSAPP_CUSTOMER_SERVICE_WINDOW_CLOSED");
      const unknown = await seedConversation(connection.id, null, "15550000999");
      const unknownRes = await send(unknown.id, "No window", randomUUID());
      assert.equal(unknownRes.statusCode, 409);
      assert.equal(reason(unknownRes.body), "WHATSAPP_CUSTOMER_SERVICE_WINDOW_UNKNOWN");
      assert.equal(fake.sendCount, before);
    });

    test("webhook inactive, reauth, and old connection cannot send", async () => {
      await resetWhatsAppTables(prisma);
      const inactiveHook = await seedLinked({ webhookStatus: "PENDING" });
      const convo = await seedConversation(inactiveHook.id, new Date());
      const hookRes = await send(convo.id, "No hook", randomUUID());
      assert.equal(reason(hookRes.body), "WHATSAPP_WEBHOOK_NOT_ACTIVE");

      await resetWhatsAppTables(prisma);
      const reauth = await seedLinked({ status: "REAUTH_REQUIRED" });
      const reauthConvo = await seedConversation(reauth.id, new Date());
      const reauthRes = await send(reauthConvo.id, "Reauth", randomUUID());
      assert.equal(reason(reauthRes.body), "WHATSAPP_CONVERSATION_CONNECTION_INACTIVE");

      await resetWhatsAppTables(prisma);
      const retired = await seedLinked({ status: "DISCONNECTED" });
      const oldConvo = await seedConversation(retired.id, new Date());
      await seedLinked();
      const oldRes = await send(oldConvo.id, "Old line", randomUUID());
      assert.equal(reason(oldRes.body), "WHATSAPP_CONVERSATION_CONNECTION_INACTIVE");
    });

    test("provider rejection stays FAILED and unknown is not retried", async () => {
      await resetWhatsAppTables(prisma);
      const connection = await seedLinked();
      const convo = await seedConversation(connection.id, new Date());
      fake.setSendFailure({ ok: false, code: "SEND_REJECTED", providerErrorCode: "graph:131026" });
      const failed = await send(convo.id, "Reject me", randomUUID());
      assert.equal(failed.statusCode, 200, failed.body);
      assert.equal(failed.json().data.message.sendState, "FAILED");
      assert.equal(failed.body.includes("error"), false);
      fake.setSendFailure(undefined);
      fake.setSendUnknown(true);
      const unknown = await send(convo.id, "Maybe", randomUUID());
      assert.equal(unknown.json().data.message.sendState, "UNKNOWN");
      const key = randomUUID();
      fake.setSendUnknown(true);
      const firstUnknown = await send(convo.id, "Hold", key);
      const again = await send(convo.id, "Hold", key);
      assert.equal(firstUnknown.json().data.message.id, again.json().data.message.id);
      fake.setSendUnknown(false);
    });

    test("status webhooks update outbound monotonically and ignore inbound", async () => {
      await resetWhatsAppTables(prisma);
      fake.setSendMessageId("wamid.out.status");
      setWhatsAppWebhookSecretsForTests({
        appSecret: TEST_WEBHOOK_APP_SECRET,
        verifyToken: TEST_WEBHOOK_VERIFY_TOKEN,
      });
      const connection = await seedLinked();
      const convo = await seedConversation(connection.id, new Date());
      const sent = await send(convo.id, "Track me", randomUUID());
      assert.equal(sent.json().data.message.sendState, "ACCEPTED");
      const inbound = await prisma.whatsAppMessage.create({
        data: {
          conversationId: convo.id,
          connectionId: connection.id,
          direction: "INBOUND",
          messageType: "TEXT",
          textBody: FIXTURE_TEXT,
          receivedAt: new Date(),
          providerMessageId: "wamid.inbound.keep",
        },
      });

      async function status(value: string, wamid = "wamid.out.status") {
        const payload = officialStatusPayload({ wamid, status: value });
        const raw = Buffer.from(JSON.stringify(payload), "utf8");
        return app.inject({
          method: "POST",
          url: "/whatsapp/webhooks/meta",
          headers: {
            "content-type": "application/json",
            "x-hub-signature-256": signMetaHubPayload(raw, TEST_WEBHOOK_APP_SECRET),
          },
          payload: raw,
        });
      }

      assert.equal((await status("sent")).statusCode, 200);
      assert.equal((await status("delivered")).statusCode, 200);
      assert.equal((await status("read")).statusCode, 200);
      assert.equal((await status("delivered")).statusCode, 200);
      const outbound = await prisma.whatsAppMessage.findUniqueOrThrow({
        where: { id: sent.json().data.message.id },
      });
      assert.equal(outbound.providerStatus, "READ");
      const inboundAfter = await prisma.whatsAppMessage.findUniqueOrThrow({
        where: { id: inbound.id },
      });
      assert.equal(inboundAfter.providerStatus, null);
    });

    test("status arriving before providerMessageId is reconciled later", async () => {
      await resetWhatsAppTables(prisma);
      const wamid = "wamid.out.early";
      fake.setSendMessageId(wamid);
      const connection = await seedLinked();
      await seedConversation(connection.id, new Date());
      const payload = officialStatusPayload({ wamid, status: "delivered" });
      const raw = Buffer.from(JSON.stringify(payload), "utf8");
      const hook = await app.inject({
        method: "POST",
        url: "/whatsapp/webhooks/meta",
        headers: {
          "content-type": "application/json",
          "x-hub-signature-256": signMetaHubPayload(raw, TEST_WEBHOOK_APP_SECRET),
        },
        payload: raw,
      });
      assert.equal(hook.statusCode, 200);
      const convo = await prisma.whatsAppConversation.findFirstOrThrow();
      const sent = await send(convo.id, "Early status", randomUUID());
      assert.equal(sent.statusCode, 200, sent.body);
      const row = await prisma.whatsAppMessage.findUniqueOrThrow({
        where: { id: sent.json().data.message.id },
      });
      assert.equal(row.providerMessageId, wamid);
      assert.equal(row.providerStatus, "DELIVERED");
      assert.equal(row.sendState, "ACCEPTED");
    });

    test("inbound without timestamp does not open the window; a dated inbound does", async () => {
      await resetWhatsAppTables(prisma);
      const connection = await seedLinked();
      const undated = officialTextMessagePayload({
        wamid: "wamid.undated",
        timestamp: "",
      });
      const raw = Buffer.from(JSON.stringify(undated), "utf8");
      await app.inject({
        method: "POST",
        url: "/whatsapp/webhooks/meta",
        headers: {
          "content-type": "application/json",
          "x-hub-signature-256": signMetaHubPayload(raw, TEST_WEBHOOK_APP_SECRET),
        },
        payload: raw,
      });
      const convo = await prisma.whatsAppConversation.findFirstOrThrow();
      assert.equal(convo.lastInboundAt, null);
      const blocked = await send(convo.id, "Still closed", randomUUID());
      assert.equal(reason(blocked.body), "WHATSAPP_CUSTOMER_SERVICE_WINDOW_UNKNOWN");
      const dated = officialTextMessagePayload({
        wamid: "wamid.dated",
        timestamp: String(Math.floor(Date.now() / 1000)),
      });
      const datedRaw = Buffer.from(JSON.stringify(dated), "utf8");
      await app.inject({
        method: "POST",
        url: "/whatsapp/webhooks/meta",
        headers: {
          "content-type": "application/json",
          "x-hub-signature-256": signMetaHubPayload(datedRaw, TEST_WEBHOOK_APP_SECRET),
        },
        payload: datedRaw,
      });
      const reopened = await prisma.whatsAppConversation.findFirstOrThrow();
      assert.ok(reopened.lastInboundAt);
    });

    test("audit and INFO-safe logs omit message text and tokens", async () => {
      await resetWhatsAppTables(prisma);
      const connection = await seedLinked();
      const convo = await seedConversation(connection.id, new Date());
      const unique = `office-unique-${run}`;
      await send(convo.id, unique, randomUUID());
      const logs = await prisma.auditLog.findMany({
        where: { action: { startsWith: "WHATSAPP_MESSAGE_SEND" } },
      });
      assert.ok(logs.length > 0);
      for (const log of logs) {
        const blob = JSON.stringify(log);
        assert.equal(blob.includes(unique), false);
        assert.equal(blob.includes(TEST_WHATSAPP_TOKEN), false);
      }
    });

    test("missing conversation is 404 and extra recipient fields are rejected", async () => {
      const missing = await send(randomUUID(), "Hello", randomUUID());
      assert.equal(missing.statusCode, 404);
      await resetWhatsAppTables(prisma);
      const connection = await seedLinked();
      const convo = await seedConversation(connection.id, new Date());
      const extra = await app.inject({
        method: "POST",
        url: `/whatsapp/conversations/${convo.id}/messages`,
        headers: { ...auth(senderToken), "idempotency-key": randomUUID() },
        payload: { text: "Hello", to: "15558889999" },
      });
      assert.equal(extra.statusCode, 422);
    });
  });
}
