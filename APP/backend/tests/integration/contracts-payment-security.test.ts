import { test, before, after, describe } from "node:test";
import assert from "node:assert/strict";
import { injectDocumentOcr, seedReadyIdentity } from "../helpers/public-identity";
import type { FastifyInstance } from "fastify";
import type { PrismaClient } from "@prisma/client";
import { setPaymentProviderForTests } from "src/modules/contracts/payment/payment-provider.factory";
import {
  approveReconciliation570,
  auth,
  installPaymentProvider,
  login,
  PAYMENT_PERMS,
  seedPaymentUser,
  seedReviewContract,
  settlePayment,
  startReconciliationPayment,
} from "../helpers/payment-integration-helpers";
import {
  confirmPaymentViaStatusToken,
  confirmRentalPaymentViaStatusToken,
  createFakePaymentProvider,
  sendTestStripeWebhook,
} from "../helpers/fake-payment-provider";
import { UnconfiguredPaymentProvider } from "src/modules/contracts/payment/unconfigured-payment.provider";
import { CAR_OUT_REQUIRED_ANGLES } from "src/modules/contracts/contracts.constants";
import { companyId as testCompanyId } from "tests/helpers/operating-company";

const RUN =
  process.env.RUN_INTEGRATION === "true" && Boolean(process.env.TEST_DATABASE_URL);

if (!RUN) {
  test(
    "payment security integration skipped (set RUN_INTEGRATION=true and TEST_DATABASE_URL)",
    { skip: true },
  );
} else {
  process.env.DATABASE_URL = process.env.TEST_DATABASE_URL!;
  process.env.LEGACY_CARD_LINK_ENABLED = "true";
  process.env.SCHEDULER_ENABLED = "false";

  describe("payment security and concurrency", { concurrency: false }, () => {
    let app: FastifyInstance;
    let prisma: PrismaClient;
    const run = Date.now().toString(36).toUpperCase();
    const admin = { email: `psec-admin-${run}@example.test`, password: "psec-admin-pass-123" };
    let token = "";
    let adminUserId = 0;
    let vehicleId = 0;
    let customerId = 0;
    let seq = 0;
    const payments = installPaymentProvider(run);


    async function seedLiability(contractId: string) {
      seq += 1;
      return prisma.roadLiability.create({
        data: {
          type: "RTA_VIOLATION",
          vehicleId,
          occurredAt: new Date("2026-09-02T12:00:00.000Z"),
          amount: 100,
          currency: "AED",
          authoritativeSourceKey: "RTA",
          authoritativeExternalReference: `RTA-SEC-${run}-${seq}`,
          confirmationStatus: "CONFIRMED",
          attributionStatus: "MATCHED",
          collectionStatus: "OPEN",
          attributedContractId: contractId,
          confirmedAt: new Date(),
        },
      });
    }

    async function setup570() {
      seq += 1;
      const contract = await seedReviewContract(prisma, {
        run,
        seq,
        vehicleId,
        customerId,
        adminUserId,
        vehicleAvailable: true,
      });
      const liability = await seedLiability(contract.id);
      await approveReconciliation570(app, token, contract.id, liability.id);
      return { contract, liability };
    }

    async function seedValidLicense(rentalToken: string) {
      await seedReadyIdentity(app, rentalToken, { licenseNumber: "DL-SEC", expiryDate: "2030-01-01" });
    }

    async function dummyPhotos() {
      const ids: string[] = [];
      for (let i = 0; i < 8; i++) {
        seq += 1;
        const row = await prisma.attachment.create({
          data: {
            originalName: `sec-${run}-${seq}.png`,
            storageKey: `sec-${run}-${seq}.png`,
            mimeType: "image/png",
            size: 8,
          },
        });
        ids.push(row.id);
      }
      return CAR_OUT_REQUIRED_ANGLES.map((angle, i) => ({ attachmentId: ids[i]!, angle }));
    }

    async function createActiveRenewalToken(additionalAmount = 500) {
      seq += 1;
      const vehicleRes = await app.inject({
        method: "POST",
        url: "/vehicles",
        headers: auth(token),
        payload: { companyId: await testCompanyId(prisma), vehicleName: `SEC-RN-${seq}`, plateNumber: `SEC ${run}${seq}`, dailyRate: 400 },
      });
      assert.equal(vehicleRes.statusCode, 201, vehicleRes.body);
      const vId = vehicleRes.json().data.id as number;
      const offer = await app.inject({
        method: "POST",
        url: "/contracts/offers",
        headers: auth(token),
        payload: { vehicleId: vId, priceType: "DAILY", rentalDays: 3, agreedAmount: 1500 , collectionMode: "ELECTRONIC"},
      });
      const contractId = offer.json().data.id as string;
      const linkRes = await app.inject({
        method: "POST",
        url: `/contracts/${contractId}/rental-link`,
        headers: auth(token),
      });
      const rentalToken = linkRes.json().data.link.token as string;
      await seedValidLicense(rentalToken);
      await app.inject({
        method: "POST",
        url: `/contracts/rental/${rentalToken}/form`,
        payload: {
          name: "Sec Customer",
          mobile: "+971500000099",
          nationality: "AE",
          identityNumber: `784-${run}-rn-${seq}`,
        },
      });
      await app.inject({
        method: "POST",
        url: `/contracts/rental/${rentalToken}/accept`,
        payload: {},
      });
      const payProvider = createFakePaymentProvider(`${run}-rn-${seq}`);
      setPaymentProviderForTests(payProvider.provider);
      const payStart = await app.inject({
        method: "POST",
        url: `/contracts/rental/${rentalToken}/payment`,
        headers: {
          "content-type": "application/json",
          "idempotency-key": `renewal-setup-${run}-${seq}`,
        },
        payload: { savePaymentMethodForFutureUse: false },
      });
      assert.equal(payStart.statusCode, 200, payStart.body);
      const rentalStatusToken = payStart.json().data.statusToken as string;
      assert.ok(rentalStatusToken, payStart.body);
      const { hashToken } = await import("src/lib/security/tokens");
      const rentalPayment = await prisma.contractPayment.findUnique({
        where: { statusTokenHash: hashToken(rentalStatusToken) },
      });
      assert.ok(rentalPayment, "rental payment for status token");
      await settlePayment(app, payProvider, rentalPayment.id);
      setPaymentProviderForTests(payments.provider);
      await prisma.contract.update({ where: { id: contractId }, data: { status: "ACTIVE" } });
      await prisma.vehicle.update({ where: { id: vId }, data: { operationalStatus: "RENTED" } });
      const issued = await app.inject({
        method: "POST",
        url: `/contracts/${contractId}/renewal-link`,
        headers: auth(token),
        payload: { additionalDays: 3, additionalAmount },
      });
      assert.equal(issued.statusCode, 200, issued.body);
      const renewToken = issued.json().data.link.token as string;
      await app.inject({
        method: "POST",
        url: `/contracts/renew/${renewToken}/confirm`,
        payload: {},
      });
      return { contractId, renewToken };
    }

    before(async () => {
      const { env } = await import("src/config/env");
      if (!/haidara_test(?:\?|$)/.test(env.DATABASE_URL)) {
        throw new Error("payment security tests require haidara_test DATABASE_URL");
      }
      const { buildApp } = await import("src/app");
      app = await buildApp();
      prisma = app.prisma;
      adminUserId = await seedPaymentUser(prisma, admin.email, admin.password, `psec_admin_${run}`, PAYMENT_PERMS);
      token = await login(app, admin);
      setPaymentProviderForTests(payments.provider);
      const vehicle = await app.inject({
        method: "POST",
        url: "/vehicles",
        headers: auth(token),
        payload: { companyId: await testCompanyId(prisma), vehicleName: `PSEC ${run}`, plateNumber: `PSEC ${run}`, dailyRate: 400 },
      });
      assert.equal(vehicle.statusCode, 201, vehicle.body);
      vehicleId = vehicle.json().data.id as number;
      customerId = (await prisma.customer.create({ data: { name: `PSEC Customer ${run}` } })).id;
    });

    after(async () => {
      await injectDocumentOcr(undefined);
      setPaymentProviderForTests(undefined);
      await app.close();
    });

    test("invalid webhook signature is rejected", async () => {
      const res = await sendTestStripeWebhook(
        app,
        {
          stripeEventId: "evt_bad",
          eventType: "checkout.session.completed",
          paymentId: "00000000-0000-4000-8000-000000000001",
          providerReference: "cs_bad",
          status: "CONFIRMED",
        },
        "bad-signature",
      );
      assert.equal(res.statusCode, 400);
      assert.equal(res.json().error.code, "INVALID_SIGNATURE");
    });

    test("wrong provider reference is rejected", async () => {
      const { contract } = await setup570();
      const started = await startReconciliationPayment(app, token, contract.id);
      const event = payments.buildWebhookEvent({
        paymentId: started.payment.id,
        providerReference: "cs_wrong_ref",
      });
      const res = await sendTestStripeWebhook(app, event);
      assert.equal(res.statusCode, 200);
      const { flushStripeWebhookInbox } = await import("../helpers/fake-payment-provider");
      await flushStripeWebhookInbox(app);
      const payment = await prisma.contractPayment.findUniqueOrThrow({ where: { id: started.payment.id } });
      assert.notEqual(payment.status, "CONFIRMED");
    });

    test("wrong amount and currency are rejected", async () => {
      const { contract } = await setup570();
      const started = await startReconciliationPayment(app, token, contract.id);
      const { flushStripeWebhookInbox } = await import("../helpers/fake-payment-provider");
      const badAmount = payments.buildWebhookEvent({
        paymentId: started.payment.id,
        amountMinor: 100,
      });
      const amountRes = await sendTestStripeWebhook(app, badAmount);
      assert.equal(amountRes.statusCode, 200);
      await flushStripeWebhookInbox(app);
      let payment = await prisma.contractPayment.findUniqueOrThrow({ where: { id: started.payment.id } });
      assert.notEqual(payment.status, "CONFIRMED");

      const badCurrency = payments.buildWebhookEvent({
        paymentId: started.payment.id,
        currency: "USD",
        stripeEventId: payments.nextEventId(),
      });
      const currencyRes = await sendTestStripeWebhook(app, badCurrency);
      assert.equal(currencyRes.statusCode, 200);
      await flushStripeWebhookInbox(app);
      payment = await prisma.contractPayment.findUniqueOrThrow({ where: { id: started.payment.id } });
      assert.notEqual(payment.status, "CONFIRMED");
    });

    test("duplicate create payment and duplicate webhook settle once", async () => {
      const { contract } = await setup570();
      const first = await startReconciliationPayment(app, token, contract.id);
      const second = await startReconciliationPayment(app, token, contract.id);
      assert.equal(first.payment.id, second.payment.id);

      const event = payments.buildWebhookEvent({ paymentId: first.payment.id });
      payments.confirm();
      const firstRes = await sendTestStripeWebhook(app, event);
      assert.equal(firstRes.statusCode, 200, firstRes.body);
      const { flushStripeWebhookInbox } = await import("../helpers/fake-payment-provider");
      await flushStripeWebhookInbox(app);
      const dupRes = await sendTestStripeWebhook(app, event);
      assert.equal(dupRes.statusCode, 200, dupRes.body);
      await flushStripeWebhookInbox(app);

      const reconciliation = await prisma.contractReconciliation.findUniqueOrThrow({
        where: { contractId: contract.id },
      });
      const confirmed = await prisma.contractPayment.count({
        where: { purpose: "RECONCILIATION", targetId: reconciliation.id, status: "CONFIRMED" },
      });
      assert.equal(confirmed, 1);
    });

    test("webhook and status poll race settle once", async () => {
      const { contract } = await setup570();
      const started = await startReconciliationPayment(app, token, contract.id);
      const event = payments.buildWebhookEvent({ paymentId: started.payment.id });
      payments.confirm();
      const [webhookRes, pollRes] = await Promise.all([
        sendTestStripeWebhook(app, event),
        confirmPaymentViaStatusToken(app, payments, started.statusToken!),
      ]);
      assert.ok(
        webhookRes.statusCode === 200 || pollRes.status === "CONFIRMED",
        `${webhookRes.body}\n${JSON.stringify(pollRes)}`,
      );
      assert.equal(pollRes.status, "CONFIRMED");

      const reconciliation = await prisma.contractReconciliation.findUniqueOrThrow({
        where: { contractId: contract.id },
      });
      const confirmed = await prisma.contractPayment.count({
        where: { purpose: "RECONCILIATION", targetId: reconciliation.id, status: "CONFIRMED" },
      });
      assert.equal(confirmed, 1);
    });

    test("reconciliation settlement and close race allow one close after payment", async () => {
      const { contract } = await setup570();
      const started = await startReconciliationPayment(app, token, contract.id);
      payments.confirm();
      const [statusRes, closeRes] = await Promise.all([
        confirmPaymentViaStatusToken(app, payments, started.statusToken!),
        app.inject({
          method: "POST",
          url: `/contracts/${contract.id}/close`,
          headers: auth(token),
        }),
      ]);
      assert.equal(statusRes.status, "CONFIRMED");
      if (closeRes.statusCode === 409) {
        const retry = await app.inject({
          method: "POST",
          url: `/contracts/${contract.id}/close`,
          headers: auth(token),
        });
        assert.equal(retry.statusCode, 200, retry.body);
      } else {
        assert.equal(closeRes.statusCode, 200, closeRes.body);
      }
    });

    test("renewal payment race settles once", async () => {
      setPaymentProviderForTests(payments.provider);
      const { renewToken } = await createActiveRenewalToken();
      const renewPay = () =>
        app.inject({
          method: "POST",
          url: `/contracts/renew/${renewToken}/payment`,
          headers: { "content-type": "application/json" },
          payload: "{}",
        });
      const payA = await renewPay();
      const payB = await renewPay();
      assert.equal(payA.statusCode, 200, payA.body);
      assert.equal(payB.statusCode, 200, payB.body);
      const statusToken =
        (payA.json().data.statusToken as string | null | undefined) ??
        (payB.json().data.statusToken as string | null | undefined);
      assert.ok(statusToken, `${payA.body}\n${payB.body}`);

      const pendingRenewal = await prisma.contractRenewal.findFirstOrThrow({
        where: { approvedAt: { not: null }, appliedAt: null },
        orderBy: { createdAt: "desc" },
      });
      const payment = await prisma.contractPayment.findFirstOrThrow({
        where: {
          purpose: "RENEWAL",
          targetId: pendingRenewal.id,
          status: { in: ["PROCESSING", "PENDING"] },
        },
      });

      const event = payments.buildWebhookEvent({ paymentId: payment.id });
      payments.confirm();
      const { flushStripeWebhookInbox } = await import("../helpers/fake-payment-provider");
      await Promise.all([
        sendTestStripeWebhook(app, event),
        confirmPaymentViaStatusToken(app, payments, statusToken),
      ]);
      await flushStripeWebhookInbox(app);

      const renewal = await prisma.contractRenewal.findUniqueOrThrow({
        where: { id: pendingRenewal.id },
      });
      assert.ok(renewal.appliedAt);
      const confirmed = await prisma.contractPayment.count({
        where: { purpose: "RENEWAL", targetId: renewal.id, status: "CONFIRMED" },
      });
      assert.equal(confirmed, 1);
    });

    test("staff manual confirm route is disabled", async () => {
      const { contract } = await setup570();
      const manual = await app.inject({
        method: "POST",
        url: `/contracts/${contract.id}/payment/confirm`,
        headers: auth(token),
        payload: { method: "MANUAL" },
      });
      assert.equal(manual.statusCode, 409);
      assert.equal(manual.json().error.context.reason, "MANUAL_PAYMENT_DISABLED");
    });

    test("historical MANUAL payments remain readable and distinct from Stripe", async () => {
      const { contract } = await setup570();
      const legacy = await prisma.contractPayment.create({
        data: {
          contractId: contract.id,
          purpose: "RENTAL",
          targetId: contract.id,
          amount: 1500,
          currency: "AED",
          method: "MANUAL",
          status: "CONFIRMED",
          confirmedAt: new Date("2020-01-01T00:00:00.000Z"),
        },
      });
      const rows = await prisma.contractPayment.findMany({
        where: { contractId: contract.id, status: "CONFIRMED" },
      });
      assert.ok(rows.some((row) => row.id === legacy.id && row.method === "MANUAL"));
      assert.ok(rows.every((row) => row.id === legacy.id || row.method === "CARD"));
    });

    test("card linking: Stripe-hosted setup session never charges; webhook persists safe metadata only", async () => {
      setPaymentProviderForTests(payments.provider);
      seq += 1;
      const vehicleRes = await app.inject({
        method: "POST",
        url: "/vehicles",
        headers: auth(token),
        payload: { companyId: await testCompanyId(prisma), vehicleName: `SEC-CL-${seq}`, plateNumber: `CL ${run}${seq}`, dailyRate: 400 },
      });
      assert.equal(vehicleRes.statusCode, 201, vehicleRes.body);
      const vId = vehicleRes.json().data.id as number;
      const offerRes = await app.inject({
        method: "POST",
        url: "/contracts/offers",
        headers: auth(token),
        payload: { vehicleId: vId, priceType: "DAILY", rentalDays: 3, agreedAmount: 1500 , collectionMode: "ELECTRONIC"},
      });
      assert.equal(offerRes.statusCode, 201, offerRes.body);
      const contractId = offerRes.json().data.id as string;
      const linkRes = await app.inject({
        method: "POST",
        url: `/contracts/${contractId}/rental-link`,
        headers: auth(token),
      });
      const rentalToken = linkRes.json().data.link.token as string;
      // FORM -> SIGNED happened on the public contract; this test is about card
      // linking after signature, so a direct status promotion keeps it focused.
      await prisma.contract.update({ where: { id: contractId }, data: { status: "SIGNED" } });

      // 1. Starting card linking opens a Stripe-hosted setup session — never a charge.
      const started = await app.inject({
        method: "POST",
        url: `/contracts/rental/${rentalToken}/card-link`,
      });
      assert.equal(started.statusCode, 200, started.body);
      assert.equal(started.json().data.providerAvailable, true);
      assert.ok(started.json().data.checkoutUrl.includes("https://checkout.stripe.com/"));
      const setupRef = payments.refForCardSetup(contractId) ?? payments.provider.lastRef;
      assert.ok(setupRef, "setup session reference exists");
      assert.ok(
        payments.setupSessionFor(setupRef)?.successUrl.includes("setup_session_id={CHECKOUT_SESSION_ID}"),
        "Stripe setup return must carry the Checkout Session id",
      );
      assert.equal(
        await prisma.contractPayment.count({ where: { contractId } }),
        0,
        "linking a card must not create a payment attempt or charge",
      );

      // 2. Stripe completes setup and the browser return validates the Checkout
      // Session server-side before any webhook arrives.
      const event = payments.buildCardSetupWebhookEvent({
        contractId,
        stripeCustomerId: `cus_${run}_link`,
        stripePaymentMethodId: `pm_${run}_link`,
        cardBrand: "visa",
        cardLast4: "4817",
      });
      const returned = await app.inject({
        method: "GET",
        url: `/contracts/rental/${rentalToken}/card-link/return?setupSessionId=${event.providerReference}`,
      });
      assert.equal(returned.statusCode, 200, returned.body);
      assert.equal(returned.json().data.status, "CONFIRMED");
      assert.equal(returned.json().data.cardLast4, "4817");
      const refreshed = await app.inject({
        method: "GET",
        url: `/contracts/rental/${rentalToken}/card-link/return?setupSessionId=${event.providerReference}`,
      });
      assert.equal(refreshed.statusCode, 200, refreshed.body);
      assert.equal(refreshed.json().data.cardLast4, "4817");

      // 3. The webhook converges idempotently on the same safe metadata.
      const webhookRes = await sendTestStripeWebhook(app, event);
      assert.equal(webhookRes.statusCode, 200, webhookRes.body);
      const { flushStripeWebhookInbox } = await import("../helpers/fake-payment-provider");
      await flushStripeWebhookInbox(app);
      const card = await prisma.contractCardPaymentMethod.findUniqueOrThrow({ where: { contractId } });
      assert.equal(card.cardBrand, "visa");
      assert.equal(card.cardLast4, "4817");
      assert.equal(card.stripePaymentMethodId, `pm_${run}_link`);
      assert.equal(card.stripeCustomerId, `cus_${run}_link`);
      const stored = JSON.stringify(card);
      assert.equal(stored.includes("4242424242424242"), false, "no full PAN stored");
      assert.equal(stored.toLowerCase().includes("cvc"), false, "no CVC stored");

      // 4. Public surfaces expose only the masked reference and reload without
      // the generic public error.
      const ctx = await app.inject({ method: "GET", url: `/contracts/rental/${rentalToken}` });
      assert.equal(ctx.statusCode, 200, ctx.body);
      assert.equal(ctx.json().data.payment.cardLast4, "4817");
      assert.equal(ctx.json().data.payment.cardBrand, "visa");
      const official = await app.inject({
        method: "GET",
        url: `/contracts/rental/${rentalToken}/official-contract`,
      });
      assert.equal(official.statusCode, 200, official.body);
      assert.deepEqual(official.json().data.card, { last4: "4817" });
      assert.equal(official.body.includes("stripePaymentMethodId"), false, "no provider reference leaked");
      assert.equal(official.body.includes("4242424242424242"), false, "no full PAN in the contract view");
    });

    test("card linking is blocked before SIGNED and when the provider is unconfigured", async () => {
      seq += 1;
      const vehicleRes = await app.inject({
        method: "POST",
        url: "/vehicles",
        headers: auth(token),
        payload: { companyId: await testCompanyId(prisma), vehicleName: `SEC-CL-${seq}`, plateNumber: `CL ${run}${seq}`, dailyRate: 400 },
      });
      assert.equal(vehicleRes.statusCode, 201, vehicleRes.body);
      const offerRes = await app.inject({
        method: "POST",
        url: "/contracts/offers",
        headers: auth(token),
        payload: { vehicleId: vehicleRes.json().data.id as number, priceType: "DAILY", rentalDays: 3, agreedAmount: 1500 , collectionMode: "ELECTRONIC"},
      });
      assert.equal(offerRes.statusCode, 201, offerRes.body);
      const contractId = offerRes.json().data.id as string;
      const linkRes = await app.inject({
        method: "POST",
        url: `/contracts/${contractId}/rental-link`,
        headers: auth(token),
      });
      const rentalToken = linkRes.json().data.link.token as string;

      // FORM contracts are not allowed to prepare a card yet.
      const early = await app.inject({
        method: "POST",
        url: `/contracts/rental/${rentalToken}/card-link`,
      });
      assert.equal(early.statusCode, 409);
      assert.equal(early.json().error.context.reason, "PAYMENT_NOT_ALLOWED");

      await prisma.contract.update({ where: { id: contractId }, data: { status: "SIGNED" } });
      // Unconfigured provider fails closed: no session, no persisted state.
      setPaymentProviderForTests(new UnconfiguredPaymentProvider());
      const blocked = await app.inject({
        method: "POST",
        url: `/contracts/rental/${rentalToken}/card-link`,
      });
      assert.equal(blocked.statusCode, 409);
      assert.equal(blocked.json().error.context.reason, "PAYMENT_PROVIDER_NOT_CONFIGURED");
      assert.equal(await prisma.contractCardPaymentMethod.count({ where: { contractId } }), 0);
      assert.equal(await prisma.contractPayment.count({ where: { contractId } }), 0);
      setPaymentProviderForTests(payments.provider);
    });
  });
}
