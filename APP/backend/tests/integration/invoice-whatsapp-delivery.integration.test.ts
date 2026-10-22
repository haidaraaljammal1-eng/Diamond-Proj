import { test, before, after, beforeEach, describe } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import type { FastifyInstance } from "fastify";
import type { PrismaClient } from "@prisma/client";
import { PERMISSIONS } from "src/constants/permissions";
import { buildInvoiceWhatsAppMessage } from "src/modules/invoices/invoice-whatsapp-message";
import { encryptWhatsAppCredential } from "src/modules/whatsapp/whatsapp.credentials";
import { setWhatsAppProviderForTests } from "src/modules/whatsapp/whatsapp.provider";
import { WHAPI_CAPABILITIES } from "src/modules/whatsapp/whatsapp.capabilities";
import {
  configureTestInvoiceSequences,
  confirmSignedElectronicRentalPayment,
  drainInvoiceOutbox,
  signContractViaPublicRental,
} from "tests/helpers/invoice-integration";
import { createFakePaymentProvider } from "tests/helpers/fake-payment-provider";
import { createFakeWhatsAppProvider, TEST_WHATSAPP_TOKEN } from "tests/helpers/fake-whatsapp-provider";
import { seedPaymentUser, auth, login } from "tests/helpers/payment-integration-helpers";
import { resetWhatsAppTables } from "tests/helpers/whatsapp-reset";

const RUN =
  process.env.RUN_INTEGRATION === "true" && Boolean(process.env.TEST_DATABASE_URL);

function parseReason(body: string): string | undefined {
  try {
    return JSON.parse(body)?.error?.context?.reason as string | undefined;
  } catch {
    return undefined;
  }
}

if (!RUN) {
  test("invoice whatsapp delivery skipped (RUN_INTEGRATION + TEST_DATABASE_URL)", { skip: true });
} else {
  process.env.DATABASE_URL = process.env.TEST_DATABASE_URL!;
  process.env.LEGACY_CARD_LINK_ENABLED = "true";
  process.env.SCHEDULER_ENABLED = "false";
  process.env.STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY ?? "sk_test_integration_fake";
  process.env.PAYMENT_PROVIDER = "stripe";

  describe("invoice WhatsApp delivery sign-off", { concurrency: false }, () => {
    let app: FastifyInstance;
    let prisma: PrismaClient;
    const run = `IWD${Date.now().toString(36).toUpperCase()}`;
    let fakeWa: ReturnType<typeof createFakeWhatsAppProvider>;
    let fakePayments = createFakePaymentProvider(run);
    let senderToken = "";
    let readerToken = "";
    let senderUserId = 0;
    let connectionId = "";
    let issueSeq = 0;
    const sender = { email: `inv-wa-${run}@example.test`, password: "inv-wa-pass-123" };
    const reader = { email: `inv-wa-ro-${run}@example.test`, password: "inv-wa-ro-pass-123" };

    const authHeaders = () => ({ authorization: `Bearer ${senderToken}` });

    async function resetInvoiceWhatsAppState() {
      await prisma.invoiceDelivery.deleteMany();
      await prisma.whatsAppOutboundAttempt.deleteMany();
      await prisma.whatsAppMessage.deleteMany();
      await prisma.whatsAppConversation.deleteMany();
      const existing = await prisma.whatsAppConnection.findFirst({
        where: { providerInstanceId: { startsWith: "inv-wa-ch-" } },
        orderBy: { createdAt: "desc" },
      });
      if (existing) {
        connectionId = existing.id;
        return;
      }
      const connection = await prisma.whatsAppConnection.create({
        data: {
          provider: "WHAPI",
          status: "LINKED",
          providerInstanceId: `inv-wa-ch-${run}`,
          providerSessionStatus: "AUTHENTICATED",
          credentialCiphertext: encryptWhatsAppCredential(TEST_WHATSAPP_TOKEN),
          connectedAt: new Date(),
          webhookStatus: "ACTIVE",
          displayPhoneNumber: "971500000000",
        },
      });
      connectionId = connection.id;
    }

    before(async () => {
      const { env } = await import("src/config/env");
      if (!/haidara_test(?:\?|$)/.test(env.DATABASE_URL)) {
        throw new Error("invoice whatsapp delivery tests require haidara_test");
      }
      const dbName = new URL(env.DATABASE_URL.replace(/^postgres:/, "postgresql:")).pathname.slice(1);
      if (dbName !== "haidara_test") {
        throw new Error(`refusing database ${dbName}`);
      }

      fakeWa = createFakeWhatsAppProvider();
      setWhatsAppProviderForTests({
        ...fakeWa.provider,
        capabilities: () => WHAPI_CAPABILITIES,
      });
      const { setPaymentProviderForTests } = await import(
        "src/modules/contracts/payment/payment-provider.factory"
      );
      setPaymentProviderForTests(fakePayments.provider);

      const { buildApp } = await import("src/app");
      app = await buildApp();
      prisma = app.prisma;
      await resetWhatsAppTables(prisma);

      for (const key of [PERMISSIONS.INVOICES_READ, PERMISSIONS.INVOICES_SEND_WHATSAPP]) {
        const perm = await prisma.permission.upsert({
          where: { key },
          update: {},
          create: { key, category: "invoices", description: key },
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

      const senderPerms = [
        PERMISSIONS.INVOICES_READ,
        PERMISSIONS.INVOICES_SEND_WHATSAPP,
        "vehicles.read",
        "vehicles.manage",
        "contracts.read",
        "contracts.manage",
      ];
      await seedPaymentUser(prisma, sender.email, sender.password, `inv_wa_sd_${run}`, senderPerms);
      await seedPaymentUser(prisma, reader.email, reader.password, `inv_wa_rd_${run}`, [
        PERMISSIONS.INVOICES_READ,
      ]);
      senderToken = await login(app, sender);
      readerToken = await login(app, reader);
      const { normalizeEmail } = await import("src/lib/security/normalize");
      const senderUser = await prisma.user.findUniqueOrThrow({
        where: { email: normalizeEmail(sender.email) },
      });
      senderUserId = senderUser.id;
      await configureTestInvoiceSequences(prisma);

      const connection = await prisma.whatsAppConnection.create({
        data: {
          provider: "WHAPI",
          status: "LINKED",
          providerInstanceId: `inv-wa-ch-${run}`,
          providerSessionStatus: "AUTHENTICATED",
          credentialCiphertext: encryptWhatsAppCredential(TEST_WHATSAPP_TOKEN),
          connectedAt: new Date(),
          webhookStatus: "ACTIVE",
          displayPhoneNumber: "971500000000",
        },
      });
      connectionId = connection.id;
    });

    beforeEach(async () => {
      fakeWa.setSendUnknown(false);
      fakeWa.setSendFailure(undefined);
      fakeWa.setOutboundDelayMs(0);
      setWhatsAppProviderForTests({
        ...fakeWa.provider,
        capabilities: () => WHAPI_CAPABILITIES,
      });
      await resetInvoiceWhatsAppState();
    });

    after(async () => {
      setWhatsAppProviderForTests(undefined);
      const { setPaymentProviderForTests } = await import(
        "src/modules/contracts/payment/payment-provider.factory"
      );
      setPaymentProviderForTests(undefined);
      await app.close();
    });

    async function issueInvoice(mobile = "+971501112233"): Promise<{
      invoiceId: string;
      customerId: number;
      mobile: string;
    }> {
      issueSeq += 1;
      const shortRun = `${run.slice(-5)}${issueSeq}`;
      const { contractId, rentalToken } = await signContractViaPublicRental(app, prisma, {
        authHeaders: authHeaders(),
        companyCode: "ELITE",
        run: shortRun,
        agreedAmount: 1200,
        customerName: "WA Invoice Customer",
        mobile,
      });
      await confirmSignedElectronicRentalPayment(app, {
        contractId,
        rentalToken,
        payments: fakePayments,
      });
      await drainInvoiceOutbox(app);
      const invoice = await prisma.invoice.findFirstOrThrow({
        where: { contractId, isCurrent: true },
      });
      const customer = await prisma.customer.findUniqueOrThrow({ where: { id: invoice.customerId } });
      return { invoiceId: invoice.id, customerId: invoice.customerId, mobile: customer.mobile! };
    }

    function sendWhatsApp(invoiceId: string, idempotencyKey: string, token = senderToken) {
      return app.inject({
        method: "POST",
        url: `/invoices/${invoiceId}/deliveries/whatsapp`,
        headers: { ...auth(token), "idempotency-key": idempotencyKey },
        payload: { idempotencyKey },
      });
    }

    test("RBAC: read-only user cannot send", async () => {
      const { invoiceId } = await issueInvoice();
      const res = await sendWhatsApp(invoiceId, `rbac-${run}`, readerToken);
      assert.equal(res.statusCode, 403, res.body);
    });

    test("success: linked conversation, PDF document, caption, SENT not DELIVERED", async () => {
      fakeWa.setSendUnknown(false);
      fakeWa.setSendFailure(undefined);
      const { invoiceId, customerId, mobile } = await issueInvoice("+971502223344");
      const waDigits = "971502223344";
      const conversation = await prisma.whatsAppConversation.create({
        data: {
          connectionId,
          kind: "DIRECT",
          customerWaId: waDigits,
          customerId,
          customerLinkedAt: new Date(),
          customerLinkedByUserId: senderUserId,
          unreadCount: 0,
        },
      });

      const key = `ok-${run}-${randomUUID()}`;
      const res = await sendWhatsApp(invoiceId, key);
      assert.equal(res.statusCode, 200, res.body);
      const delivery = res.json().data;
      assert.equal(delivery.status, "SENT");
      assert.equal(delivery.deliveredAt ?? null, null);
      assert.equal(delivery.recipientPhoneSnapshot.replace(/\D/g, ""), waDigits);

      const invoice = await prisma.invoice.findUniqueOrThrow({ where: { id: invoiceId } });
      const expectedCaption = buildInvoiceWhatsAppMessage({
        customerName: invoice.customerNameSnapshot,
        invoiceNumber: invoice.invoiceNumber,
        contractNumber: invoice.contractNumberSnapshot,
        totalAmount: invoice.totalAmount,
        companyDisplayName: invoice.companyDisplayNameSnapshot,
      });
      assert.equal(delivery.messageSnapshot, expectedCaption);

      const msg = await prisma.whatsAppMessage.findFirstOrThrow({
        where: { conversationId: conversation.id, direction: "OUTBOUND", messageType: "DOCUMENT" },
        orderBy: { createdAt: "desc" },
      });
      assert.equal(msg.sendState, "ACCEPTED");
      assert.ok(msg.providerMessageId);
      assert.equal(delivery.providerMessageId, msg.providerMessageId);
      assert.equal(msg.caption, expectedCaption);
      assert.equal(msg.mediaMimeType, "application/pdf");
      assert.ok(msg.mediaFilename?.includes("Diamond"));

      const realtime = await prisma.domainOutboxEvent.findFirst({
        where: {
          eventType: "whatsapp.message.outbound_created",
          dedupeKey: `whatsapp.message.outbound_created:${msg.id}`,
        },
      });
      assert.ok(realtime);

      assert.ok(fakeWa.mediaSendCount > 0 || fakeWa.uploadCount > 0);
    });

    test("creates unlinked conversation when none exists", async () => {
      const { invoiceId } = await issueInvoice("+971503334455");
      const key = `new-conv-${run}`;
      const res = await sendWhatsApp(invoiceId, key);
      assert.equal(res.statusCode, 200, res.body);
      const conv = await prisma.whatsAppConversation.findFirst({
        where: { connectionId, customerWaId: "971503334455" },
      });
      assert.ok(conv);
      assert.equal(conv!.customerId, null);
    });

    test("reuses unlinked conversation without linking customer", async () => {
      const { invoiceId } = await issueInvoice("+971504445566");
      const conv = await prisma.whatsAppConversation.create({
        data: {
          connectionId,
          kind: "DIRECT",
          customerWaId: "971504445566",
          unreadCount: 0,
        },
      });
      const res = await sendWhatsApp(invoiceId, `unlinked-${run}`);
      assert.equal(res.statusCode, 200, res.body);
      const after = await prisma.whatsAppConversation.findUniqueOrThrow({ where: { id: conv.id } });
      assert.equal(after.customerId, null);
    });

    test("staff-linked @lid only thread fails closed (no digit identity)", async () => {
      const { invoiceId, customerId } = await issueInvoice("+971505556677");
      await prisma.whatsAppConversation.create({
        data: {
          connectionId,
          kind: "DIRECT",
          customerWaId: "opaque-lid-user@lid",
          customerId,
          customerLinkedAt: new Date(),
          customerLinkedByUserId: senderUserId,
          unreadCount: 0,
        },
      });
      const res = await sendWhatsApp(invoiceId, `lid-${run}`);
      assert.equal(res.statusCode, 409, res.body);
      assert.equal(parseReason(res.body), "INVOICE_WHATSAPP_RECIPIENT_AMBIGUOUS");
    });

    test("rejects staff-linked conversation when wa digits mismatch mobile", async () => {
      const { invoiceId, customerId } = await issueInvoice("+971506667788");
      await prisma.whatsAppConversation.create({
        data: {
          connectionId,
          kind: "DIRECT",
          customerWaId: "971509999999",
          customerId,
          customerLinkedAt: new Date(),
          customerLinkedByUserId: senderUserId,
          unreadCount: 0,
        },
      });
      const res = await sendWhatsApp(invoiceId, `mismatch-${run}`);
      assert.equal(res.statusCode, 409, res.body);
      assert.equal(parseReason(res.body), "INVOICE_WHATSAPP_RECIPIENT_AMBIGUOUS");
      const delivery = await prisma.invoiceDelivery.findFirst({
        where: { invoiceId, idempotencyKey: `mismatch-${run}` },
      });
      assert.ok(delivery);
      assert.equal(delivery!.status, "FAILED");
    });

    test("rejects conversation linked to another customer", async () => {
      const target = await issueInvoice("+971507778899");
      const other = await issueInvoice("+971508889911");
      await prisma.whatsAppConversation.create({
        data: {
          connectionId,
          kind: "DIRECT",
          customerWaId: "971507778899",
          customerId: other.customerId,
          customerLinkedAt: new Date(),
          unreadCount: 0,
        },
      });
      const res = await sendWhatsApp(target.invoiceId, `other-cust-${run}`);
      assert.equal(res.statusCode, 409, res.body);
    });

    test("missing customer phone fails validation", async () => {
      const { invoiceId, customerId } = await issueInvoice("+971508889900");
      await prisma.customer.update({ where: { id: customerId }, data: { mobile: "" } });
      const res = await sendWhatsApp(invoiceId, `no-phone-${run}`);
      assert.equal(res.statusCode, 422, res.body);
      assert.equal(parseReason(res.body), "INVOICE_CUSTOMER_PHONE_MISSING");
    });

    test("provider rejection marks FAILED with provider message persisted", async () => {
      fakeWa.setSendFailure({ ok: false, code: "SEND_REJECTED", providerErrorCode: "ERR" });
      const { invoiceId } = await issueInvoice("+971509990011");
      const res = await sendWhatsApp(invoiceId, `reject-${run}`);
      assert.equal(res.statusCode, 200, res.body);
      assert.equal(res.json().data.status, "FAILED");
      const msg = await prisma.whatsAppMessage.findFirst({
        where: { sendState: "FAILED", messageType: "DOCUMENT" },
        orderBy: { createdAt: "desc" },
      });
      assert.ok(msg);
      fakeWa.setSendFailure(undefined);
    });

    test("UNKNOWN stays SENDING with SEND_UNKNOWN and blocks new idempotency key", async () => {
      fakeWa.setSendUnknown(true);
      const { invoiceId } = await issueInvoice("+971500001122");
      const firstKey = `unk-${run}`;
      const first = await sendWhatsApp(invoiceId, firstKey);
      assert.equal(first.statusCode, 200, first.body);
      const row = first.json().data;
      assert.equal(row.status, "SENDING");
      assert.equal(row.failureCode, "SEND_UNKNOWN");
      assert.equal(row.sentAt, null);
      assert.equal(row.deliveredAt, null);

      const msg = await prisma.whatsAppMessage.findFirstOrThrow({
        where: { sendState: "UNKNOWN", messageType: "DOCUMENT" },
        orderBy: { createdAt: "desc" },
      });
      assert.ok(msg);

      fakeWa.setSendUnknown(false);
      const sendsBeforeRetry = fakeWa.mediaSendCount;
      const secondKey = `unk-new-${run}-${randomUUID()}`;
      const second = await sendWhatsApp(invoiceId, secondKey);
      assert.equal(second.statusCode, 409, second.body);
      assert.equal(parseReason(second.body), "INVOICE_WHATSAPP_DELIVERY_UNCERTAIN");
      assert.equal(fakeWa.mediaSendCount, sendsBeforeRetry);
    });

    test("concurrent different idempotency keys: one provider send (in-flight guard)", async () => {
      fakeWa.setSendUnknown(false);
      fakeWa.setOutboundDelayMs(400);
      const sendsBefore = fakeWa.mediaSendCount;
      const { invoiceId } = await issueInvoice("+971500998877");
      const first = sendWhatsApp(invoiceId, `conc-a-${run}-${randomUUID()}`);
      await new Promise((resolve) => setTimeout(resolve, 80));
      const second = await sendWhatsApp(invoiceId, `conc-b-${run}-${randomUUID()}`);
      const firstRes = await first;
      assert.equal(firstRes.statusCode, 200, firstRes.body);
      assert.equal(second.statusCode, 409, second.body);
      assert.equal(parseReason(second.body), "INVOICE_WHATSAPP_DELIVERY_IN_FLIGHT");
      assert.equal(fakeWa.mediaSendCount - sendsBefore, 1);
    });

    test("same idempotency key returns same delivery without duplicate provider send", async () => {
      fakeWa.setSendUnknown(false);
      const beforeCount = fakeWa.mediaSendCount;
      const { invoiceId } = await issueInvoice("+971500112233");
      const key = `idem-${run}-${randomUUID()}`;
      const a = await sendWhatsApp(invoiceId, key);
      assert.equal(a.statusCode, 200, a.body);
      const b = await sendWhatsApp(invoiceId, key);
      assert.equal(b.statusCode, 200, b.body);
      assert.equal(a.json().data.id, b.json().data.id);
      assert.equal(fakeWa.mediaSendCount - beforeCount, 1);
    });

    test("idempotency key cannot bind two invoices", async () => {
      const a = await issueInvoice("+971500223344");
      const b = await issueInvoice("+971500334455");
      const key = `cross-${run}`;
      assert.equal((await sendWhatsApp(a.invoiceId, key)).statusCode, 200);
      const cross = await sendWhatsApp(b.invoiceId, key);
      assert.equal(cross.statusCode, 409, cross.body);
      assert.equal(parseReason(cross.body), "INVOICE_DELIVERY_IDEMPOTENCY_MISMATCH");
    });

    test("unconfigured provider fails closed with 503 and FAILED delivery", async () => {
      const { invoiceId } = await issueInvoice("+971500445566");
      setWhatsAppProviderForTests({ ...fakeWa.provider, configured: false });
      const key = `unconf-${run}`;
      const res = await sendWhatsApp(invoiceId, key);
      assert.equal(res.statusCode, 503, res.body);
      const delivery = await prisma.invoiceDelivery.findFirstOrThrow({
        where: { invoiceId, idempotencyKey: key },
      });
      assert.equal(delivery.status, "FAILED");
      assert.notEqual(delivery.status, "PENDING");
    });
  });
}
