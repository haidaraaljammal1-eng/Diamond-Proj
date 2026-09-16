import { test, before, after, describe } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import type { FastifyInstance } from "fastify";
import type { PrismaClient } from "@prisma/client";
import { auth, login, seedPaymentUser } from "../helpers/payment-integration-helpers";
import { encryptWhatsAppCredential } from "src/modules/whatsapp/whatsapp.credentials";
import { setWhatsAppWebhookSecretsForTests } from "src/modules/whatsapp/whatsapp.config";
import { setWhatsAppInboundFailureForTests } from "src/modules/whatsapp/whatsapp.inbound.service";
import { signMetaHubPayload } from "src/modules/whatsapp/whatsapp.webhook-signature";
import { PERMISSIONS } from "src/constants/permissions";
import {
  FIXTURE_DISPLAY_PHONE,
  FIXTURE_PHONE_NUMBER_ID,
  FIXTURE_PROFILE_NAME,
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

const OTHER_WABA = "199999999999999999";
const OTHER_PHONE = "1000000000000001";
const OTHER_WA = "15553334444";

function assertNoSecrets(payload: unknown, label: string) {
  const text = typeof payload === "string" ? payload : JSON.stringify(payload);
  assert.equal(text.includes(TEST_WEBHOOK_APP_SECRET), false, `${label} leaked app secret`);
  assert.equal(text.includes(TEST_WEBHOOK_VERIFY_TOKEN), false, `${label} leaked verify token`);
  assert.equal(text.includes("test-wa-access-token-DO-NOT-LEAK"), false, `${label} leaked access token`);
  assert.equal(text.includes("enc:v1:"), false, `${label} leaked ciphertext`);
  assert.equal(text.includes("META_APP_SECRET"), false, `${label} leaked META_APP_SECRET`);
  assert.equal(text.includes("credentialCiphertext"), false, `${label} leaked ciphertext field`);
}

if (!RUN) {
  test("whatsapp conversation skipped (set RUN_INTEGRATION=true and TEST_DATABASE_URL)", {
    skip: true,
  });
} else {
  process.env.DATABASE_URL = process.env.TEST_DATABASE_URL!;

  describe("whatsapp conversation and message domain", { concurrency: false }, () => {
    let app: FastifyInstance;
    let prisma: PrismaClient;
    const run = Date.now().toString(36).toUpperCase();
    const reader = { email: `wa-read-${run}@example.test`, password: "wa-reader-pass-123" };
    const stranger = { email: `wa-noread-${run}@example.test`, password: "wa-stranger-pass-123" };
    let readerToken = "";
    let strangerToken = "";

    before(async () => {
      const { env } = await import("src/config/env");
      if (!/haidara_test(?:\?|$)/.test(env.DATABASE_URL)) {
        throw new Error("whatsapp conversation tests require haidara_test");
      }
      setWhatsAppWebhookSecretsForTests({
        appSecret: TEST_WEBHOOK_APP_SECRET,
        verifyToken: TEST_WEBHOOK_VERIFY_TOKEN,
      });
      const { buildApp } = await import("src/app");
      app = await buildApp();
      prisma = app.prisma;
      await resetWhatsAppTables(prisma);
      const readPerm = await prisma.permission.upsert({
        where: { key: PERMISSIONS.WHATSAPP_READ },
        update: {
          category: "whatsapp",
          description: "View WhatsApp conversations and messages, and mark conversations read internally",
        },
        create: {
          key: PERMISSIONS.WHATSAPP_READ,
          category: "whatsapp",
          description: "View WhatsApp conversations and messages, and mark conversations read internally",
        },
      });
      const sys = await prisma.role.findUnique({ where: { key: "system_admin" } });
      if (sys) {
        await prisma.rolePermission.upsert({
          where: { roleId_permissionId: { roleId: sys.id, permissionId: readPerm.id } },
          update: {},
          create: { roleId: sys.id, permissionId: readPerm.id },
        });
      }
      await seedPaymentUser(prisma, reader.email, reader.password, `wa_rd_${run}`, [
        PERMISSIONS.WHATSAPP_READ,
      ]);
      await seedPaymentUser(prisma, stranger.email, stranger.password, `wa_nr_${run}`, [
        "vehicles.read",
      ]);
      readerToken = await login(app, reader);
      strangerToken = await login(app, stranger);
    });

    after(async () => {
      setWhatsAppInboundFailureForTests(undefined);
      setWhatsAppWebhookSecretsForTests(undefined);
      await app.close();
    });

    async function seedConnection(input?: {
      wabaId?: string;
      phoneNumberId?: string;
      status?: "LINKED" | "DISCONNECTED";
    }) {
      return prisma.whatsAppConnection.create({
        data: {
          provider: "META_CLOUD_API",
          status: input?.status ?? "LINKED",
          wabaId: input?.wabaId ?? FIXTURE_WABA_ID,
          phoneNumberId: input?.phoneNumberId ?? FIXTURE_PHONE_NUMBER_ID,
          displayPhoneNumber: FIXTURE_DISPLAY_PHONE,
          verifiedName: "Test Business",
          credentialCiphertext: encryptWhatsAppCredential("test-wa-access-token-DO-NOT-LEAK"),
          connectedAt: new Date(),
          webhookStatus: "PENDING",
          ...(input?.status === "DISCONNECTED" ? { disconnectedAt: new Date() } : {}),
        },
      });
    }

    async function postWebhook(payload: unknown) {
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

    async function domainCounts() {
      const [customers, contracts, vehicles, ledger] = await Promise.all([
        prisma.customer.count(),
        prisma.contract.count(),
        prisma.vehicle.count(),
        prisma.financialLedgerEntry.count(),
      ]);
      return { customers, contracts, vehicles, ledger };
    }

    test("whatsapp.read appears on /auth/me and is required", async () => {
      const me = await app.inject({
        method: "GET",
        url: "/auth/me",
        headers: auth(readerToken),
      });
      assert.equal(me.statusCode, 200, me.body);
      const permissions = me.json().data.permissions as string[];
      assert.equal(permissions.includes(PERMISSIONS.WHATSAPP_READ), true);

      const denied = await app.inject({
        method: "GET",
        url: "/whatsapp/conversations",
        headers: auth(strangerToken),
      });
      assert.equal(denied.statusCode, 403);

      const unauth = await app.inject({ method: "GET", url: "/whatsapp/conversations" });
      assert.equal(unauth.statusCode, 401);

      const connection = await app.inject({
        method: "GET",
        url: "/whatsapp/connection",
        headers: auth(readerToken),
      });
      assert.equal(connection.statusCode, 200, connection.body);
      assert.equal("credentialCiphertext" in (connection.json().data ?? {}), false);
    });

    test("first inbound message creates a conversation and unreadCount 1", async () => {
      await resetWhatsAppTables(prisma);
      const connection = await seedConnection();
      const before = await domainCounts();
      const res = await postWebhook(officialTextMessagePayload());
      assert.equal(res.statusCode, 200, res.body);

      const conversations = await prisma.whatsAppConversation.findMany();
      assert.equal(conversations.length, 1);
      assert.equal(conversations[0]!.connectionId, connection.id);
      assert.equal(conversations[0]!.customerWaId, FIXTURE_WA_ID);
      assert.equal(conversations[0]!.customerDisplayName, FIXTURE_PROFILE_NAME);
      assert.equal(conversations[0]!.unreadCount, 1);
      assert.equal(conversations[0]!.lastMessagePreview, FIXTURE_TEXT);

      const messages = await prisma.whatsAppMessage.findMany();
      assert.equal(messages.length, 1);
      assert.equal(messages[0]!.direction, "INBOUND");
      assert.equal(messages[0]!.messageType, "TEXT");
      assert.equal(messages[0]!.textBody, FIXTURE_TEXT);
      assert.equal(messages[0]!.providerStatus, null);
      assert.equal("payload" in messages[0]!, false);

      const event = await prisma.whatsAppWebhookEvent.findFirst({
        where: { eventType: "MESSAGE_RECEIVED" },
      });
      assert.equal(event!.status, "PROCESSED");
      assert.equal(messages[0]!.webhookEventId, event!.id);

      const after = await domainCounts();
      assert.equal(after.customers, before.customers);
      assert.equal(after.contracts, before.contracts);
      assert.equal(after.vehicles, before.vehicles);
      assert.equal(after.ledger, before.ledger);
    });

    test("second message same customer reuses the conversation and increments unread", async () => {
      await resetWhatsAppTables(prisma);
      await seedConnection();
      await postWebhook(officialTextMessagePayload({ wamid: "wamid.test.synthetic.a" }));
      await postWebhook(
        officialTextMessagePayload({
          wamid: "wamid.test.synthetic.b",
          text: "Second unique inbound",
          timestamp: "1757458513",
        }),
      );
      const conversations = await prisma.whatsAppConversation.findMany();
      assert.equal(conversations.length, 1);
      assert.equal(conversations[0]!.unreadCount, 2);
      assert.equal(conversations[0]!.lastMessagePreview, "Second unique inbound");
      assert.equal(await prisma.whatsAppMessage.count(), 2);
    });

    test("same wa_id on a different connection creates a different conversation", async () => {
      await resetWhatsAppTables(prisma);
      const a = await seedConnection();
      await postWebhook(officialTextMessagePayload({ wamid: "wamid.test.synthetic.c1" }));
      await prisma.whatsAppConnection.update({
        where: { id: a.id },
        data: { status: "DISCONNECTED", webhookStatus: "NOT_CONFIGURED", disconnectedAt: new Date() },
      });
      const b = await seedConnection({ wabaId: OTHER_WABA, phoneNumberId: OTHER_PHONE });
      await postWebhook(
        officialTextMessagePayload({
          wabaId: OTHER_WABA,
          phoneNumberId: OTHER_PHONE,
          wamid: "wamid.test.synthetic.c2",
        }),
      );
      const rows = await prisma.whatsAppConversation.findMany({ orderBy: { createdAt: "asc" } });
      assert.equal(rows.length, 2);
      assert.equal(rows[0]!.connectionId, a.id);
      assert.equal(rows[1]!.connectionId, b.id);
      assert.equal(rows[0]!.customerWaId, rows[1]!.customerWaId);
    });

    test("duplicate wamid does not duplicate message or unread", async () => {
      await resetWhatsAppTables(prisma);
      await seedConnection();
      const payload = officialTextMessagePayload({ wamid: "wamid.test.synthetic.dup" });
      assert.equal((await postWebhook(payload)).statusCode, 200);
      assert.equal((await postWebhook(payload)).statusCode, 200);
      assert.equal(await prisma.whatsAppMessage.count(), 1);
      assert.equal((await prisma.whatsAppConversation.findFirst())!.unreadCount, 1);
    });

    test("concurrent duplicate ingest creates one message", async () => {
      await resetWhatsAppTables(prisma);
      await seedConnection();
      const payload = officialTextMessagePayload({ wamid: "wamid.test.synthetic.race" });
      const results = await Promise.all([postWebhook(payload), postWebhook(payload), postWebhook(payload)]);
      assert.equal(results.every((r) => r.statusCode === 200), true);
      assert.equal(await prisma.whatsAppMessage.count(), 1);
      assert.equal((await prisma.whatsAppConversation.findFirst())!.unreadCount, 1);
    });

    test("mark-read zeros unread and duplicate old webhook does not raise it", async () => {
      await resetWhatsAppTables(prisma);
      await seedConnection();
      await postWebhook(officialTextMessagePayload({ wamid: "wamid.test.synthetic.read1" }));
      const convo = await prisma.whatsAppConversation.findFirstOrThrow();
      const marked = await app.inject({
        method: "POST",
        url: `/whatsapp/conversations/${convo.id}/read`,
        headers: auth(readerToken),
      });
      assert.equal(marked.statusCode, 200, marked.body);
      assert.equal(marked.json().data.unreadCount, 0);
      assertNoSecrets(marked.body, "mark-read");

      await postWebhook(officialTextMessagePayload({ wamid: "wamid.test.synthetic.read1" }));
      const afterDup = await prisma.whatsAppConversation.findUniqueOrThrow({ where: { id: convo.id } });
      assert.equal(afterDup.unreadCount, 0);

      await postWebhook(
        officialTextMessagePayload({ wamid: "wamid.test.synthetic.read2", text: "After read" }),
      );
      const afterNew = await prisma.whatsAppConversation.findUniqueOrThrow({ where: { id: convo.id } });
      assert.equal(afterNew.unreadCount, 1);
    });

    test("empty display name does not erase a useful name", async () => {
      await resetWhatsAppTables(prisma);
      await seedConnection();
      await postWebhook(officialTextMessagePayload({ wamid: "wamid.test.synthetic.name1" }));
      await postWebhook(
        officialTextMessagePayload({
          wamid: "wamid.test.synthetic.name2",
          profileName: null,
        }),
      );
      const convo = await prisma.whatsAppConversation.findFirstOrThrow();
      assert.equal(convo.customerDisplayName, FIXTURE_PROFILE_NAME);
    });

    test("older late message is stored but does not replace lastMessage", async () => {
      await resetWhatsAppTables(prisma);
      await seedConnection();
      await postWebhook(
        officialTextMessagePayload({
          wamid: "wamid.test.synthetic.new",
          timestamp: "1757458600",
          text: "Newer message",
        }),
      );
      await postWebhook(
        officialTextMessagePayload({
          wamid: "wamid.test.synthetic.old",
          timestamp: "1757458500",
          text: "Older late message",
        }),
      );
      const convo = await prisma.whatsAppConversation.findFirstOrThrow();
      assert.equal(convo.lastMessagePreview, "Newer message");
      assert.equal(convo.lastMessageAt?.toISOString(), new Date(1757458600 * 1000).toISOString());
      assert.equal(convo.lastInboundAt?.toISOString(), new Date(1757458600 * 1000).toISOString());
      assert.equal(await prisma.whatsAppMessage.count(), 2);
      const older = await prisma.whatsAppMessage.findFirst({
        where: { providerMessageId: "wamid.test.synthetic.old" },
      });
      assert.ok(older);
      assert.equal(older!.textBody, "Older late message");
    });

    test("non-text message is stored without media download or crash", async () => {
      await resetWhatsAppTables(prisma);
      await seedConnection();
      const res = await postWebhook(
        officialTextMessagePayload({ wamid: "wamid.test.synthetic.img", type: "image" }),
      );
      assert.equal(res.statusCode, 200);
      const message = await prisma.whatsAppMessage.findFirstOrThrow();
      assert.equal(message.messageType, "IMAGE");
      assert.equal(message.textBody, null);
      assert.equal(message.providerMediaId, "media-test-synthetic-id");
      const convo = await prisma.whatsAppConversation.findFirstOrThrow();
      assert.equal(convo.lastMessagePreview, null);
      assert.equal(convo.lastMessageType, "IMAGE");
    });

    test("message text is absent from AuditLog and APIs do not expose raw webhook payload", async () => {
      await resetWhatsAppTables(prisma);
      await seedConnection();
      await postWebhook(officialTextMessagePayload({ wamid: "wamid.test.synthetic.audit" }));
      const convo = await prisma.whatsAppConversation.findFirstOrThrow();
      await app.inject({
        method: "POST",
        url: `/whatsapp/conversations/${convo.id}/read`,
        headers: auth(readerToken),
      });
      const logs = await prisma.auditLog.findMany({
        where: { createdAt: { gte: new Date(Date.now() - 30_000) } },
        take: 80,
      });
      for (const row of logs) {
        const blob = JSON.stringify({
          action: row.action,
          metadata: row.metadata,
          before: row.before,
          after: row.after,
        });
        assert.equal(blob.includes(FIXTURE_TEXT), false, `audit leaked message: ${row.action}`);
      }

      const listed = await app.inject({
        method: "GET",
        url: "/whatsapp/conversations",
        headers: auth(readerToken),
      });
      assert.equal(listed.statusCode, 200, listed.body);
      assertNoSecrets(listed.body, "list");
      assert.equal(JSON.stringify(listed.json()).includes("whatsapp_business_account"), false);

      const detail = await app.inject({
        method: "GET",
        url: `/whatsapp/conversations/${convo.id}`,
        headers: auth(readerToken),
      });
      assert.equal(detail.statusCode, 200);
      assertNoSecrets(detail.body, "detail");

      const messages = await app.inject({
        method: "GET",
        url: `/whatsapp/conversations/${convo.id}/messages`,
        headers: auth(readerToken),
      });
      assert.equal(messages.statusCode, 200);
      assertNoSecrets(messages.body, "messages");
      assert.equal("payload" in (messages.json().data[0] ?? {}), false);
    });

    test("search, unread filter, and deterministic message pagination", async () => {
      await resetWhatsAppTables(prisma);
      await seedConnection();
      await postWebhook(
        officialTextMessagePayload({
          wamid: "wamid.test.synthetic.p1",
          timestamp: "1757458510",
          text: "First",
        }),
      );
      await postWebhook(
        officialTextMessagePayload({
          wamid: "wamid.test.synthetic.p2",
          timestamp: "1757458511",
          text: "Second",
          waId: OTHER_WA,
          profileName: "Other Person",
        }),
      );
      await postWebhook(
        officialTextMessagePayload({
          wamid: "wamid.test.synthetic.p3",
          timestamp: "1757458512",
          text: "Third",
        }),
      );

      const byWa = await app.inject({
        method: "GET",
        url: `/whatsapp/conversations?search=${FIXTURE_WA_ID}`,
        headers: auth(readerToken),
      });
      assert.equal(byWa.statusCode, 200);
      assert.equal(byWa.json().data.length, 1);
      assert.equal(byWa.json().data[0].customerWaId, FIXTURE_WA_ID);

      const byName = await app.inject({
        method: "GET",
        url: "/whatsapp/conversations?search=Other%20Person",
        headers: auth(readerToken),
      });
      assert.equal(byName.json().data.length, 1);
      assert.equal(byName.json().data[0].customerDisplayName, "Other Person");

      const unread = await app.inject({
        method: "GET",
        url: "/whatsapp/conversations?unread=true",
        headers: auth(readerToken),
      });
      assert.equal(unread.json().data.length, 2);

      const fixtureConvo = byWa.json().data[0];
      await app.inject({
        method: "POST",
        url: `/whatsapp/conversations/${fixtureConvo.id}/read`,
        headers: auth(readerToken),
      });
      const unreadAfter = await app.inject({
        method: "GET",
        url: "/whatsapp/conversations?unread=true",
        headers: auth(readerToken),
      });
      assert.equal(unreadAfter.json().data.length, 1);

      const page1 = await app.inject({
        method: "GET",
        url: `/whatsapp/conversations/${fixtureConvo.id}/messages?page=1&pageSize=1`,
        headers: auth(readerToken),
      });
      assert.equal(page1.json().data.length, 1);
      assert.equal(page1.json().data[0].textBody, "Third");
      assert.equal(page1.json().meta.total, 2);
      const page2 = await app.inject({
        method: "GET",
        url: `/whatsapp/conversations/${fixtureConvo.id}/messages?page=2&pageSize=1`,
        headers: auth(readerToken),
      });
      assert.equal(page2.json().data[0].textBody, "First");
    });

    test("unknown conversation id is a safe 404", async () => {
      const res = await app.inject({
        method: "GET",
        url: `/whatsapp/conversations/${randomUUID()}`,
        headers: auth(readerToken),
      });
      assert.equal(res.statusCode, 404);
      assertNoSecrets(res.body, "missing-convo");
    });

    test("status events do not invent outbound messages", async () => {
      await resetWhatsAppTables(prisma);
      await seedConnection();
      const res = await postWebhook(officialStatusPayload());
      assert.equal(res.statusCode, 200);
      assert.equal(await prisma.whatsAppMessage.count(), 0);
      assert.equal(await prisma.whatsAppConversation.count(), 0);
    });

    test("disconnected connection history stays readable and is not reused", async () => {
      await resetWhatsAppTables(prisma);
      const a = await seedConnection();
      await postWebhook(officialTextMessagePayload({ wamid: "wamid.test.synthetic.hist" }));
      const historical = await prisma.whatsAppConversation.findFirstOrThrow();
      await prisma.whatsAppConnection.update({
        where: { id: a.id },
        data: { status: "DISCONNECTED", webhookStatus: "NOT_CONFIGURED", disconnectedAt: new Date() },
      });
      const b = await seedConnection({ wabaId: OTHER_WABA, phoneNumberId: OTHER_PHONE });
      await postWebhook(
        officialTextMessagePayload({
          wamid: "wamid.test.synthetic.retired-retry",
        }),
      );
      assert.equal(await prisma.whatsAppConversation.count(), 1);
      const detail = await app.inject({
        method: "GET",
        url: `/whatsapp/conversations/${historical.id}`,
        headers: auth(readerToken),
      });
      assert.equal(detail.statusCode, 200);
      assert.equal(detail.json().data.id, historical.id);

      await postWebhook(
        officialTextMessagePayload({
          wabaId: OTHER_WABA,
          phoneNumberId: OTHER_PHONE,
          wamid: "wamid.test.synthetic.b-new",
        }),
      );
      const all = await prisma.whatsAppConversation.findMany();
      assert.equal(all.length, 2);
      assert.ok(all.some((c) => c.connectionId === a.id));
      assert.ok(all.some((c) => c.connectionId === b.id));
    });

    test("failed materialization is not marked PROCESSED and retry is idempotent", async () => {
      await resetWhatsAppTables(prisma);
      await seedConnection();
      setWhatsAppInboundFailureForTests(new Error("forced inbound failure"));
      const payload = officialTextMessagePayload({ wamid: "wamid.test.synthetic.fail" });
      const failed = await postWebhook(payload);
      assert.equal(failed.statusCode, 500);
      const event = await prisma.whatsAppWebhookEvent.findFirstOrThrow({
        where: { providerEventKey: "wamid:wamid.test.synthetic.fail" },
      });
      assert.equal(event.status, "FAILED");
      assert.equal(await prisma.whatsAppMessage.count(), 0);
      setWhatsAppInboundFailureForTests(undefined);
      const retried = await postWebhook(payload);
      assert.equal(retried.statusCode, 200);
      const processed = await prisma.whatsAppWebhookEvent.findUniqueOrThrow({
        where: { id: event.id },
      });
      assert.equal(processed.status, "PROCESSED");
      assert.equal(await prisma.whatsAppMessage.count(), 1);
      assert.equal((await prisma.whatsAppConversation.findFirst())!.unreadCount, 1);
    });

    test("malformed timestamp still materializes without substituting provider time", async () => {
      await resetWhatsAppTables(prisma);
      await seedConnection();
      const res = await postWebhook(
        officialTextMessagePayload({
          wamid: "wamid.test.synthetic.badts",
          timestamp: "not-a-unix",
        }),
      );
      assert.equal(res.statusCode, 200);
      const message = await prisma.whatsAppMessage.findFirstOrThrow();
      assert.equal(message.providerOccurredAt, null);
      assert.ok(message.receivedAt);
      const event = await prisma.whatsAppWebhookEvent.findFirstOrThrow({
        where: { providerMessageId: "wamid.test.synthetic.badts" },
      });
      assert.equal(event.status, "PROCESSED");
    });
  });
}
