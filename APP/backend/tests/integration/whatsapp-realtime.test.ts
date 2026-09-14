import { test, before, after, describe } from "node:test";
import assert from "node:assert/strict";
import type { FastifyInstance } from "fastify";
import type { PrismaClient } from "@prisma/client";
import { auth, login, seedPaymentUser } from "../helpers/payment-integration-helpers";
import { encryptWhatsAppCredential } from "src/modules/whatsapp/whatsapp.credentials";
import { setWhatsAppWebhookSecretsForTests } from "src/modules/whatsapp/whatsapp.config";
import {
  setWhatsAppInboundCommitFailureForTests,
  setWhatsAppInboundFailureForTests,
} from "src/modules/whatsapp/whatsapp.inbound.service";
import { signMetaHubPayload } from "src/modules/whatsapp/whatsapp.webhook-signature";
import { PERMISSIONS } from "src/constants/permissions";
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
import { getWhatsAppRealtimePublisher } from "src/modules/whatsapp/whatsapp.realtime-publisher";
import type { WhatsAppRealtimeEvent } from "src/modules/whatsapp/whatsapp.realtime";

const RUN =
  process.env.RUN_INTEGRATION === "true" && Boolean(process.env.TEST_DATABASE_URL);

function assertSafePayload(value: unknown, label: string) {
  const text = typeof value === "string" ? value : JSON.stringify(value);
  assert.equal(text.includes(TEST_WEBHOOK_APP_SECRET), false, `${label} leaked app secret`);
  assert.equal(text.includes(TEST_WEBHOOK_VERIFY_TOKEN), false, `${label} leaked verify token`);
  assert.equal(text.includes("test-wa-access-token-DO-NOT-LEAK"), false, `${label} leaked access token`);
  assert.equal(text.includes("enc:v1:"), false, `${label} leaked ciphertext`);
  assert.equal(text.includes("credentialCiphertext"), false, `${label} leaked ciphertext field`);
  assert.equal(text.includes(FIXTURE_TEXT), false, `${label} leaked customer text`);
  assert.equal(text.includes("textBody"), false, `${label} leaked textBody`);
  assert.equal(text.includes("entry"), false, `${label} leaked raw webhook`);
}

if (!RUN) {
  test("whatsapp realtime skipped (set RUN_INTEGRATION=true and TEST_DATABASE_URL)", {
    skip: true,
  });
} else {
  process.env.DATABASE_URL = process.env.TEST_DATABASE_URL!;

  describe("whatsapp realtime SSE", { concurrency: false }, () => {
    let app: FastifyInstance;
    let prisma: PrismaClient;
    let baseUrl = "";
    const run = Date.now().toString(36).toUpperCase();
    const reader = { email: `wa-rt-${run}@example.test`, password: "wa-rt-reader-pass-123" };
    const stranger = { email: `wa-rt-no-${run}@example.test`, password: "wa-rt-stranger-pass-123" };
    let readerToken = "";
    let strangerToken = "";

    before(async () => {
      const { env } = await import("src/config/env");
      if (!/haidara_test(?:\?|$)/.test(env.DATABASE_URL)) {
        throw new Error("whatsapp realtime tests require haidara_test");
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
      await seedPaymentUser(prisma, reader.email, reader.password, `wa_rt_${run}`, [
        PERMISSIONS.WHATSAPP_READ,
      ]);
      await seedPaymentUser(prisma, stranger.email, stranger.password, `wa_rt_n_${run}`, [
        "vehicles.read",
      ]);
      readerToken = await login(app, reader);
      strangerToken = await login(app, stranger);
      await app.listen({ port: 0, host: "127.0.0.1" });
      const address = app.server.address();
      const port = typeof address === "object" && address ? address.port : 0;
      baseUrl = `http://127.0.0.1:${port}`;
    });

    after(async () => {
      setWhatsAppInboundFailureForTests(undefined);
      setWhatsAppInboundCommitFailureForTests(undefined);
      setWhatsAppWebhookSecretsForTests(undefined);
      getWhatsAppRealtimePublisher().resetForTests();
      await app.close();
    });

    async function seedLinked() {
      return prisma.whatsAppConnection.create({
        data: {
          provider: "META_CLOUD_API",
          status: "LINKED",
          wabaId: FIXTURE_WABA_ID,
          phoneNumberId: FIXTURE_PHONE_NUMBER_ID,
          displayPhoneNumber: FIXTURE_DISPLAY_PHONE,
          verifiedName: "Test Business",
          credentialCiphertext: encryptWhatsAppCredential("test-wa-access-token-DO-NOT-LEAK"),
          connectedAt: new Date(),
          webhookStatus: "PENDING",
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

    async function whatsappOutbox() {
      return prisma.domainOutboxEvent.findMany({
        where: { eventType: { startsWith: "whatsapp." } },
        orderBy: { id: "asc" },
      });
    }

    test("unauthenticated SSE is 401 and token is not required in the URL", async () => {
      const unauth = await app.inject({ method: "GET", url: "/whatsapp/realtime" });
      assert.equal(unauth.statusCode, 401);
      const denied = await app.inject({
        method: "GET",
        url: "/whatsapp/realtime",
        headers: auth(strangerToken),
      });
      assert.equal(denied.statusCode, 403);
      const withQuery = await app.inject({
        method: "GET",
        url: `/whatsapp/realtime?token=${readerToken}`,
      });
      assert.equal(withQuery.statusCode, 401);
    });

    test("authorized SSE is event-stream with cache headers, heartbeat, and disconnect cleanup", async () => {
      const hub = getWhatsAppRealtimePublisher();
      hub.resetForTests();
      const before = hub.subscriberCount;
      const controller = new AbortController();
      const response = await fetch(`${baseUrl}/whatsapp/realtime`, {
        headers: {
          Authorization: `Bearer ${readerToken}`,
          Accept: "text/event-stream",
        },
        signal: controller.signal,
      });
      assert.equal(response.status, 200);
      assert.match(response.headers.get("content-type") ?? "", /text\/event-stream/);
      assert.match(response.headers.get("cache-control") ?? "", /no-cache/);
      assert.match(response.headers.get("cache-control") ?? "", /no-store/);
      assert.equal(response.headers.get("x-accel-buffering"), "no");
      assert.equal(hub.subscriberCount, before + 1);

      const second = await fetch(`${baseUrl}/whatsapp/realtime`, {
        headers: { Authorization: `Bearer ${readerToken}`, Accept: "text/event-stream" },
      });
      assert.equal(second.status, 200);
      assert.equal(hub.subscriberCount, before + 2);
      second.body?.cancel();

      const reader = response.body?.getReader();
      assert.ok(reader);
      const decoder = new TextDecoder();
      let buffer = "";
      const deadline = Date.now() + 4_000;
      while (Date.now() < deadline && !buffer.includes(": ping")) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
      }
      assert.match(buffer, /: ping/);
      controller.abort();
      await new Promise((resolve) => setTimeout(resolve, 50));
      assert.equal(hub.subscriberCount <= 1, true);
    });

    test("committed inbound emits conversation.created and message.received after commit", async () => {
      await resetWhatsAppTables(prisma);
      getWhatsAppRealtimePublisher().resetForTests();
      await seedLinked();
      const received: WhatsAppRealtimeEvent[] = [];
      const off = getWhatsAppRealtimePublisher().subscribe((event) => received.push(event));
      const res = await postWebhook(officialTextMessagePayload({ wamid: "wamid.test.rt.in" }));
      assert.equal(res.statusCode, 200, res.body);
      off();
      const types = received.map((event) => event.type);
      assert.equal(types.includes("whatsapp.conversation.created"), true);
      assert.equal(types.includes("whatsapp.message.received"), true);
      const rows = await whatsappOutbox();
      assert.equal(rows.filter((row) => row.eventType === "whatsapp.message.received").length, 1);
      for (const row of rows) assertSafePayload(row.payload, row.eventType);
      for (const event of received) assertSafePayload(event, event.type);
    });

    test("rolled-back inbound transaction emits no realtime event", async () => {
      await resetWhatsAppTables(prisma);
      getWhatsAppRealtimePublisher().resetForTests();
      await seedLinked();
      const received: WhatsAppRealtimeEvent[] = [];
      const off = getWhatsAppRealtimePublisher().subscribe((event) => received.push(event));
      setWhatsAppInboundCommitFailureForTests(new Error("forced commit rollback"));
      const res = await postWebhook(officialTextMessagePayload({ wamid: "wamid.test.rt.rollback" }));
      setWhatsAppInboundCommitFailureForTests(undefined);
      off();
      assert.equal(res.statusCode, 500);
      assert.equal(received.length, 0);
      assert.equal((await whatsappOutbox()).length, 0);
      assert.equal(await prisma.whatsAppMessage.count(), 0);
    });

    test("duplicate webhook does not emit a second message.received", async () => {
      await resetWhatsAppTables(prisma);
      getWhatsAppRealtimePublisher().resetForTests();
      await seedLinked();
      const payload = officialTextMessagePayload({ wamid: "wamid.test.rt.dup" });
      const first = await postWebhook(payload);
      assert.equal(first.statusCode, 200);
      const received: WhatsAppRealtimeEvent[] = [];
      const off = getWhatsAppRealtimePublisher().subscribe((event) => received.push(event));
      const second = await postWebhook(payload);
      off();
      assert.equal(second.statusCode, 200);
      assert.equal(received.filter((event) => event.type === "whatsapp.message.received").length, 0);
      assert.equal(
        (await whatsappOutbox()).filter((row) => row.eventType === "whatsapp.message.received").length,
        1,
      );
    });

    test("mark-read emits conversation.read and Last-Event-ID can replay bounded events", async () => {
      await resetWhatsAppTables(prisma);
      getWhatsAppRealtimePublisher().resetForTests();
      await seedLinked();
      await postWebhook(officialTextMessagePayload({ wamid: "wamid.test.rt.read" }));
      const conversation = await prisma.whatsAppConversation.findFirstOrThrow();
      const received: WhatsAppRealtimeEvent[] = [];
      const off = getWhatsAppRealtimePublisher().subscribe((event) => received.push(event));
      const read = await app.inject({
        method: "POST",
        url: `/whatsapp/conversations/${conversation.id}/read`,
        headers: auth(readerToken),
      });
      off();
      assert.equal(read.statusCode, 200, read.body);
      assert.equal(received.some((event) => event.type === "whatsapp.conversation.read"), true);

      const lastBefore = await prisma.domainOutboxEvent.findFirst({
        where: { eventType: { startsWith: "whatsapp." } },
        orderBy: { id: "asc" },
        select: { id: true },
      });
      assert.ok(lastBefore);
      const replayId = lastBefore.id - 1;
      const controller = new AbortController();
      const stream = await fetch(`${baseUrl}/whatsapp/realtime`, {
        headers: {
          Authorization: `Bearer ${readerToken}`,
          Accept: "text/event-stream",
          "Last-Event-ID": String(replayId),
        },
        signal: controller.signal,
      });
      assert.equal(stream.status, 200);
      const readerStream = stream.body?.getReader();
      assert.ok(readerStream);
      const decoder = new TextDecoder();
      let buffer = "";
      const deadline = Date.now() + 4_000;
      while (Date.now() < deadline && !buffer.includes("whatsapp.message.received")) {
        const { value, done } = await readerStream.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
      }
      controller.abort();
      assert.match(buffer, /whatsapp.message.received/);
      assertSafePayload(buffer, "sse replay");
    });

    test("outbound status webhooks emit provider_status_changed only when the row changes", async () => {
      await resetWhatsAppTables(prisma);
      getWhatsAppRealtimePublisher().resetForTests();
      const connection = await seedLinked();
      const conversation = await prisma.whatsAppConversation.create({
        data: {
          connectionId: connection.id,
          customerWaId: FIXTURE_WA_ID,
          unreadCount: 0,
          lastInboundAt: new Date(),
        },
      });
      const message = await prisma.whatsAppMessage.create({
        data: {
          conversationId: conversation.id,
          connectionId: connection.id,
          direction: "OUTBOUND",
          messageType: "TEXT",
          textBody: "Office note",
          providerMessageId: "wamid.test.rt.out",
          receivedAt: new Date(),
          sendState: "ACCEPTED",
        },
      });
      const received: WhatsAppRealtimeEvent[] = [];
      const off = getWhatsAppRealtimePublisher().subscribe((event) => received.push(event));
      assert.equal((await postWebhook(officialStatusPayload({ wamid: "wamid.test.rt.out", status: "sent" }))).statusCode, 200);
      assert.equal((await postWebhook(officialStatusPayload({ wamid: "wamid.test.rt.out", status: "delivered" }))).statusCode, 200);
      assert.equal((await postWebhook(officialStatusPayload({ wamid: "wamid.test.rt.out", status: "read" }))).statusCode, 200);
      assert.equal((await postWebhook(officialStatusPayload({ wamid: "wamid.test.rt.out", status: "failed" }))).statusCode, 200);
      off();
      const statuses = received
        .filter((event) => event.type === "whatsapp.message.provider_status_changed")
        .map((event) => event.providerStatus);
      assert.deepEqual(statuses, ["SENT", "DELIVERED", "READ"]);
      assert.equal(received.every((event) => event.messageId === message.id), false);
      const statusEvents = received.filter((event) => event.type === "whatsapp.message.provider_status_changed");
      assert.equal(statusEvents.every((event) => event.messageId === message.id), true);
      for (const event of received) assertSafePayload(event, event.type);
    });
  });
}
