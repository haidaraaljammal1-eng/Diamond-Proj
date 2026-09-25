import { test, before, after, describe } from "node:test";
import assert from "node:assert/strict";
import type { FastifyInstance } from "fastify";
import type { PrismaClient } from "@prisma/client";
import { companyId as testCompanyId } from "tests/helpers/operating-company";
import { PAYMENT_CONSENT_SCOPE_V2 } from "src/modules/contracts/payment/payment-consent.catalog";
import { setPaymentProviderForTests } from "src/modules/contracts/payment/payment-provider.factory";
import { UnconfiguredPaymentProvider } from "src/modules/contracts/payment/unconfigured-payment.provider";
import { createContractPaymentService } from "src/modules/contracts/payment/contract-payment.service";
import {
  createFakePaymentProvider,
  flushStripeWebhookInbox,
  sendTestStripeWebhook,
} from "../helpers/fake-payment-provider";
import {
  resetStripeAccountKeyCache,
  resolveStripeProviderAccountKey,
} from "src/modules/contracts/payment/stripe-account-identity";

const RUN =
  process.env.RUN_INTEGRATION === "true" && Boolean(process.env.TEST_DATABASE_URL);

if (!RUN) {
  test("road-liability exactly-once integration skipped", { skip: true });
} else {
  process.env.DATABASE_URL = process.env.TEST_DATABASE_URL!;
  process.env.STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY ?? "sk_test_integration_fake";
  process.env.PAYMENT_PROVIDER = "stripe";

  describe("road liability exactly-once financial hardening", { concurrency: false }, () => {
    let app: FastifyInstance;
    let prisma: PrismaClient;
    const run = `EO-${Date.now().toString(36).toUpperCase()}`;
    let adminToken = "";
    let adminUserId = 0;
    let vehicleId = 0;
    let customerId = 0;
    let fakePayments: ReturnType<typeof createFakePaymentProvider>;
    let stripeAccountKey = "test";

    const auth = (token: string) => ({ authorization: `Bearer ${token}` });

    async function seedUser(email: string, password: string, roleKey: string, perms: string[]) {
      const { hashPassword } = await import("src/lib/security/password");
      const { normalizeEmail } = await import("src/lib/security/normalize");
      const canonicalEmail = normalizeEmail(email);
      const role = await prisma.role.upsert({
        where: { key: roleKey },
        update: {},
        create: { key: roleKey, name: roleKey },
      });
      for (const key of perms) {
        const perm = await prisma.permission.upsert({
          where: { key },
          update: {},
          create: { key, category: key.split(".")[0], description: key },
        });
        await prisma.rolePermission.upsert({
          where: { roleId_permissionId: { roleId: role.id, permissionId: perm.id } },
          update: {},
          create: { roleId: role.id, permissionId: perm.id },
        });
      }
      const passwordHash = await hashPassword(password);
      await prisma.user.upsert({
        where: { email: canonicalEmail },
        update: { status: "ACTIVE", passwordHash },
        create: { email: canonicalEmail, name: roleKey, status: "ACTIVE", passwordHash },
      });
      const user = await prisma.user.findUniqueOrThrow({ where: { email: canonicalEmail } });
      await prisma.userRole.upsert({
        where: { userId_roleId: { userId: user.id, roleId: role.id } },
        update: {},
        create: { userId: user.id, roleId: role.id },
      });
      return user.id;
    }

    async function login(email: string, password: string) {
      const res = await app.inject({ method: "POST", url: "/auth/login", payload: { email, password } });
      assert.equal(res.statusCode, 200, res.body);
      return res.json().data.accessToken as string;
    }

    async function seedChargeableLiability(contractId: string, amount = 600) {
      const liability = await prisma.roadLiability.create({
        data: {
          type: "RTA_VIOLATION",
          vehicleId,
          occurredAt: new Date("2026-09-10T12:00:00.000Z"),
          amount,
          currency: "AED",
          authoritativeSourceKey: "RTA",
          authoritativeExternalReference: `RTA-${run}-${Math.random().toString(36).slice(2, 8)}`,
          confirmationStatus: "CONFIRMED",
          attributionStatus: "MATCHED",
          collectionStatus: "OPEN",
          attributedContractId: contractId,
          confirmedAt: new Date(),
        },
      });
      return liability.id;
    }

    async function ensureAuthorization(contractId: string) {
      const existing = await prisma.contractPaymentAuthorization.findUnique({
        where: { contractId },
      });
      if (existing) return existing;

      const profile = await prisma.customerPaymentProfile.upsert({
        where: {
          customerId_provider_providerAccountKey_livemode: {
            customerId,
            provider: "STRIPE",
            providerAccountKey: stripeAccountKey,
            livemode: false,
          },
        },
        update: { providerCustomerId: `cus_test_${run}`, providerAccountKey: stripeAccountKey },
        create: {
          customerId,
          provider: "STRIPE",
          providerAccountKey: stripeAccountKey,
          livemode: false,
          providerCustomerId: `cus_test_${run}`,
        },
      });
      const method = await prisma.customerPaymentMethod.create({
        data: {
          profileId: profile.id,
          providerPaymentMethodId: `pm_test_${run}_${contractId.slice(0, 8)}`,
          cardBrand: "visa",
          cardLast4: "4242",
          status: "ACTIVE",
        },
      });
      const rentalPayment =
        (await prisma.contractPayment.findFirst({
          where: { contractId, purpose: "RENTAL", status: "CONFIRMED" },
        })) ??
        (await prisma.contractPayment.create({
          data: {
            contractId,
            purpose: "RENTAL",
            targetId: contractId,
            amount: 1000,
            currency: "AED",
            method: "CARD",
            status: "CONFIRMED",
            confirmedAt: new Date(),
          },
        }));
      return prisma.contractPaymentAuthorization.create({
        data: {
          contractId,
          customerId,
          customerPaymentMethodId: method.id,
          sourcePaymentId: rentalPayment.id,
          consentVersion: "payment_method_authorization_v2",
          consentLocale: "en",
          consentTextHash: "hash",
          scope: PAYMENT_CONSENT_SCOPE_V2,
          authorizedAt: new Date(),
        },
      });
    }

    async function seedAuthorization(contractId: string) {
      await ensureAuthorization(contractId);
    }

    async function seedElectronicContract(amount = 800) {
      const contract = await prisma.contract.create({
        data: {
          companyId: await testCompanyId(prisma),
          contractNumber: `EO-ELEC-${run}-${Math.random().toString(36).slice(2, 6)}`,
          status: "ACTIVE",
          vehicleId,
          customerId,
          createdByUserId: adminUserId,
          priceType: "DAILY",
          rentalDays: 2,
          durationValue: 2,
          durationUnit: "DAY",
          agreedAmount: amount,
          collectionMode: "ELECTRONIC",
        },
      });
      await seedAuthorization(contract.id);
      return contract;
    }

    async function seedCashContract() {
      const contract = await prisma.contract.create({
        data: {
          companyId: await testCompanyId(prisma),
          contractNumber: `EO-CASH-${run}-${Math.random().toString(36).slice(2, 6)}`,
          status: "ACTIVE",
          vehicleId,
          customerId,
          createdByUserId: adminUserId,
          priceType: "DAILY",
          rentalDays: 2,
          durationValue: 2,
          durationUnit: "DAY",
          agreedAmount: 900,
          collectionMode: "CASH",
        },
      });
      await prisma.contractPayment.create({
        data: {
          contractId: contract.id,
          purpose: "RENTAL",
          targetId: contract.id,
          amount: 900,
          currency: "AED",
          method: "CASH",
          status: "CONFIRMED",
          confirmedAt: new Date(),
        },
      });
      return contract;
    }

    async function assertFinancialSnapshot(
      liabilityId: string,
      contractId: string,
      expected: {
        settlementChannel?: string;
        paymentMethod?: string;
        liabilityStatus?: string;
      } = {},
    ) {
      const liability = await prisma.roadLiability.findUniqueOrThrow({ where: { id: liabilityId } });
      assert.equal(liability.collectionStatus, expected.liabilityStatus ?? "SETTLED");

      const chargeCount = await prisma.roadLiabilityCustomerCharge.count({ where: { roadLiabilityId: liabilityId } });
      assert.equal(chargeCount, 1);
      const charge = await prisma.roadLiabilityCustomerCharge.findUniqueOrThrow({ where: { roadLiabilityId: liabilityId } });
      assert.equal(charge.operationalState, "PAID");
      if (expected.settlementChannel) {
        assert.equal(charge.settlementChannel, expected.settlementChannel);
      }

      const paymentCount = await prisma.contractPayment.count({
        where: { contractId, purpose: "ROAD_LIABILITY" },
      });
      const confirmedCount = await prisma.contractPayment.count({
        where: { contractId, purpose: "ROAD_LIABILITY", status: "CONFIRMED" },
      });
      assert.equal(confirmedCount, 1);

      const confirmed = await prisma.contractPayment.findFirstOrThrow({
        where: { contractId, purpose: "ROAD_LIABILITY", status: "CONFIRMED" },
      });
      if (expected.paymentMethod) {
        assert.equal(confirmed.method, expected.paymentMethod);
      }
      assert.equal(charge.contractPaymentId, confirmed.id);

      const ledgerCount = await prisma.financialLedgerEntry.count({
        where: { contractId, kind: "ROAD_LIABILITY_PAYMENT" },
      });
      assert.equal(ledgerCount, 1);
      const ledger = await prisma.financialLedgerEntry.findFirstOrThrow({
        where: { contractId, kind: "ROAD_LIABILITY_PAYMENT" },
      });
      assert.equal(ledger.dedupeKey, `road-liability:${liabilityId}`);
      assert.equal(ledger.contractPaymentId, confirmed.id);

      const contract = await prisma.contract.findUniqueOrThrow({ where: { id: contractId } });
      assert.equal(contract.status, "ACTIVE");

      return { liability, charge, payment: confirmed, ledger, paymentCount, confirmedCount };
    }

    async function completePaymentLink(liabilityId: string, idem: string) {
      const linkRes = await app.inject({
        method: "POST",
        url: `/road-liabilities/${liabilityId}/collection/payment-link`,
        headers: { ...auth(adminToken), "idempotency-key": idem },
        payload: {},
      });
      assert.equal(linkRes.statusCode, 200, linkRes.body);
      const paymentId = linkRes.json().data.paymentId as string;
      fakePayments.confirm(fakePayments.refForPayment(paymentId)!);
      const event = fakePayments.buildWebhookEvent({ paymentId, status: "CONFIRMED" });
      const webhookRes = await sendTestStripeWebhook(app, event);
      assert.equal(webhookRes.statusCode, 200, webhookRes.body);
      await flushStripeWebhookInbox(app);
      return paymentId;
    }

    before(async () => {
      const { buildApp } = await import("src/app");
      app = await buildApp();
      prisma = app.prisma;
      fakePayments = createFakePaymentProvider(run);
      setPaymentProviderForTests(fakePayments.provider);
      resetStripeAccountKeyCache();
      const { env } = await import("src/config/env");
      const Stripe = (await import("stripe")).default;
      stripeAccountKey = await resolveStripeProviderAccountKey(new Stripe(env.STRIPE_SECRET_KEY!));
      adminUserId = await seedUser(`eo-${run}@test.local`, "pass-12345", `eo_admin_${run}`, [
        "vehicles.manage",
        "violations.read",
        "violations.charge",
      ]);
      adminToken = await login(`eo-${run}@test.local`, "pass-12345");
      const vehicleRes = await app.inject({
        method: "POST",
        url: "/vehicles",
        headers: auth(adminToken),
        payload: {
          companyId: await testCompanyId(prisma),
          vehicleName: `EO ${run}`,
          plateNumber: `EO ${run}`,
          modelYear: 2024,
          color: "White",
        },
      });
      assert.equal(vehicleRes.statusCode, 201, vehicleRes.body);
      vehicleId = vehicleRes.json().data.id;
      const customer = await prisma.customer.create({
        data: { name: "Exactly Once Customer", mobile: "+971500000099" },
      });
      customerId = customer.id;
    });

    after(async () => {
      setPaymentProviderForTests(undefined);
      await app.close();
    });

    test("1. concurrent cash confirms settle exactly once", async () => {
      const contract = await seedCashContract();
      const liabilityId = await seedChargeableLiability(contract.id, 360);
      const [first, second] = await Promise.all([
        app.inject({
          method: "POST",
          url: `/road-liabilities/${liabilityId}/collection/cash/confirm`,
          headers: { ...auth(adminToken), "idempotency-key": `eo-cash-a-${run}` },
          payload: {},
        }),
        app.inject({
          method: "POST",
          url: `/road-liabilities/${liabilityId}/collection/cash/confirm`,
          headers: { ...auth(adminToken), "idempotency-key": `eo-cash-b-${run}` },
          payload: {},
        }),
      ]);
      assert.deepEqual([first.statusCode, second.statusCode].sort(), [200, 409]);
      await assertFinancialSnapshot(liabilityId, contract.id, {
        settlementChannel: "CASH",
        paymentMethod: "CASH",
      });
    });

    test("2. concurrent cash confirm blocks off-session provider I/O", async () => {
      fakePayments.resetOffSessionCallCount();
      const contract = await seedCashContract();
      const liabilityId = await seedChargeableLiability(contract.id, 275);
      const [cashRes, stripeRes] = await Promise.all([
        app.inject({
          method: "POST",
          url: `/road-liabilities/${liabilityId}/collection/cash/confirm`,
          headers: { ...auth(adminToken), "idempotency-key": `eo-cash-stripe-${run}` },
          payload: {},
        }),
        app.inject({
          method: "POST",
          url: `/road-liabilities/${liabilityId}/collection/off-session`,
          headers: { ...auth(adminToken), "idempotency-key": `eo-stripe-cash-${run}` },
          payload: {},
        }),
      ]);
      assert.equal(cashRes.statusCode, 200, cashRes.body);
      assert.equal(stripeRes.statusCode, 422, stripeRes.body);
      assert.equal(fakePayments.getOffSessionCallCount(), 0);
      await assertFinancialSnapshot(liabilityId, contract.id, {
        settlementChannel: "CASH",
        paymentMethod: "CASH",
      });
    });

    test("3. concurrent off-session attempts settle once with single provider call", async () => {
      fakePayments.resetOffSessionCallCount();
      const contract = await seedElectronicContract();
      const liabilityId = await seedChargeableLiability(contract.id, 410);
      const [first, second] = await Promise.all([
        app.inject({
          method: "POST",
          url: `/road-liabilities/${liabilityId}/collection/off-session`,
          headers: { ...auth(adminToken), "idempotency-key": `eo-off-a-${run}` },
          payload: {},
        }),
        app.inject({
          method: "POST",
          url: `/road-liabilities/${liabilityId}/collection/off-session`,
          headers: { ...auth(adminToken), "idempotency-key": `eo-off-b-${run}` },
          payload: {},
        }),
      ]);
      assert.deepEqual([first.statusCode, second.statusCode].sort(), [200, 409]);
      assert.equal(fakePayments.getOffSessionCallCount(), 1);
      const attemptCount = await prisma.contractPaymentOffSessionAttempt.count({
        where: { customerCharge: { roadLiabilityId: liabilityId }, status: "SUCCEEDED" },
      });
      assert.equal(attemptCount, 1);
      await assertFinancialSnapshot(liabilityId, contract.id, {
        settlementChannel: "OFF_SESSION",
        paymentMethod: "CARD",
      });
    });

    test("4a. cash wins concurrent race; payment link rejected on cash contract", async () => {
      fakePayments.resetCheckoutCallCount();
      const contract = await seedCashContract();
      const liabilityId = await seedChargeableLiability(contract.id, 520);
      const [cashRes, linkRes] = await Promise.all([
        app.inject({
          method: "POST",
          url: `/road-liabilities/${liabilityId}/collection/cash/confirm`,
          headers: { ...auth(adminToken), "idempotency-key": `eo-cash-link-a-${run}` },
          payload: {},
        }),
        app.inject({
          method: "POST",
          url: `/road-liabilities/${liabilityId}/collection/payment-link`,
          headers: { ...auth(adminToken), "idempotency-key": `eo-link-cash-a-${run}` },
          payload: {},
        }),
      ]);
      assert.equal(cashRes.statusCode, 200, cashRes.body);
      assert.equal(linkRes.statusCode, 422, linkRes.body);
      assert.equal(linkRes.json().error.context.reason, "ROAD_LIABILITY_CASH_COLLECTION_REQUIRED");
      assert.equal(fakePayments.getCheckoutCallCount(), 0);
      await assertFinancialSnapshot(liabilityId, contract.id, {
        settlementChannel: "CASH",
        paymentMethod: "CASH",
      });
      const charge = await prisma.roadLiabilityCustomerCharge.findUniqueOrThrow({
        where: { roadLiabilityId: liabilityId },
      });
      assert.notEqual(charge.operationalState, "PAYMENT_LINK_READY");
    });

    test("4b. payment link claim on electronic contract blocks subsequent cash confirm", async () => {
      const contract = await seedElectronicContract();
      const liabilityId = await seedChargeableLiability(contract.id, 515);
      const linkRes = await app.inject({
        method: "POST",
        url: `/road-liabilities/${liabilityId}/collection/payment-link`,
        headers: { ...auth(adminToken), "idempotency-key": `eo-link-first-${run}` },
        payload: {},
      });
      assert.equal(linkRes.statusCode, 200, linkRes.body);
      const cashRes = await app.inject({
        method: "POST",
        url: `/road-liabilities/${liabilityId}/collection/cash/confirm`,
        headers: { ...auth(adminToken), "idempotency-key": `eo-cash-after-link-${run}` },
        payload: {},
      });
      assert.equal(cashRes.statusCode, 422, cashRes.body);
      const charge = await prisma.roadLiabilityCustomerCharge.findUniqueOrThrow({ where: { roadLiabilityId: liabilityId } });
      assert.equal(charge.operationalState, "PAYMENT_LINK_READY");
      assert.equal(
        await prisma.contractPayment.count({
          where: { contractId: contract.id, purpose: "ROAD_LIABILITY", status: "CONFIRMED" },
        }),
        0,
      );
    });

    test("5. payment link settlement then cash confirm is rejected", async () => {
      const contract = await seedElectronicContract();
      const liabilityId = await seedChargeableLiability(contract.id, 430);
      await completePaymentLink(liabilityId, `eo-pl-win-${run}`);
      const cashRes = await app.inject({
        method: "POST",
        url: `/road-liabilities/${liabilityId}/collection/cash/confirm`,
        headers: { ...auth(adminToken), "idempotency-key": `eo-cash-after-pl-${run}` },
        payload: {},
      });
      assert.equal(cashRes.statusCode, 422, cashRes.body);
      await assertFinancialSnapshot(liabilityId, contract.id, {
        settlementChannel: "CHECKOUT",
        paymentMethod: "CARD",
      });
    });

    test("cash contract payment-link API is rejected before provider I/O", async () => {
      fakePayments.resetCheckoutCallCount();
      const contract = await seedCashContract();
      const liabilityId = await seedChargeableLiability(contract.id, 505);
      const cap = await app.inject({
        method: "GET",
        url: `/road-liabilities/${liabilityId}/collection`,
        headers: auth(adminToken),
      });
      assert.equal(cap.statusCode, 200, cap.body);
      const capability = cap.json().data.capability;
      assert.equal(capability.cashCollectionRequired, true);
      assert.equal(capability.paymentLinkAvailable, false);
      assert.equal(capability.offSessionAvailable, false);

      const linkRes = await app.inject({
        method: "POST",
        url: `/road-liabilities/${liabilityId}/collection/payment-link`,
        headers: { ...auth(adminToken), "idempotency-key": `eo-cash-block-pl-${run}` },
        payload: {},
      });
      assert.equal(linkRes.statusCode, 422, linkRes.body);
      assert.equal(linkRes.json().error.context.reason, "ROAD_LIABILITY_CASH_COLLECTION_REQUIRED");
      assert.equal(fakePayments.getCheckoutCallCount(), 0);
      assert.equal(
        await prisma.contractPayment.count({
          where: { contractId: contract.id, purpose: "ROAD_LIABILITY" },
        }),
        0,
      );
      const charge = await prisma.roadLiabilityCustomerCharge.findUnique({
        where: { roadLiabilityId: liabilityId },
      });
      assert.equal(charge, null);
    });

    test("electronic contract payment-link rejected when provider is unconfigured", async () => {
      setPaymentProviderForTests(new UnconfiguredPaymentProvider());
      try {
        const contract = await seedElectronicContract();
        const liabilityId = await seedChargeableLiability(contract.id, 508);
        const cap = await app.inject({
          method: "GET",
          url: `/road-liabilities/${liabilityId}/collection`,
          headers: auth(adminToken),
        });
        assert.equal(cap.statusCode, 200, cap.body);
        const capability = cap.json().data.capability;
        assert.equal(capability.cashCollectionRequired, false);
        assert.equal(capability.paymentLinkAvailable, false);
        assert.equal(capability.reasonCode, "PAYMENT_PROVIDER_NOT_CONFIGURED");

        const linkRes = await app.inject({
          method: "POST",
          url: `/road-liabilities/${liabilityId}/collection/payment-link`,
          headers: { ...auth(adminToken), "idempotency-key": `eo-unconfigured-pl-${run}` },
          payload: {},
        });
        assert.equal(linkRes.statusCode, 409, linkRes.body);
        assert.equal(linkRes.json().error.context.reason, "PAYMENT_PROVIDER_NOT_CONFIGURED");
        assert.equal(
          await prisma.contractPayment.count({
            where: { contractId: contract.id, purpose: "ROAD_LIABILITY" },
          }),
          0,
        );
      } finally {
        setPaymentProviderForTests(fakePayments.provider);
      }
    });

    test("electronic contract payment-link succeeds when provider is configured", async () => {
      fakePayments.resetCheckoutCallCount();
      const contract = await seedElectronicContract();
      const liabilityId = await seedChargeableLiability(contract.id, 509);
      const linkRes = await app.inject({
        method: "POST",
        url: `/road-liabilities/${liabilityId}/collection/payment-link`,
        headers: { ...auth(adminToken), "idempotency-key": `eo-configured-pl-${run}` },
        payload: {},
      });
      assert.equal(linkRes.statusCode, 200, linkRes.body);
      assert.equal(fakePayments.getCheckoutCallCount(), 1);
      const charge = await prisma.roadLiabilityCustomerCharge.findUniqueOrThrow({
        where: { roadLiabilityId: liabilityId },
      });
      assert.equal(charge.operationalState, "PAYMENT_LINK_READY");
    });

    test("6. duplicate checkout webhook same stripeEventId is deduped", async () => {
      const contract = await seedElectronicContract();
      const liabilityId = await seedChargeableLiability(contract.id, 390);
      const linkRes = await app.inject({
        method: "POST",
        url: `/road-liabilities/${liabilityId}/collection/payment-link`,
        headers: { ...auth(adminToken), "idempotency-key": `eo-dup-same-${run}` },
        payload: {},
      });
      assert.equal(linkRes.statusCode, 200, linkRes.body);
      const paymentId = linkRes.json().data.paymentId as string;
      fakePayments.confirm(fakePayments.refForPayment(paymentId)!);
      const event = fakePayments.buildWebhookEvent({
        paymentId,
        stripeEventId: `evt_dup_same_${run}`,
        status: "CONFIRMED",
      });
      const first = await sendTestStripeWebhook(app, event);
      const second = await sendTestStripeWebhook(app, event);
      assert.equal(first.statusCode, 200, first.body);
      assert.equal(second.statusCode, 200, second.body);
      await flushStripeWebhookInbox(app);
      await flushStripeWebhookInbox(app);
      const inboxCount = await prisma.stripeWebhookEvent.count({
        where: { stripeEventId: event.stripeEventId },
      });
      assert.equal(inboxCount, 1);
      await assertFinancialSnapshot(liabilityId, contract.id, {
        settlementChannel: "CHECKOUT",
        paymentMethod: "CARD",
      });
    });

    test("7. duplicate checkout success with different stripeEventIds settles once", async () => {
      const contract = await seedElectronicContract();
      const liabilityId = await seedChargeableLiability(contract.id, 395);
      const linkRes = await app.inject({
        method: "POST",
        url: `/road-liabilities/${liabilityId}/collection/payment-link`,
        headers: { ...auth(adminToken), "idempotency-key": `eo-dup-diff-${run}` },
        payload: {},
      });
      assert.equal(linkRes.statusCode, 200, linkRes.body);
      const paymentId = linkRes.json().data.paymentId as string;
      fakePayments.confirm(fakePayments.refForPayment(paymentId)!);
      const eventA = fakePayments.buildWebhookEvent({
        paymentId,
        stripeEventId: `evt_dup_a_${run}`,
        status: "CONFIRMED",
      });
      const eventB = fakePayments.buildWebhookEvent({
        paymentId,
        stripeEventId: `evt_dup_b_${run}`,
        status: "CONFIRMED",
      });
      await sendTestStripeWebhook(app, eventA);
      await sendTestStripeWebhook(app, eventB);
      await flushStripeWebhookInbox(app);
      await flushStripeWebhookInbox(app);
      assert.equal(
        await prisma.stripeWebhookEvent.count({
          where: { stripeEventId: { in: [eventA.stripeEventId, eventB.stripeEventId] } },
        }),
        2,
      );
      await assertFinancialSnapshot(liabilityId, contract.id, {
        settlementChannel: "CHECKOUT",
        paymentMethod: "CARD",
      });
    });

    test("8. late off-session settlement after cash does not double-settle", async () => {
      const contract = await seedCashContract();
      const liabilityId = await seedChargeableLiability(contract.id, 445);
      const cashRes = await app.inject({
        method: "POST",
        url: `/road-liabilities/${liabilityId}/collection/cash/confirm`,
        headers: { ...auth(adminToken), "idempotency-key": `eo-late-cash-${run}` },
        payload: {},
      });
      assert.equal(cashRes.statusCode, 200, cashRes.body);
      const charge = await prisma.roadLiabilityCustomerCharge.findUniqueOrThrow({ where: { roadLiabilityId: liabilityId } });
      const authorization = await ensureAuthorization(contract.id);
      const latePayment = await prisma.contractPayment.create({
        data: {
          contractId: contract.id,
          purpose: "ROAD_LIABILITY",
          targetId: charge.id,
          amount: charge.customerChargeAmount,
          currency: "AED",
          method: "CARD",
          status: "PROCESSING",
          provider: "stripe",
          providerReference: `pi_late_cash_${run}`,
          processingStartedAt: new Date(),
        },
      });
      await prisma.contractPaymentOffSessionAttempt.create({
        data: {
          contractPaymentId: latePayment.id,
          customerChargeId: charge.id,
          authorizationId: authorization.id,
          customerPaymentMethodId: authorization.customerPaymentMethodId,
          provider: "stripe",
          providerAccountKey: stripeAccountKey,
          livemode: false,
          amount: charge.customerChargeAmount,
          currency: "AED",
          idempotencyKey: `diamond:off-session:late-cash:${run}`,
          providerReference: `pi_late_cash_${run}`,
          status: "PROCESSING",
        },
      });
      const payments = createContractPaymentService(prisma);
      await payments.settlePaymentFromProvider(
        latePayment.id,
        "succeeded",
        charge.customerChargeAmount * 100,
        "AED",
      );
      const lateAfter = await prisma.contractPayment.findUniqueOrThrow({ where: { id: latePayment.id } });
      assert.equal(lateAfter.status, "FAILED");
      assert.equal(lateAfter.providerStatus, "provider_collected_after_domain_settlement");
      const attempt = await prisma.contractPaymentOffSessionAttempt.findFirstOrThrow({
        where: { contractPaymentId: latePayment.id },
      });
      assert.equal(attempt.status, "FAILED");
      assert.equal(attempt.failureCode, "LIABILITY_ALREADY_SETTLED");
      await assertFinancialSnapshot(liabilityId, contract.id, {
        settlementChannel: "CASH",
        paymentMethod: "CASH",
      });
    });

    test("9. late off-session settlement after payment link keeps checkout winner", async () => {
      const contract = await seedElectronicContract();
      const liabilityId = await seedChargeableLiability(contract.id, 455);
      const winningPaymentId = await completePaymentLink(liabilityId, `eo-late-pl-${run}`);
      const charge = await prisma.roadLiabilityCustomerCharge.findUniqueOrThrow({ where: { roadLiabilityId: liabilityId } });
      const authorization = await prisma.contractPaymentAuthorization.findUniqueOrThrow({
        where: { contractId: contract.id },
      });
      const latePayment = await prisma.contractPayment.create({
        data: {
          contractId: contract.id,
          purpose: "ROAD_LIABILITY",
          targetId: charge.id,
          amount: charge.customerChargeAmount,
          currency: "AED",
          method: "CARD",
          status: "PROCESSING",
          provider: "stripe",
          providerReference: `pi_late_pl_${run}`,
          processingStartedAt: new Date(),
        },
      });
      await prisma.contractPaymentOffSessionAttempt.create({
        data: {
          contractPaymentId: latePayment.id,
          customerChargeId: charge.id,
          authorizationId: authorization.id,
          customerPaymentMethodId: authorization.customerPaymentMethodId,
          provider: "stripe",
          providerAccountKey: stripeAccountKey,
          livemode: false,
          amount: charge.customerChargeAmount,
          currency: "AED",
          idempotencyKey: `diamond:off-session:late-pl:${run}`,
          providerReference: `pi_late_pl_${run}`,
          status: "PROCESSING",
        },
      });
      const payments = createContractPaymentService(prisma);
      await payments.settlePaymentFromProvider(
        latePayment.id,
        "succeeded",
        charge.customerChargeAmount * 100,
        "AED",
      );
      const chargeAfter = await prisma.roadLiabilityCustomerCharge.findUniqueOrThrow({ where: { roadLiabilityId: liabilityId } });
      assert.equal(chargeAfter.contractPaymentId, winningPaymentId);
      assert.equal(chargeAfter.settlementChannel, "CHECKOUT");
      await assertFinancialSnapshot(liabilityId, contract.id, {
        settlementChannel: "CHECKOUT",
        paymentMethod: "CARD",
      });
    });

    test("10. ambiguous off-session provider outcome blocks competing collection", async () => {
      fakePayments.setOffSessionBehavior({ mode: "processing" });
      const contractElec = await seedElectronicContract();
      const liabilityElecId = await seedChargeableLiability(contractElec.id, 485);
      const offElec = await app.inject({
        method: "POST",
        url: `/road-liabilities/${liabilityElecId}/collection/off-session`,
        headers: { ...auth(adminToken), "idempotency-key": `eo-ambig-e-${run}` },
        payload: {},
      });
      assert.equal(offElec.statusCode, 200, offElec.body);
      assert.equal(offElec.json().data.operationalState, "processing");
      const linkRes = await app.inject({
        method: "POST",
        url: `/road-liabilities/${liabilityElecId}/collection/payment-link`,
        headers: { ...auth(adminToken), "idempotency-key": `eo-link-blocked-${run}` },
        payload: {},
      });
      assert.equal(linkRes.statusCode, 409, linkRes.body);
      const charge = await prisma.roadLiabilityCustomerCharge.findUniqueOrThrow({
        where: { roadLiabilityId: liabilityElecId },
      });
      assert.equal(charge.operationalState, "PROCESSING");
      assert.equal(
        await prisma.contractPayment.count({
          where: { contractId: contractElec.id, purpose: "ROAD_LIABILITY", status: "CONFIRMED" },
        }),
        0,
      );

      const contractCash = await seedCashContract();
      const liabilityCashId = await seedChargeableLiability(contractCash.id, 490);
      await prisma.roadLiabilityCustomerCharge.create({
        data: {
          roadLiabilityId: liabilityCashId,
          contractId: contractCash.id,
          destinationType: "DIRECT_COLLECTION",
          officialAmountSnapshot: 490,
          customerChargeAmount: 490,
          adjustmentAmount: 0,
          confirmedByUserId: adminUserId,
          confirmedAt: new Date(),
          operationalState: "PROCESSING",
        },
      });
      const cashRes = await app.inject({
        method: "POST",
        url: `/road-liabilities/${liabilityCashId}/collection/cash/confirm`,
        headers: { ...auth(adminToken), "idempotency-key": `eo-cash-blocked-${run}` },
        payload: {},
      });
      assert.equal(cashRes.statusCode, 409, cashRes.body);
      fakePayments.resetOffSessionBehavior();
    });

    test("11. MANUAL collection endpoints cannot create new settlement", async () => {
      const contract = await seedElectronicContract();
      const liabilityId = await seedChargeableLiability(contract.id, 505);
      const startRes = await app.inject({
        method: "POST",
        url: `/road-liabilities/${liabilityId}/collection/manual`,
        headers: auth(adminToken),
        payload: {},
      });
      assert.equal(startRes.statusCode, 422, startRes.body);
      assert.equal(startRes.json().error.context.reason, "ROAD_LIABILITY_MANUAL_COLLECTION_NOT_SUPPORTED");

      const charge = await prisma.roadLiabilityCustomerCharge.create({
        data: {
          roadLiabilityId: liabilityId,
          contractId: contract.id,
          destinationType: "DIRECT_COLLECTION",
          officialAmountSnapshot: 505,
          customerChargeAmount: 505,
          adjustmentAmount: 0,
          confirmedByUserId: adminUserId,
          confirmedAt: new Date(),
          operationalState: "MANUAL_PENDING",
          manualCollectionStatus: "PENDING_RECEIPT",
        },
      });
      const confirmRes = await app.inject({
        method: "POST",
        url: `/road-liabilities/${liabilityId}/collection/manual/confirm`,
        headers: auth(adminToken),
        payload: { amount: 505 },
      });
      assert.equal(confirmRes.statusCode, 422, confirmRes.body);
      assert.equal(confirmRes.json().error.context.reason, "ROAD_LIABILITY_MANUAL_COLLECTION_NOT_SUPPORTED");

      const liability = await prisma.roadLiability.findUniqueOrThrow({ where: { id: liabilityId } });
      assert.equal(liability.collectionStatus, "OPEN");
      const chargeAfter = await prisma.roadLiabilityCustomerCharge.findUniqueOrThrow({ where: { id: charge.id } });
      assert.equal(chargeAfter.operationalState, "MANUAL_PENDING");
      assert.equal(chargeAfter.contractPaymentId, null);
      assert.equal(
        await prisma.contractPayment.count({ where: { contractId: contract.id, purpose: "ROAD_LIABILITY" } }),
        0,
      );
      assert.equal(
        await prisma.financialLedgerEntry.count({ where: { contractId: contract.id, kind: "ROAD_LIABILITY_PAYMENT" } }),
        0,
      );
      const afterContract = await prisma.contract.findUniqueOrThrow({ where: { id: contract.id } });
      assert.equal(afterContract.status, "ACTIVE");
    });
  });
}
