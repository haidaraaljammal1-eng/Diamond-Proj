import { test, before, after, describe } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import type { FastifyInstance } from "fastify";
import type { PrismaClient } from "@prisma/client";
import { auth, login, seedPaymentUser } from "../helpers/payment-integration-helpers";
import { encryptWhatsAppCredential } from "src/modules/whatsapp/whatsapp.credentials";
import { setWhatsAppWebhookSecretsForTests } from "src/modules/whatsapp/whatsapp.config";
import { setWhatsAppProviderForTests } from "src/modules/whatsapp/whatsapp.provider";
import { PERMISSIONS } from "src/constants/permissions";
import {
  createFakeWhatsAppProvider,
  TEST_WHATSAPP_TOKEN,
} from "../helpers/fake-whatsapp-provider";
import {
  FIXTURE_DISPLAY_PHONE,
  FIXTURE_PHONE_NUMBER_ID,
  FIXTURE_WA_ID,
  FIXTURE_WABA_ID,
  TEST_WEBHOOK_APP_SECRET,
  TEST_WEBHOOK_VERIFY_TOKEN,
  officialStatusPayload,
  officialTextMessagePayload,
  signedWebhook,
} from "../helpers/whatsapp-webhook-fixtures";
import { resetWhatsAppTables } from "../helpers/whatsapp-reset";

const RUN =
  process.env.RUN_INTEGRATION === "true" && Boolean(process.env.TEST_DATABASE_URL);

const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0]);

function reason(body: string): string | undefined {
  try {
    return JSON.parse(body)?.error?.context?.reason as string | undefined;
  } catch {
    return undefined;
  }
}

function approvedTemplate() {
  return {
    providerTemplateId: "tpl-hello",
    name: "hello_office",
    language: "en",
    status: "APPROVED" as const,
    category: "UTILITY",
    sendable: true,
    bodyText: "Hello {{1}}",
    headerText: null,
    footerText: "Diamond",
    bodyVariableCount: 1,
    headerVariableCount: 0,
  };
}

if (!RUN) {
  test("whatsapp final phase skipped (set RUN_INTEGRATION=true and TEST_DATABASE_URL)", {
    skip: true,
  });
} else {
  process.env.DATABASE_URL = process.env.TEST_DATABASE_URL!;

  describe("whatsapp final templates media customer connection", { concurrency: false }, () => {
    let app: FastifyInstance;
    let prisma: PrismaClient;
    const run = Date.now().toString(36).toUpperCase();
    const sender = { email: `wa-fin-s-${run}@example.test`, password: "wa-final-send-123" };
    const reader = { email: `wa-fin-r-${run}@example.test`, password: "wa-final-read-123" };
    const linker = { email: `wa-fin-l-${run}@example.test`, password: "wa-final-link-123" };
    const manager = { email: `wa-fin-m-${run}@example.test`, password: "wa-final-mgr-123" };
    let senderToken = "";
    let readerToken = "";
    let linkerToken = "";
    let managerToken = "";
    let fake: ReturnType<typeof createFakeWhatsAppProvider>;

    before(async () => {
      const { env } = await import("src/config/env");
      if (!/haidara_test(?:\?|$)/.test(env.DATABASE_URL)) {
        throw new Error("whatsapp final tests require haidara_test");
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
      await seedPaymentUser(prisma, sender.email, sender.password, `wa_fns_${run}`, [
        PERMISSIONS.WHATSAPP_READ,
        PERMISSIONS.WHATSAPP_SEND,
      ]);
      await seedPaymentUser(prisma, reader.email, reader.password, `wa_fnr_${run}`, [
        PERMISSIONS.WHATSAPP_READ,
      ]);
      await seedPaymentUser(prisma, linker.email, linker.password, `wa_fnl_${run}`, [
        PERMISSIONS.WHATSAPP_READ,
        PERMISSIONS.WHATSAPP_SEND,
        PERMISSIONS.WHATSAPP_LINK_CUSTOMER,
        PERMISSIONS.CUSTOMERS_READ,
        PERMISSIONS.CUSTOMERS_VIEW_ALL_BRANCHES,
      ]);
      await seedPaymentUser(prisma, manager.email, manager.password, `wa_fnm_${run}`, [
        PERMISSIONS.WHATSAPP_READ,
        PERMISSIONS.WHATSAPP_MANAGE_CONNECTION,
      ]);
      senderToken = await login(app, sender);
      readerToken = await login(app, reader);
      linkerToken = await login(app, linker);
      managerToken = await login(app, manager);
    });

    after(async () => {
      setWhatsAppProviderForTests(undefined);
      setWhatsAppWebhookSecretsForTests(undefined);
      await app.close();
    });

    async function seedLinked(input?: {
      status?: "LINKED" | "DISCONNECTED" | "REAUTH_REQUIRED" | "ERROR";
      webhookStatus?: "ACTIVE" | "PENDING" | "NOT_CONFIGURED" | "ERROR";
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
          customerDisplayName: "Final Test Contact",
          lastInboundAt,
          unreadCount: 1,
        },
      });
    }

    function sendTemplate(
      conversationId: string,
      body: Record<string, unknown>,
      key: string,
      token = senderToken,
    ) {
      return app.inject({
        method: "POST",
        url: `/whatsapp/conversations/${conversationId}/template-messages`,
        headers: { ...auth(token), "idempotency-key": key },
        payload: body,
      });
    }

    function mediaPayload(kind: string, caption?: string) {
      const boundary = `----wa${randomUUID()}`;
      const chunks = [
        Buffer.from(
          `--${boundary}\r\nContent-Disposition: form-data; name="messageType"\r\n\r\n${kind}\r\n`,
        ),
      ];
      if (caption != null) {
        chunks.push(
          Buffer.from(
            `--${boundary}\r\nContent-Disposition: form-data; name="caption"\r\n\r\n${caption}\r\n`,
          ),
        );
      }
      chunks.push(
        Buffer.from(
          `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="photo.png"\r\nContent-Type: image/png\r\n\r\n`,
        ),
        PNG,
        Buffer.from(`\r\n--${boundary}--\r\n`),
      );
      return {
        payload: Buffer.concat(chunks),
        headers: { "content-type": `multipart/form-data; boundary=${boundary}` },
      };
    }

    test("link_customer appears on /auth/me for the linker only", async () => {
      const me = await app.inject({ method: "GET", url: "/auth/me", headers: auth(linkerToken) });
      const perms = me.json().data.permissions as string[];
      assert.equal(perms.includes(PERMISSIONS.WHATSAPP_LINK_CUSTOMER), true);
      const readerMe = await app.inject({ method: "GET", url: "/auth/me", headers: auth(readerToken) });
      assert.equal(
        (readerMe.json().data.permissions as string[]).includes(PERMISSIONS.WHATSAPP_LINK_CUSTOMER),
        false,
      );
    });

    test("templates require send, hide secrets, and refuse non-approved send", async () => {
      await resetWhatsAppTables(prisma);
      fake.setTemplates([
        approvedTemplate(),
        { ...approvedTemplate(), providerTemplateId: "tpl-pending", name: "pending_review", status: "PENDING", sendable: false, bodyVariableCount: 0, bodyText: "Wait" },
      ]);
      const connection = await seedLinked();
      const convo = await seedConversation(connection.id, new Date(Date.now() - 26 * 60 * 60 * 1000));
      const denied = await app.inject({ method: "GET", url: "/whatsapp/templates", headers: auth(readerToken) });
      assert.equal(denied.statusCode, 403);
      const listed = await app.inject({ method: "GET", url: "/whatsapp/templates", headers: auth(senderToken) });
      assert.equal(listed.statusCode, 200, listed.body);
      const rows = listed.json().data as Array<{ name: string; sendable: boolean }>;
      assert.ok(rows.some((row) => row.name === "hello_office" && row.sendable));
      assert.ok(rows.some((row) => row.name === "pending_review" && !row.sendable));
      assert.equal(listed.body.includes(TEST_WHATSAPP_TOKEN), false);
      assert.equal(listed.body.includes("credentialCiphertext"), false);

      const closedText = await app.inject({
        method: "POST",
        url: `/whatsapp/conversations/${convo.id}/messages`,
        headers: { ...auth(senderToken), "idempotency-key": randomUUID() },
        payload: { text: "Too late" },
      });
      assert.equal(reason(closedText.body), "WHATSAPP_CUSTOMER_SERVICE_WINDOW_CLOSED");

      const pendingSend = await sendTemplate(
        convo.id,
        { name: "pending_review", language: "en" },
        randomUUID(),
      );
      assert.equal(reason(pendingSend.body), "WHATSAPP_TEMPLATE_NOT_APPROVED");

      const missingLang = await sendTemplate(
        convo.id,
        { name: "hello_office", language: "ar", bodyParameters: ["A"] },
        randomUUID(),
      );
      assert.equal(reason(missingLang.body), "WHATSAPP_TEMPLATE_NOT_FOUND");

      const badVars = await sendTemplate(
        convo.id,
        { name: "hello_office", language: "en" },
        randomUUID(),
      );
      assert.equal(reason(badVars.body), "WHATSAPP_TEMPLATE_PARAMETERS_INVALID");

      fake.setSendMessageId("wamid.tpl.001");
      const extraTo = await sendTemplate(
        convo.id,
        { name: "hello_office", language: "en", bodyParameters: ["Office"], to: "15559999999" },
        randomUUID(),
      );
      assert.equal(extraTo.statusCode, 422);
      const key = randomUUID();
      const sent = await sendTemplate(
        convo.id,
        { name: "hello_office", language: "en", bodyParameters: ["Office"] },
        key,
      );
      assert.equal(sent.statusCode, 200, sent.body);
      const message = sent.json().data.message;
      assert.equal(message.messageType, "TEMPLATE");
      assert.equal(message.sendState, "ACCEPTED");
      assert.equal(message.providerStatus, null);
      assert.equal(fake.lastTemplateSend?.toWaId, FIXTURE_WA_ID);
      const replay = await sendTemplate(
        convo.id,
        { name: "hello_office", language: "en", bodyParameters: ["Office"] },
        key,
      );
      assert.equal(replay.json().data.message.id, message.id);
      assert.equal(fake.templateSendCount, 1);

      fake.setSendMessageId(undefined);
      const concurrentKey = randomUUID();
      const before = fake.templateSendCount;
      const [a, b] = await Promise.all([
        sendTemplate(convo.id, { name: "hello_office", language: "en", bodyParameters: ["Two"] }, concurrentKey),
        sendTemplate(convo.id, { name: "hello_office", language: "en", bodyParameters: ["Two"] }, concurrentKey),
      ]);
      assert.equal(a.statusCode, 200, a.body);
      assert.equal(b.statusCode, 200, b.body);
      assert.equal(a.json().data.message.id, b.json().data.message.id);
      assert.equal(fake.templateSendCount, before + 1);

      const status = officialStatusPayload({ wamid: "wamid.tpl.001", status: "delivered" });
      const signed = signedWebhook(status);
      await app.inject({
        method: "POST",
        url: "/whatsapp/webhooks/meta",
        headers: { "content-type": "application/json", "x-hub-signature-256": signed.signature },
        payload: signed.raw,
      });
      const row = await prisma.whatsAppMessage.findUniqueOrThrow({ where: { id: message.id } });
      assert.equal(row.providerStatus, "DELIVERED");
      assert.equal(row.sendState, "ACCEPTED");
    });

    test("media proxy is authenticated and outbound respects window, recipient, and idempotency", async () => {
      await resetWhatsAppTables(prisma);
      fake.setMedia(PNG, "image/png");
      const connection = await seedLinked();
      const convo = await seedConversation(connection.id, new Date());
      const other = await seedConversation(connection.id, new Date(), "15550009999");
      const inbound = await prisma.whatsAppMessage.create({
        data: {
          conversationId: convo.id,
          connectionId: connection.id,
          direction: "INBOUND",
          messageType: "IMAGE",
          providerMediaId: "media-in-1",
          receivedAt: new Date(),
        },
      });
      const unauth = await app.inject({ method: "GET", url: `/whatsapp/messages/${inbound.id}/media` });
      assert.equal(unauth.statusCode, 401);
      const denied = await app.inject({
        method: "GET",
        url: `/whatsapp/messages/${inbound.id}/media`,
        headers: auth(senderToken),
      });
      assert.notEqual(denied.statusCode, 401);
      const ok = await app.inject({
        method: "GET",
        url: `/whatsapp/messages/${inbound.id}/media`,
        headers: auth(readerToken),
      });
      assert.equal(ok.statusCode, 200, ok.body);
      assert.equal(ok.headers["content-type"]?.toString().includes("image/png"), true);
      assert.equal(ok.body.includes(TEST_WHATSAPP_TOKEN), false);
      const missing = await app.inject({
        method: "GET",
        url: `/whatsapp/messages/${randomUUID()}/media`,
        headers: auth(readerToken),
      });
      assert.ok([404, 409].includes(missing.statusCode));
      const textMsg = await prisma.whatsAppMessage.create({
        data: {
          conversationId: other.id,
          connectionId: connection.id,
          direction: "INBOUND",
          messageType: "TEXT",
          textBody: "no media",
          receivedAt: new Date(),
        },
      });
      const noMedia = await app.inject({
        method: "GET",
        url: `/whatsapp/messages/${textMsg.id}/media`,
        headers: auth(readerToken),
      });
      assert.equal(reason(noMedia.body), "WHATSAPP_MEDIA_UNAVAILABLE");

      const closed = await seedConversation(
        connection.id,
        new Date(Date.now() - 26 * 60 * 60 * 1000),
        "15550008888",
      );
      const closedMp = mediaPayload("IMAGE");
      const closedRes = await app.inject({
        method: "POST",
        url: `/whatsapp/conversations/${closed.id}/media-messages`,
        headers: { ...auth(senderToken), "idempotency-key": randomUUID(), ...closedMp.headers },
        payload: closedMp.payload,
      });
      assert.equal(reason(closedRes.body), "WHATSAPP_CUSTOMER_SERVICE_WINDOW_CLOSED");

      const readerMp = mediaPayload("IMAGE");
      const readerRes = await app.inject({
        method: "POST",
        url: `/whatsapp/conversations/${convo.id}/media-messages`,
        headers: { ...auth(readerToken), "idempotency-key": randomUUID(), ...readerMp.headers },
        payload: readerMp.payload,
      });
      assert.equal(readerRes.statusCode, 403);

      const invalidMp = mediaPayload("AUDIO");
      const invalid = await app.inject({
        method: "POST",
        url: `/whatsapp/conversations/${convo.id}/media-messages`,
        headers: { ...auth(senderToken), "idempotency-key": randomUUID(), ...invalidMp.headers },
        payload: invalidMp.payload,
      });
      assert.equal(reason(invalid.body), "WHATSAPP_MEDIA_INVALID_TYPE");

      fake.setSendMessageId("wamid.media.001");
      const key = randomUUID();
      const openMp = mediaPayload("IMAGE", "Office photo");
      const beforeUnread = convo.unreadCount;
      const customerBefore = await prisma.customer.count();
      const sent = await app.inject({
        method: "POST",
        url: `/whatsapp/conversations/${convo.id}/media-messages`,
        headers: { ...auth(senderToken), "idempotency-key": key, ...openMp.headers },
        payload: openMp.payload,
      });
      assert.equal(sent.statusCode, 200, sent.body);
      const message = sent.json().data.message;
      assert.equal(message.sendState, "ACCEPTED");
      assert.equal(message.providerStatus, null);
      assert.equal(fake.lastMediaSend?.toWaId, FIXTURE_WA_ID);
      const replay = await app.inject({
        method: "POST",
        url: `/whatsapp/conversations/${convo.id}/media-messages`,
        headers: { ...auth(senderToken), "idempotency-key": key, ...openMp.headers },
        payload: openMp.payload,
      });
      assert.equal(replay.json().data.message.id, message.id);
      assert.equal(fake.mediaSendCount, 1);
      assert.equal(fake.uploadCount, 1);
      const after = await prisma.whatsAppConversation.findUniqueOrThrow({ where: { id: convo.id } });
      assert.equal(after.unreadCount, beforeUnread);
      assert.equal(await prisma.customer.count(), customerBefore);

      fake.setSendUnknown(true);
      const unknownKey = randomUUID();
      const unknownMp = mediaPayload("IMAGE");
      const unknown = await app.inject({
        method: "POST",
        url: `/whatsapp/conversations/${convo.id}/media-messages`,
        headers: { ...auth(senderToken), "idempotency-key": unknownKey, ...unknownMp.headers },
        payload: unknownMp.payload,
      });
      assert.equal(unknown.json().data.message.sendState, "UNKNOWN");
      const unknownCount = fake.uploadCount;
      const unknownAgain = await app.inject({
        method: "POST",
        url: `/whatsapp/conversations/${convo.id}/media-messages`,
        headers: { ...auth(senderToken), "idempotency-key": unknownKey, ...unknownMp.headers },
        payload: unknownMp.payload,
      });
      assert.equal(unknownAgain.json().data.message.id, unknown.json().data.message.id);
      assert.equal(fake.uploadCount, unknownCount);
      fake.setSendUnknown(false);

      const events = await prisma.domainOutboxEvent.findMany({
        where: { eventType: { startsWith: "whatsapp." } },
      });
      for (const event of events) {
        const blob = JSON.stringify(event.payload);
        assert.equal(blob.includes(PNG.toString("base64")), false);
        assert.equal(blob.includes(TEST_WHATSAPP_TOKEN), false);
      }
    });

    test("inbound does not create customers; match and link are explicit and ACL-safe", async () => {
      await resetWhatsAppTables(prisma);
      const connection = await seedLinked();
      await prisma.customer.deleteMany({
        where: { mobile: { in: [FIXTURE_WA_ID, `+${FIXTURE_WA_ID}`] } },
      });
      const beforeCustomers = await prisma.customer.count();
      const inbound = officialTextMessagePayload({ wamid: `wamid.in.${run}` });
      const signed = signedWebhook(inbound);
      await app.inject({
        method: "POST",
        url: "/whatsapp/webhooks/meta",
        headers: { "content-type": "application/json", "x-hub-signature-256": signed.signature },
        payload: signed.raw,
      });
      assert.equal(await prisma.customer.count(), beforeCustomers);
      const convo = await prisma.whatsAppConversation.findFirstOrThrow();
      assert.equal(convo.customerId, null);

      const none = await app.inject({
        method: "GET",
        url: `/whatsapp/conversations/${convo.id}/customer-match`,
        headers: auth(readerToken),
      });
      assert.equal(none.statusCode, 200, none.body);
      assert.equal(none.json().data.state, "NO_MATCH");

      const one = await prisma.customer.create({
        data: { name: `WA Match ${run}`, mobile: FIXTURE_WA_ID },
      });
      const match = await app.inject({
        method: "GET",
        url: `/whatsapp/conversations/${convo.id}/customer-match`,
        headers: auth(linkerToken),
      });
      assert.equal(match.json().data.state, "ONE_MATCH");
      assert.equal(match.json().data.customer.id, one.id);

      const hidden = await app.inject({
        method: "GET",
        url: `/whatsapp/conversations/${convo.id}/customer-match`,
        headers: auth(readerToken),
      });
      assert.equal(hidden.json().data.state, "ONE_MATCH");
      assert.equal(hidden.json().data.customer, null);

      await prisma.customer.create({
        data: { name: `WA Match 2 ${run}`, mobile: `+${FIXTURE_WA_ID}` },
      });
      const ambiguous = await app.inject({
        method: "GET",
        url: `/whatsapp/conversations/${convo.id}/customer-match`,
        headers: auth(linkerToken),
      });
      assert.equal(ambiguous.json().data.state, "AMBIGUOUS");
      assert.equal(ambiguous.json().data.customer, null);

      const forbidden = await app.inject({
        method: "POST",
        url: `/whatsapp/conversations/${convo.id}/customer-link`,
        headers: auth(senderToken),
        payload: { customerId: one.id },
      });
      assert.equal(forbidden.statusCode, 403);

      const missing = await app.inject({
        method: "POST",
        url: `/whatsapp/conversations/${convo.id}/customer-link`,
        headers: auth(linkerToken),
        payload: { customerId: 9_999_999 },
      });
      assert.ok([404, 409].includes(missing.statusCode));

      const nameBefore = one.name;
      const linked = await app.inject({
        method: "POST",
        url: `/whatsapp/conversations/${convo.id}/customer-link`,
        headers: auth(linkerToken),
        payload: { customerId: one.id },
      });
      assert.equal(linked.statusCode, 200, linked.body);
      assert.equal(linked.json().data.customerLink.linked, true);
      const unchanged = await prisma.customer.findUniqueOrThrow({ where: { id: one.id } });
      assert.equal(unchanged.name, nameBefore);
      assert.equal(unchanged.mobile, FIXTURE_WA_ID);

      const unlinked = await app.inject({
        method: "DELETE",
        url: `/whatsapp/conversations/${convo.id}/customer-link`,
        headers: auth(linkerToken),
      });
      assert.equal(unlinked.statusCode, 200, unlinked.body);
      assert.equal(unlinked.json().data.customerLink.linked, false);
      assert.ok(await prisma.customer.findUnique({ where: { id: one.id } }));

      const audits = await prisma.auditLog.findMany({
        where: { action: { in: ["WHATSAPP_CUSTOMER_LINKED", "WHATSAPP_CUSTOMER_UNLINKED"] } },
      });
      assert.ok(audits.length >= 2);
      for (const log of audits) {
        const blob = JSON.stringify(log);
        assert.equal(blob.includes("Hello Diamond"), false);
        assert.equal(blob.includes(TEST_WHATSAPP_TOKEN), false);
      }
    });

    test("webhook activate uses the provider and never fakes ACTIVE", async () => {
      await resetWhatsAppTables(prisma);
      const connection = await seedLinked({ webhookStatus: "PENDING" });
      const denied = await app.inject({
        method: "POST",
        url: "/whatsapp/connection/webhook/activate",
        headers: auth(senderToken),
      });
      assert.equal(denied.statusCode, 403);
      fake.setSubscribeResult(false, false);
      const failed = await app.inject({
        method: "POST",
        url: "/whatsapp/connection/webhook/activate",
        headers: auth(managerToken),
      });
      assert.ok(failed.statusCode >= 400);
      const afterFail = await prisma.whatsAppConnection.findUniqueOrThrow({ where: { id: connection.id } });
      assert.notEqual(afterFail.webhookStatus, "ACTIVE");
      fake.setSubscribeResult(true, true);
      const ok = await app.inject({
        method: "POST",
        url: "/whatsapp/connection/webhook/activate",
        headers: auth(managerToken),
      });
      assert.equal(ok.statusCode, 200, ok.body);
      assert.equal(ok.json().data.webhookStatus, "ACTIVE");
      assert.equal(fake.calls.includes("subscribeWaba"), true);
      assert.equal(ok.body.includes(TEST_WHATSAPP_TOKEN), false);
    });
  });
}
