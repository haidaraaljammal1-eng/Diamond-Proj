import { test, before, after, describe } from "node:test";
import assert from "node:assert/strict";
import type { FastifyInstance } from "fastify";
import type { PrismaClient } from "@prisma/client";
import { setPaymentProviderForTests } from "src/modules/contracts/payment/payment-provider.factory";
import {
  auth,
  installPaymentProvider,
  login,
  PAYMENT_PERMS,
  seedPaymentUser,
  seedReviewContract,
} from "../helpers/payment-integration-helpers";
import {
  confirmPaymentViaWebhook,
  flushStripeWebhookInbox,
  sendTestStripeWebhook,
} from "../helpers/fake-payment-provider";
import { companyId as testCompanyId } from "tests/helpers/operating-company";

const RUN =
  process.env.RUN_INTEGRATION === "true" && Boolean(process.env.TEST_DATABASE_URL);

if (!RUN) {
  test(
    "reconciliation cash integration skipped (set RUN_INTEGRATION=true and TEST_DATABASE_URL)",
    { skip: true },
  );
} else {
  process.env.DATABASE_URL = process.env.TEST_DATABASE_URL!;

  describe("reconciliation cash settlement", { concurrency: false }, () => {
    let app: FastifyInstance;
    let prisma: PrismaClient;
    const run = Date.now().toString(36).toUpperCase();
    const admin = { email: `rcc-admin-${run}@example.test`, password: "rcc-admin-pass-123" };
    let token = "";
    let adminUserId = 0;
    let vehicleId = 0;
    let customerId = 0;
    let seq = 0;
    const payments = installPaymentProvider(run);

    async function seedPositiveReview(vehicleStatus: "AVAILABLE" | "RENTED" = "AVAILABLE") {
      seq += 1;
      const contract = await seedReviewContract(prisma, {
        run,
        seq,
        vehicleId,
        customerId,
        adminUserId,
        vehicleAvailable: true,
      });
      if (vehicleStatus === "RENTED") {
        await prisma.vehicle.update({
          where: { id: vehicleId },
          data: { operationalStatus: "RENTED" },
        });
      }
      const rec = await app.inject({
        method: "POST",
        url: `/contracts/${contract.id}/reconcile`,
        headers: auth(token),
        payload: { lines: [{ type: "DAMAGE", description: "scratch", amount: 150 }] },
      });
      assert.equal(rec.statusCode, 200, rec.body);
      assert.equal(rec.json().data.reconciliation.finalAmount, 150);
      assert.equal(rec.json().data.reconciliation.finalizedAt, null);
      return contract;
    }

    async function cashSettle(contractId: string, key?: string) {
      return app.inject({
        method: "POST",
        url: `/contracts/${contractId}/reconciliation/cash/settle`,
        headers: {
          ...auth(token),
          ...(key ? { "idempotency-key": key } : {}),
        },
      });
    }

    async function ledgerCount(contractId: string) {
      return prisma.financialLedgerEntry.count({
        where: { contractId, kind: "RECONCILIATION_PAYMENT" },
      });
    }

    before(async () => {
      const { env } = await import("src/config/env");
      if (!/haidara_test(?:\?|$)/.test(env.DATABASE_URL)) {
        throw new Error("reconciliation cash tests require haidara_test DATABASE_URL");
      }
      const { buildApp } = await import("src/app");
      app = await buildApp();
      prisma = app.prisma;
      adminUserId = await seedPaymentUser(prisma, admin.email, admin.password, `rcc_admin_${run}`, PAYMENT_PERMS);
      token = await login(app, admin);
      const vehicle = await app.inject({
        method: "POST",
        url: "/vehicles",
        headers: auth(token),
        payload: { companyId: await testCompanyId(prisma), vehicleName: `RCC ${run}`, plateNumber: `RCC ${run}`, dailyRate: 400 },
      });
      assert.equal(vehicle.statusCode, 201, vehicle.body);
      vehicleId = vehicle.json().data.id as number;
      customerId = (await prisma.customer.create({ data: { name: `RCC Customer ${run}` } })).id;
    });

    after(async () => {
      setPaymentProviderForTests(undefined);
      await app.close();
    });

    test("draft positive cash finalizes, settles once, and closes without vehicle mutation", async () => {
      const contract = await seedPositiveReview("RENTED");
      const settled = await cashSettle(contract.id);
      assert.equal(settled.statusCode, 200, settled.body);
      assert.equal(settled.json().data.status, "CLOSED");

      const reconciliation = await prisma.contractReconciliation.findUniqueOrThrow({
        where: { contractId: contract.id },
      });
      assert.ok(reconciliation.finalizedAt);
      assert.ok(reconciliation.settledAt);
      assert.ok(reconciliation.settledPaymentId);

      const payment = await prisma.contractPayment.findUniqueOrThrow({
        where: { id: reconciliation.settledPaymentId! },
      });
      assert.equal(payment.purpose, "RECONCILIATION");
      assert.equal(payment.method, "CASH");
      assert.equal(payment.status, "CONFIRMED");
      assert.equal(payment.provider, null);
      assert.equal(payment.amount, 150);
      assert.equal(await ledgerCount(contract.id), 1);

      const vehicle = await prisma.vehicle.findUniqueOrThrow({ where: { id: vehicleId } });
      assert.equal(vehicle.operationalStatus, "RENTED");
    });

    test("GET reconciliation after cash settle returns historical read without 409", async () => {
      const contract = await seedPositiveReview();
      const settled = await cashSettle(contract.id);
      assert.equal(settled.statusCode, 200, settled.body);
      assert.equal(settled.json().data.status, "CLOSED");

      const getRec = await app.inject({
        method: "GET",
        url: `/contracts/${contract.id}/reconciliation`,
        headers: auth(token),
      });
      assert.equal(getRec.statusCode, 200, getRec.body);
      assert.equal(getRec.json().data.contract.status, "CLOSED");
      assert.equal(getRec.json().data.reconciliation.settled, true);
      assert.equal(getRec.json().data.totals.finalAmount, 150);
    });

    test("CLOSED reconciliation GET is read-only and does not create another shell", async () => {
      const contract = await seedPositiveReview();
      await cashSettle(contract.id);
      const shellsBefore = await prisma.contractReconciliation.count({ where: { contractId: contract.id } });
      assert.equal(shellsBefore, 1);

      const getRec = await app.inject({
        method: "GET",
        url: `/contracts/${contract.id}/reconciliation`,
        headers: auth(token),
      });
      assert.equal(getRec.statusCode, 200, getRec.body);

      const shellsAfter = await prisma.contractReconciliation.count({ where: { contractId: contract.id } });
      assert.equal(shellsAfter, 1);
      const closed = await prisma.contract.findUniqueOrThrow({ where: { id: contract.id } });
      assert.equal(closed.status, "CLOSED");
    });

    test("REVIEW reconciliation GET still ensures shell when missing", async () => {
      seq += 1;
      const contract = await seedReviewContract(prisma, {
        run,
        seq,
        vehicleId,
        customerId,
        adminUserId,
        vehicleAvailable: true,
      });
      assert.equal(
        await prisma.contractReconciliation.count({ where: { contractId: contract.id } }),
        0,
      );

      const getRec = await app.inject({
        method: "GET",
        url: `/contracts/${contract.id}/reconciliation`,
        headers: auth(token),
      });
      assert.equal(getRec.statusCode, 200, getRec.body);
      assert.equal(getRec.json().data.contract.status, "REVIEW");
      assert.equal(getRec.json().data.totals.finalAmount, 0);
      assert.equal(
        await prisma.contractReconciliation.count({ where: { contractId: contract.id } }),
        1,
      );
    });

    test("finalized unpaid cash succeeds and finalizedAt alone does not block it", async () => {
      const contract = await seedPositiveReview();
      const fin = await app.inject({
        method: "POST",
        url: `/contracts/${contract.id}/reconciliation/finalize`,
        headers: auth(token),
      });
      assert.equal(fin.statusCode, 200, fin.body);
      assert.equal(fin.json().data.status, "REVIEW");
      assert.ok(fin.json().data.reconciliation.finalizedAt);
      assert.equal(fin.json().data.reconciliation.settledAt, null);

      const settled = await cashSettle(contract.id);
      assert.equal(settled.statusCode, 200, settled.body);
      assert.equal(settled.json().data.status, "CLOSED");
      const reconciliation = await prisma.contractReconciliation.findUniqueOrThrow({
        where: { contractId: contract.id },
      });
      assert.ok(reconciliation.settledAt);
      assert.equal(await ledgerCount(contract.id), 1);
    });

    test("duplicate cash confirm does not create a second payment, ledger row, or close", async () => {
      const contract = await seedPositiveReview();
      const key = `cash-${contract.id}`;
      const first = await cashSettle(contract.id, key);
      assert.equal(first.statusCode, 200, first.body);
      const second = await cashSettle(contract.id, key);
      assert.equal(second.statusCode, 200, second.body);
      const third = await cashSettle(contract.id, `${key}-other`);
      assert.equal(third.statusCode, 200, third.body);

      const reconciliation = await prisma.contractReconciliation.findUniqueOrThrow({
        where: { contractId: contract.id },
      });
      const confirmed = await prisma.contractPayment.findMany({
        where: { purpose: "RECONCILIATION", targetId: reconciliation.id, status: "CONFIRMED" },
      });
      assert.equal(confirmed.length, 1);
      assert.equal(await ledgerCount(contract.id), 1);
      const closes = await prisma.domainOutboxEvent.count({
        where: { aggregateId: contract.id, eventType: "contract.closed" },
      });
      assert.equal(closes, 1);
    });

    test("unresolved road liability blocks cash", async () => {
      const contract = await seedPositiveReview();
      seq += 1;
      await prisma.roadLiability.create({
        data: {
          type: "RTA_VIOLATION",
          vehicleId,
          occurredAt: new Date("2026-09-02T12:00:00.000Z"),
          amount: 100,
          currency: "AED",
          authoritativeSourceKey: "RTA",
          authoritativeExternalReference: `RTA-CASH-${run}-${seq}`,
          confirmationStatus: "CONFIRMED",
          attributionStatus: "MATCHED",
          collectionStatus: "OPEN",
          attributedContractId: contract.id,
          confirmedAt: new Date(),
        },
      });
      const settled = await cashSettle(contract.id);
      assert.equal(settled.statusCode, 409, settled.body);
      assert.equal(settled.json().error.context.reason, "ROAD_LIABILITIES_REVIEW_REQUIRED");
      const row = await prisma.contract.findUniqueOrThrow({ where: { id: contract.id } });
      assert.equal(row.status, "REVIEW");
    });

    test("link without checkout is revoked and cash closes the contract", async () => {
      const contract = await seedPositiveReview();
      const link = await app.inject({
        method: "POST",
        url: `/contracts/${contract.id}/reconciliation/link`,
        headers: auth(token),
      });
      assert.equal(link.statusCode, 200, link.body);
      const rawToken = link.json().data.link.token as string;
      const before = await prisma.contract.findUniqueOrThrow({ where: { id: contract.id } });
      assert.equal(before.status, "REVIEW");

      const settled = await cashSettle(contract.id);
      assert.equal(settled.statusCode, 200, settled.body);
      assert.equal(settled.json().data.status, "CLOSED");

      const links = await prisma.contractLink.findMany({
        where: { contractId: contract.id, type: "RECONCILIATION" },
      });
      assert.ok(links.length >= 1);
      assert.ok(links.every((row) => row.revokedAt));

      const publicGet = await app.inject({
        method: "GET",
        url: `/contracts/reconciliation/${rawToken}`,
      });
      assert.equal(publicGet.statusCode, 401, publicGet.body);
      assert.equal(publicGet.json().error.context.reason, "CONTRACT_LINK_INVALID");
      const publicPay = await app.inject({
        method: "POST",
        url: `/contracts/reconciliation/${rawToken}/payment`,
        payload: {},
      });
      assert.equal(publicPay.statusCode, 401, publicPay.body);
      assert.equal(publicPay.json().error.context.reason, "CONTRACT_LINK_INVALID");
    });

    test("active checkout is expired before cash and a later webhook cannot collect again", async () => {
      const contract = await seedPositiveReview();
      const started = await app.inject({
        method: "POST",
        url: `/contracts/${contract.id}/reconciliation/payment`,
        headers: auth(token),
      });
      assert.equal(started.statusCode, 200, started.body);
      const cardPaymentId = started.json().data.payment.id as string;
      const providerReference = payments.refForPayment(cardPaymentId);
      assert.ok(providerReference);

      payments.blockCheckoutExpire(true);
      const blocked = await cashSettle(contract.id);
      assert.equal(blocked.statusCode, 409, blocked.body);
      assert.equal(blocked.json().error.context.reason, "ELECTRONIC_COLLECTION_ACTIVE");
      const stillReview = await prisma.contract.findUniqueOrThrow({ where: { id: contract.id } });
      assert.equal(stillReview.status, "REVIEW");
      const stillProcessing = await prisma.contractPayment.findUniqueOrThrow({ where: { id: cardPaymentId } });
      assert.equal(stillProcessing.status, "PROCESSING");

      payments.blockCheckoutExpire(false);
      const settled = await cashSettle(contract.id);
      assert.equal(settled.statusCode, 200, settled.body);
      assert.equal(settled.json().data.status, "CLOSED");

      const expired = await payments.provider.getPaymentStatus(providerReference!);
      assert.equal(expired.status, "EXPIRED");
      const card = await prisma.contractPayment.findUniqueOrThrow({ where: { id: cardPaymentId } });
      assert.equal(card.status, "CANCELLED");

      const event = payments.buildWebhookEvent({
        paymentId: cardPaymentId,
        providerReference: providerReference!,
        status: "CONFIRMED",
      });
      payments.confirm(providerReference!);
      const webhook = await sendTestStripeWebhook(app, event);
      assert.equal(webhook.statusCode, 200, webhook.body);
      await flushStripeWebhookInbox(app);

      const reconciliation = await prisma.contractReconciliation.findUniqueOrThrow({
        where: { contractId: contract.id },
      });
      const confirmed = await prisma.contractPayment.findMany({
        where: { purpose: "RECONCILIATION", targetId: reconciliation.id, status: "CONFIRMED" },
      });
      assert.equal(confirmed.length, 1);
      assert.equal(confirmed[0]?.method, "CASH");
      assert.equal(await ledgerCount(contract.id), 1);
      const closed = await prisma.contract.findUniqueOrThrow({ where: { id: contract.id } });
      assert.equal(closed.status, "CLOSED");
      assert.equal(
        await confirmPaymentViaWebhook(app, payments, cardPaymentId).then(() => ledgerCount(contract.id)),
        1,
      );
    });
  });
}
