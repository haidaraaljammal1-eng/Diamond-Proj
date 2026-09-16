import { test, before, after, describe } from "node:test";
import assert from "node:assert/strict";
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
import { sendTestStripeWebhook, TEST_STRIPE_WEBHOOK_SIGNATURE } from "../helpers/fake-payment-provider";

const RUN =
  process.env.RUN_INTEGRATION === "true" && Boolean(process.env.TEST_DATABASE_URL);

if (!RUN) {
  test(
    "reconciliation payment integration skipped (set RUN_INTEGRATION=true and TEST_DATABASE_URL)",
    { skip: true },
  );
} else {
  process.env.DATABASE_URL = process.env.TEST_DATABASE_URL!;

  describe("reconciliation payment", { concurrency: false }, () => {
    let app: FastifyInstance;
    let prisma: PrismaClient;
    const run = Date.now().toString(36).toUpperCase();
    const admin = { email: `rcp-admin-${run}@example.test`, password: "rcp-admin-pass-123" };
    let token = "";
    let adminUserId = 0;
    let vehicleId = 0;
    let customerId = 0;
    let seq = 0;
    let payments = installPaymentProvider(run);

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
          authoritativeExternalReference: `RTA-${run}-${seq}`,
          confirmationStatus: "CONFIRMED",
          attributionStatus: "MATCHED",
          collectionStatus: "OPEN",
          attributedContractId: contractId,
          confirmedAt: new Date(),
        },
      });
    }

    async function setup570Contract() {
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

    before(async () => {
      const { env } = await import("src/config/env");
      if (!/haidara_test(?:\?|$)/.test(env.DATABASE_URL)) {
        throw new Error("reconciliation payment tests require haidara_test DATABASE_URL");
      }
      const { buildApp } = await import("src/app");
      app = await buildApp();
      prisma = app.prisma;
      adminUserId = await seedPaymentUser(prisma, admin.email, admin.password, `rcp_admin_${run}`, PAYMENT_PERMS);
      token = await login(app, admin);
      const vehicle = await app.inject({
        method: "POST",
        url: "/vehicles",
        headers: auth(token),
        payload: { vehicleName: `RCP ${run}`, plateNumber: `RCP ${run}`, dailyRate: 400 },
      });
      assert.equal(vehicle.statusCode, 201, vehicle.body);
      vehicleId = vehicle.json().data.id as number;
      customerId = (await prisma.customer.create({ data: { name: `RCP Customer ${run}` } })).id;
    });

    after(async () => {
      setPaymentProviderForTests(undefined);
      await app.close();
    });

    test("approved reconciliation is outstanding until trusted confirmation", async () => {
      const { contract, liability } = await setup570Contract();
      const detail = await app.inject({
        method: "GET",
        url: `/contracts/${contract.id}`,
        headers: auth(token),
      });
      assert.equal(detail.json().data.reconciliation.finalAmount, 570);
      assert.equal(detail.json().data.reconciliation.settled, false);
      assert.equal(detail.json().data.reconciliation.settledAt, null);
      const fresh = await prisma.roadLiability.findUniqueOrThrow({ where: { id: liability.id } });
      assert.equal(fresh.collectionStatus, "OPEN");
    });

    test("close before reconciliation payment is rejected", async () => {
      const { contract } = await setup570Contract();
      const close = await app.inject({
        method: "POST",
        url: `/contracts/${contract.id}/close`,
        headers: auth(token),
      });
      assert.equal(close.statusCode, 409);
      assert.equal(close.json().error.context.reason, "RECONCILIATION_PAYMENT_REQUIRED");
    });

    test("checkout amount snapshot is AED 570 and success redirect alone does not settle", async () => {
      const { contract } = await setup570Contract();
      const started = await startReconciliationPayment(app, token, contract.id);
      assert.equal(started.payment.amount, 570);
      assert.ok(started.checkoutUrl);
      assert.ok(started.statusToken);

      const fakeReturn = await app.inject({
        method: "GET",
        url: `/contracts/payments/status/${started.statusToken}?outcome=success`,
      });
      assert.equal(fakeReturn.statusCode, 200);
      assert.equal(fakeReturn.json().data.status, "PROCESSING");

      const detail = await app.inject({
        method: "GET",
        url: `/contracts/${contract.id}`,
        headers: auth(token),
      });
      assert.equal(detail.json().data.reconciliation.settled, false);
    });

    test("trusted confirmation settles reconciliation and RTA liability", async () => {
      const { contract, liability } = await setup570Contract();
      const started = await startReconciliationPayment(app, token, contract.id);
      const payment = await prisma.contractPayment.findUniqueOrThrow({
        where: { id: started.payment.id },
      });
      assert.equal(payment.amount, 570);
      assert.equal(payment.purpose, "RECONCILIATION");

      await settlePayment(app, payments, payment.id);

      const reconciliation = await prisma.contractReconciliation.findUniqueOrThrow({
        where: { contractId: contract.id },
      });
      assert.ok(reconciliation.settledAt);
      assert.equal(reconciliation.settledPaymentId, payment.id);

      const road = await prisma.roadLiability.findUniqueOrThrow({ where: { id: liability.id } });
      assert.equal(road.collectionStatus, "SETTLED");

      const vehicle = await app.inject({
        method: "GET",
        url: `/vehicles/${vehicleId}`,
        headers: auth(token),
      });
      assert.equal(vehicle.json().data.operationalStatus, "available");
    });

    test("close succeeds after reconciliation settlement", async () => {
      const { contract } = await setup570Contract();
      const started = await startReconciliationPayment(app, token, contract.id);
      await settlePayment(app, payments, started.payment.id);

      const close = await app.inject({
        method: "POST",
        url: `/contracts/${contract.id}/close`,
        headers: auth(token),
      });
      assert.equal(close.statusCode, 200, close.body);
      assert.equal(close.json().data.status, "CLOSED");
      assert.equal(close.json().data.vehicle.operationalStatus, "AVAILABLE");
    });

    test("duplicate webhook cannot collect twice", async () => {
      const { contract } = await setup570Contract();
      const started = await startReconciliationPayment(app, token, contract.id);
      const event = await settlePayment(app, payments, started.payment.id);
      const dup = await sendTestStripeWebhook(app, event);
      assert.equal(dup.statusCode, 200);
      assert.equal(dup.json().data.duplicate, true);

      const reconciliation = await prisma.contractReconciliation.findUniqueOrThrow({
        where: { contractId: contract.id },
      });
      const confirmed = await prisma.contractPayment.findMany({
        where: { purpose: "RECONCILIATION", targetId: reconciliation.id, status: "CONFIRMED" },
      });
      assert.equal(confirmed.length, 1);
    });

    test("duplicate create payment reuses active checkout", async () => {
      const { contract } = await setup570Contract();
      const first = await startReconciliationPayment(app, token, contract.id);
      const second = await startReconciliationPayment(app, token, contract.id);
      assert.equal(second.payment.id, first.payment.id);
      assert.equal(second.checkoutUrl, first.checkoutUrl);
    });

    test("finalAmount zero requires no payment and close succeeds", async () => {
      seq += 1;
      const contract = await seedReviewContract(prisma, {
        run,
        seq,
        vehicleId,
        customerId,
        adminUserId,
        vehicleAvailable: true,
      });
      const rec = await app.inject({
        method: "POST",
        url: `/contracts/${contract.id}/reconcile`,
        headers: auth(token),
        payload: { lines: [{ type: "OTHER", description: "no charge", amount: 0 }] },
      });
      assert.equal(rec.statusCode, 200, rec.body);
      assert.equal(rec.json().data.reconciliation.finalAmount, 0);

      const pay = await app.inject({
        method: "POST",
        url: `/contracts/${contract.id}/reconciliation/payment`,
        headers: auth(token),
      });
      assert.equal(pay.statusCode, 200);
      assert.equal(pay.json().data.noPaymentRequired, true);

      const close = await app.inject({
        method: "POST",
        url: `/contracts/${contract.id}/close`,
        headers: auth(token),
      });
      assert.equal(close.statusCode, 200, close.body);
    });
  });
}
