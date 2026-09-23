import { test, before, after, describe } from "node:test";
import assert from "node:assert/strict";
import type { FastifyInstance } from "fastify";
import type { PrismaClient } from "@prisma/client";
import { companyId as testCompanyId } from "tests/helpers/operating-company";
import { PAYMENT_CONSENT_SCOPE_V2 } from "src/modules/contracts/payment/payment-consent.catalog";
import { setPaymentProviderForTests } from "src/modules/contracts/payment/payment-provider.factory";
import { createFakePaymentProvider } from "../helpers/fake-payment-provider";
import {
  resetStripeAccountKeyCache,
  resolveStripeProviderAccountKey,
} from "src/modules/contracts/payment/stripe-account-identity";

const RUN =
  process.env.RUN_INTEGRATION === "true" && Boolean(process.env.TEST_DATABASE_URL);

if (!RUN) {
  test("road-liability collection integration skipped", { skip: true });
} else {
  process.env.DATABASE_URL = process.env.TEST_DATABASE_URL!;
  process.env.STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY ?? "sk_test_integration_fake";
  process.env.PAYMENT_PROVIDER = "stripe";

  describe("road liability immediate collection", { concurrency: false }, () => {
    let app: FastifyInstance;
    let prisma: PrismaClient;
    const run = Date.now().toString(36).toUpperCase();
    let adminToken = "";
    let adminUserId = 0;
    let vehicleId = 0;
    let customerId = 0;
    let fakePayments: ReturnType<typeof createFakePaymentProvider>;

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

    const auth = (token: string) => ({ authorization: `Bearer ${token}` });

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

    let stripeAccountKey = "test";

    async function seedAuthorization(contractId: string, withV2Scope = true) {
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
      const payment = await prisma.contractPayment.create({
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
      });
      await prisma.contractPaymentAuthorization.create({
        data: {
          contractId,
          customerId,
          customerPaymentMethodId: method.id,
          sourcePaymentId: payment.id,
          consentVersion: withV2Scope ? "payment_method_authorization_v2" : "payment_method_authorization_v1",
          consentLocale: "en",
          consentTextHash: "hash",
          scope: withV2Scope ? PAYMENT_CONSENT_SCOPE_V2 : "contract_related_future_charges_v1",
          authorizedAt: new Date(),
        },
      });
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
      adminUserId = await seedUser(`rlc5-${run}@test.local`, "pass-12345", `rlc5_admin_${run}`, [
        "vehicles.manage",
        "violations.read",
        "violations.charge",
      ]);
      adminToken = await login(`rlc5-${run}@test.local`, "pass-12345");
      const vehicleRes = await app.inject({
        method: "POST",
        url: "/vehicles",
        headers: auth(adminToken),
        payload: {
          companyId: await testCompanyId(prisma),
          vehicleName: `RL5 ${run}`,
          plateNumber: `RL5 ${run}`,
          modelYear: 2024,
          color: "White",
        },
      });
      assert.equal(vehicleRes.statusCode, 201, vehicleRes.body);
      vehicleId = vehicleRes.json().data.id;
      const customer = await prisma.customer.create({
        data: { name: "Collection Test Customer", mobile: "+971500000001" },
      });
      customerId = customer.id;
    });

    after(async () => {
      setPaymentProviderForTests(undefined);
      await app.close();
    });

    test("ACTIVE contract is immediately collectible with v2 authorization", async () => {
      const contract = await prisma.contract.create({
        data: {
          companyId: await testCompanyId(prisma),
          contractNumber: `RL5-ACT-${run}`,
          status: "ACTIVE",
          vehicleId,
          customerId,
          createdByUserId: adminUserId,
          priceType: "DAILY",
          rentalDays: 2,
          agreedAmount: 800,
          collectionMode: "ELECTRONIC",
        },
      });
      await seedAuthorization(contract.id, true);
      const liabilityId = await seedChargeableLiability(contract.id);

      const cap = await app.inject({
        method: "GET",
        url: `/road-liabilities/${liabilityId}/collection`,
        headers: auth(adminToken),
      });
      assert.equal(cap.statusCode, 200, cap.body);
      const capBody = cap.json().data;
      assert.equal(capBody.capability.offSessionAvailable, true, JSON.stringify(capBody.capability));

      const collect = await app.inject({
        method: "POST",
        url: `/road-liabilities/${liabilityId}/collection/off-session`,
        headers: { ...auth(adminToken), "idempotency-key": `off-${run}-active` },
        payload: {},
      });
      assert.equal(collect.statusCode, 200, collect.body);
      assert.equal(collect.json().data.status, "succeeded");

      const liability = await prisma.roadLiability.findUniqueOrThrow({ where: { id: liabilityId } });
      assert.equal(liability.collectionStatus, "SETTLED");
      const ledger = await prisma.financialLedgerEntry.findFirst({
        where: { kind: "ROAD_LIABILITY_PAYMENT", contractId: contract.id },
      });
      assert.ok(ledger);
      assert.equal(ledger?.amount, 600);
    });

    test("CLOSED late-arrival liability is collectible without reopening contract", async () => {
      const contract = await prisma.contract.create({
        data: {
          companyId: await testCompanyId(prisma),
          contractNumber: `RL5-CLS-${run}`,
          status: "CLOSED",
          vehicleId,
          customerId,
          createdByUserId: adminUserId,
          priceType: "DAILY",
          rentalDays: 2,
          agreedAmount: 800,
          collectionMode: "ELECTRONIC",
        },
      });
      await seedAuthorization(contract.id, true);
      const liabilityId = await seedChargeableLiability(contract.id, 450);

      const collect = await app.inject({
        method: "POST",
        url: `/road-liabilities/${liabilityId}/collection/off-session`,
        headers: { ...auth(adminToken), "idempotency-key": `off-${run}-closed` },
        payload: {},
      });
      assert.equal(collect.statusCode, 200, collect.body);
      const after = await prisma.contract.findUniqueOrThrow({ where: { id: contract.id } });
      assert.equal(after.status, "CLOSED");
    });

    test("historical attribution: violation stays on Contract A when vehicle is on Contract B", async () => {
      const contractA = await prisma.contract.create({
        data: {
          companyId: await testCompanyId(prisma),
          contractNumber: `RL5-A-${run}`,
          status: "CLOSED",
          vehicleId,
          customerId,
          createdByUserId: adminUserId,
          priceType: "DAILY",
          rentalDays: 1,
          agreedAmount: 500,
          collectionMode: "ELECTRONIC",
        },
      });
      const contractB = await prisma.contract.create({
        data: {
          companyId: await testCompanyId(prisma),
          contractNumber: `RL5-B-${run}`,
          status: "ACTIVE",
          vehicleId,
          customerId,
          createdByUserId: adminUserId,
          priceType: "DAILY",
          rentalDays: 1,
          agreedAmount: 500,
          collectionMode: "ELECTRONIC",
        },
      });
      await seedAuthorization(contractA.id, true);
      const liabilityId = await seedChargeableLiability(contractA.id, 300);

      const cap = await app.inject({
        method: "GET",
        url: `/road-liabilities/${liabilityId}/collection`,
        headers: auth(adminToken),
      });
      assert.equal(cap.json().data.charge?.contractNumber, contractA.contractNumber);

      const collect = await app.inject({
        method: "POST",
        url: `/road-liabilities/${liabilityId}/collection/off-session`,
        headers: { ...auth(adminToken), "idempotency-key": `off-${run}-hist` },
        payload: {},
      });
      assert.equal(collect.statusCode, 200, collect.body);

      const ledger = await prisma.financialLedgerEntry.findFirst({
        where: { kind: "ROAD_LIABILITY_PAYMENT", contractId: contractA.id },
      });
      assert.ok(ledger);
      const bPayments = await prisma.contractPayment.count({
        where: { contractId: contractB.id, purpose: "ROAD_LIABILITY" },
      });
      assert.equal(bPayments, 0);
    });

    test("v1 consent scope is ineligible for off-session", async () => {
      const contract = await prisma.contract.create({
        data: {
          companyId: await testCompanyId(prisma),
          contractNumber: `RL5-V1-${run}`,
          status: "ACTIVE",
          vehicleId,
          customerId,
          createdByUserId: adminUserId,
          priceType: "DAILY",
          rentalDays: 1,
          agreedAmount: 500,
          collectionMode: "ELECTRONIC",
        },
      });
      await seedAuthorization(contract.id, false);
      const liabilityId = await seedChargeableLiability(contract.id, 200);
      const cap = await app.inject({
        method: "GET",
        url: `/road-liabilities/${liabilityId}/collection`,
        headers: auth(adminToken),
      });
      assert.equal(cap.json().data.capability.offSessionAvailable, false);
      assert.equal(cap.json().data.capability.reasonCode, "CONSENT_SCOPE_INELIGIBLE");
    });

    async function seedCashContract(status: "ACTIVE" | "CLOSED" | "REVIEW" = "ACTIVE") {
      const companyId = await testCompanyId(prisma);
      const contract = await prisma.contract.create({
        data: {
          companyId,
          contractNumber: `RL5-CASH-${status}-${run}-${Math.random().toString(36).slice(2, 6)}`,
          status,
          vehicleId,
          customerId,
          createdByUserId: adminUserId,
          priceType: "DAILY",
          rentalDays: 2,
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
      return { contract, companyId };
    }

    test("cash contract liability requires cash collection and blocks off-session", async () => {
      const { contract } = await seedCashContract("ACTIVE");
      const liabilityId = await seedChargeableLiability(contract.id, 550);

      const cap = await app.inject({
        method: "GET",
        url: `/road-liabilities/${liabilityId}/collection`,
        headers: auth(adminToken),
      });
      assert.equal(cap.statusCode, 200, cap.body);
      const capability = cap.json().data.capability;
      assert.equal(capability.cashCollectionRequired, true);
      assert.equal(capability.offSessionAvailable, false);
      assert.equal(capability.paymentLinkAvailable, false);

      const offSession = await app.inject({
        method: "POST",
        url: `/road-liabilities/${liabilityId}/collection/off-session`,
        headers: { ...auth(adminToken), "idempotency-key": `off-${run}-cash-block` },
        payload: {},
      });
      assert.equal(offSession.statusCode, 422, offSession.body);
    });

    test("cash liability confirm settles once with CASH payment and ledger", async () => {
      const { contract, companyId } = await seedCashContract("CLOSED");
      const liabilityId = await seedChargeableLiability(contract.id, 480);
      const idem = `cash-${run}-closed`;

      const collect = await app.inject({
        method: "POST",
        url: `/road-liabilities/${liabilityId}/collection/cash/confirm`,
        headers: { ...auth(adminToken), "idempotency-key": idem },
        payload: {},
      });
      assert.equal(collect.statusCode, 200, collect.body);

      const liability = await prisma.roadLiability.findUniqueOrThrow({ where: { id: liabilityId } });
      assert.equal(liability.collectionStatus, "SETTLED");
      const afterContract = await prisma.contract.findUniqueOrThrow({ where: { id: contract.id } });
      assert.equal(afterContract.status, "CLOSED");

      const payment = await prisma.contractPayment.findFirst({
        where: { contractId: contract.id, purpose: "ROAD_LIABILITY", status: "CONFIRMED", method: "CASH" },
      });
      assert.ok(payment);
      assert.equal(payment?.amount, 480);
      assert.equal(payment?.provider, null);

      const ledger = await prisma.financialLedgerEntry.findFirst({
        where: { contractPaymentId: payment!.id, kind: "ROAD_LIABILITY_PAYMENT" },
      });
      assert.ok(ledger);
      assert.equal(ledger?.companyId, companyId);
      assert.equal(ledger?.amount, 480);

      const retry = await app.inject({
        method: "POST",
        url: `/road-liabilities/${liabilityId}/collection/cash/confirm`,
        headers: { ...auth(adminToken), "idempotency-key": idem },
        payload: {},
      });
      assert.equal(retry.statusCode, 200, retry.body);
      const paymentCount = await prisma.contractPayment.count({
        where: { contractId: contract.id, purpose: "ROAD_LIABILITY", status: "CONFIRMED" },
      });
      assert.equal(paymentCount, 1);
    });

    test("cash liability uses attributed contract A when vehicle is on contract B", async () => {
      const { contract: contractA, companyId: companyA } = await seedCashContract("CLOSED");
      const contractB = await prisma.contract.create({
        data: {
          companyId: await testCompanyId(prisma),
          contractNumber: `RL5-CASH-B-${run}`,
          status: "ACTIVE",
          vehicleId,
          customerId,
          createdByUserId: adminUserId,
          priceType: "DAILY",
          rentalDays: 1,
          agreedAmount: 500,
          collectionMode: "ELECTRONIC",
        },
      });
      await seedAuthorization(contractB.id, true);
      const liabilityId = await seedChargeableLiability(contractA.id, 320);

      const collect = await app.inject({
        method: "POST",
        url: `/road-liabilities/${liabilityId}/collection/cash/confirm`,
        headers: { ...auth(adminToken), "idempotency-key": `cash-${run}-hist` },
        payload: {},
      });
      assert.equal(collect.statusCode, 200, collect.body);

      const payment = await prisma.contractPayment.findFirst({
        where: { contractId: contractA.id, purpose: "ROAD_LIABILITY", status: "CONFIRMED" },
      });
      assert.ok(payment);
      const ledger = await prisma.financialLedgerEntry.findFirst({
        where: { contractPaymentId: payment!.id },
      });
      assert.equal(ledger?.companyId, companyA);
      const bPayments = await prisma.contractPayment.count({
        where: { contractId: contractB.id, purpose: "ROAD_LIABILITY" },
      });
      assert.equal(bPayments, 0);
    });

    test("concurrent cash confirms settle exactly once", async () => {
      const { contract } = await seedCashContract("ACTIVE");
      const liabilityId = await seedChargeableLiability(contract.id, 360);
      const contractBefore = await prisma.contract.findUniqueOrThrow({ where: { id: contract.id } });
      const [first, second] = await Promise.all([
        app.inject({
          method: "POST",
          url: `/road-liabilities/${liabilityId}/collection/cash/confirm`,
          headers: { ...auth(adminToken), "idempotency-key": `cash-race-a-${run}` },
          payload: {},
        }),
        app.inject({
          method: "POST",
          url: `/road-liabilities/${liabilityId}/collection/cash/confirm`,
          headers: { ...auth(adminToken), "idempotency-key": `cash-race-b-${run}` },
          payload: {},
        }),
      ]);
      const statuses = [first.statusCode, second.statusCode].sort();
      assert.deepEqual(statuses, [200, 409], `${first.body}\n${second.body}`);
      const paymentCount = await prisma.contractPayment.count({
        where: { contractId: contract.id, purpose: "ROAD_LIABILITY", status: "CONFIRMED", method: "CASH" },
      });
      assert.equal(paymentCount, 1);
      const ledgerCount = await prisma.financialLedgerEntry.count({
        where: { contractId: contract.id, kind: "ROAD_LIABILITY_PAYMENT" },
      });
      assert.equal(ledgerCount, 1);
      const charge = await prisma.roadLiabilityCustomerCharge.findUniqueOrThrow({ where: { roadLiabilityId: liabilityId } });
      assert.equal(charge.operationalState, "PAID");
      assert.equal(charge.settlementChannel, "CASH");
      const liability = await prisma.roadLiability.findUniqueOrThrow({ where: { id: liabilityId } });
      assert.equal(liability.collectionStatus, "SETTLED");
      const contractAfter = await prisma.contract.findUniqueOrThrow({ where: { id: contract.id } });
      assert.equal(contractAfter.status, contractBefore.status);
    });

    test("concurrent cash confirm beats off-session on cash contract", async () => {
      fakePayments.resetOffSessionCallCount();
      const { contract } = await seedCashContract("ACTIVE");
      const liabilityId = await seedChargeableLiability(contract.id, 275);
      const [cashRes, stripeRes] = await Promise.all([
        app.inject({
          method: "POST",
          url: `/road-liabilities/${liabilityId}/collection/cash/confirm`,
          headers: { ...auth(adminToken), "idempotency-key": `cash-vs-stripe-${run}` },
          payload: {},
        }),
        app.inject({
          method: "POST",
          url: `/road-liabilities/${liabilityId}/collection/off-session`,
          headers: { ...auth(adminToken), "idempotency-key": `off-vs-cash-${run}` },
          payload: {},
        }),
      ]);
      assert.equal(cashRes.statusCode, 200, cashRes.body);
      assert.equal(stripeRes.statusCode, 422, stripeRes.body);
      const liability = await prisma.roadLiability.findUniqueOrThrow({ where: { id: liabilityId } });
      assert.equal(liability.collectionStatus, "SETTLED");
      const paymentCount = await prisma.contractPayment.count({
        where: { contractId: contract.id, purpose: "ROAD_LIABILITY", status: "CONFIRMED" },
      });
      assert.equal(paymentCount, 1);
      assert.equal(
        (await prisma.contractPayment.findFirst({
          where: { contractId: contract.id, purpose: "ROAD_LIABILITY", status: "CONFIRMED" },
        }))?.method,
        "CASH",
      );
      assert.equal(fakePayments.getOffSessionCallCount(), 0);
      const charge = await prisma.roadLiabilityCustomerCharge.findUniqueOrThrow({ where: { roadLiabilityId: liabilityId } });
      assert.equal(charge.operationalState, "PAID");
      assert.equal(charge.settlementChannel, "CASH");
      const ledgerCount = await prisma.financialLedgerEntry.count({
        where: { contractId: contract.id, kind: "ROAD_LIABILITY_PAYMENT" },
      });
      assert.equal(ledgerCount, 1);
    });

    test("concurrent off-session attempts settle electronic liability once", async () => {
      fakePayments.resetOffSessionCallCount();
      const contract = await prisma.contract.create({
        data: {
          companyId: await testCompanyId(prisma),
          contractNumber: `RL5-RACE-${run}`,
          status: "ACTIVE",
          vehicleId,
          customerId,
          createdByUserId: adminUserId,
          priceType: "DAILY",
          rentalDays: 1,
          agreedAmount: 500,
          collectionMode: "ELECTRONIC",
        },
      });
      await seedAuthorization(contract.id, true);
      const liabilityId = await seedChargeableLiability(contract.id, 410);
      const [first, second] = await Promise.all([
        app.inject({
          method: "POST",
          url: `/road-liabilities/${liabilityId}/collection/off-session`,
          headers: { ...auth(adminToken), "idempotency-key": `off-race-a-${run}` },
          payload: {},
        }),
        app.inject({
          method: "POST",
          url: `/road-liabilities/${liabilityId}/collection/off-session`,
          headers: { ...auth(adminToken), "idempotency-key": `off-race-b-${run}` },
          payload: {},
        }),
      ]);
      const statuses = [first.statusCode, second.statusCode].sort();
      assert.deepEqual(statuses, [200, 409], `${first.body}\n${second.body}`);
      const paymentCount = await prisma.contractPayment.count({
        where: { contractId: contract.id, purpose: "ROAD_LIABILITY", status: "CONFIRMED" },
      });
      assert.equal(paymentCount, 1);
      const ledgerCount = await prisma.financialLedgerEntry.count({
        where: { contractId: contract.id, kind: "ROAD_LIABILITY_PAYMENT" },
      });
      assert.equal(ledgerCount, 1);
      assert.equal(fakePayments.getOffSessionCallCount(), 1);
      const attemptCount = await prisma.contractPaymentOffSessionAttempt.count({
        where: { customerCharge: { roadLiabilityId: liabilityId }, status: "SUCCEEDED" },
      });
      assert.equal(attemptCount, 1);
      const charge = await prisma.roadLiabilityCustomerCharge.findUniqueOrThrow({ where: { roadLiabilityId: liabilityId } });
      assert.equal(charge.operationalState, "PAID");
      assert.equal(charge.settlementChannel, "OFF_SESSION");
      const liability = await prisma.roadLiability.findUniqueOrThrow({ where: { id: liabilityId } });
      assert.equal(liability.collectionStatus, "SETTLED");
    });
  });
}
