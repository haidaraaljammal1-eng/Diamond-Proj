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
  settlePayment,
} from "../helpers/payment-integration-helpers";
import { sendTestStripeWebhook } from "../helpers/fake-payment-provider";
import { companyId as testCompanyId } from "tests/helpers/operating-company";

const RUN =
  process.env.RUN_INTEGRATION === "true" && Boolean(process.env.TEST_DATABASE_URL);

if (!RUN) {
  test(
    "post-close payment integration skipped (set RUN_INTEGRATION=true and TEST_DATABASE_URL)",
    { skip: true },
  );
} else {
  process.env.DATABASE_URL = process.env.TEST_DATABASE_URL!;

  describe("post-close receivable payment", { concurrency: false }, () => {
    let app: FastifyInstance;
    let prisma: PrismaClient;
    const run = Date.now().toString(36).toUpperCase();
    const admin = { email: `pcp-admin-${run}@example.test`, password: "pcp-admin-pass-123" };
    let token = "";
    let adminUserId = 0;
    let vehicleId = 0;
    let customerId = 0;
    let seq = 0;
    let payments = installPaymentProvider(run);

    async function seedClosedWithReceivable() {
      seq += 1;
      const vehicleBefore = await prisma.vehicle.findUniqueOrThrow({ where: { id: vehicleId } });
      const contract = await prisma.contract.create({
        data: {
          companyId: await testCompanyId(prisma),
          contractNumber: `PCP-${run}-${seq}`,
          status: "CLOSED",
          vehicleId,
          customerId,
          createdByUserId: adminUserId,
          priceType: "DAILY",
          rentalDays: 2,
          agreedAmount: 800,
          closedAt: new Date("2026-09-04T12:00:00.000Z"),
          carOut: {
            create: {
              performedByUserId: adminUserId,
              occurredAt: new Date("2026-09-01T08:00:00.000Z"),
              mileageOut: 10,
              fuelOut: "F",
            },
          },
          carIn: {
            create: {
              occurredAt: new Date("2026-09-04T08:00:00.000Z"),
              mileageIn: 40,
              fuelIn: "1/2",
            },
          },
          reconciliation: {
            create: {
              chargesTotal: 350,
              depositAmount: 0,
              deductions: 0,
              finalAmount: 350,
              approvedAt: new Date("2026-09-04T11:00:00.000Z"),
              settledAt: new Date("2026-09-04T11:30:00.000Z"),
              lines: {
                create: { type: "DAMAGE", description: "scuff", amount: 350 },
              },
            },
          },
        },
        include: { reconciliation: true },
      });

      const liability = await prisma.roadLiability.create({
        data: {
          type: "RTA_VIOLATION",
          vehicleId,
          occurredAt: new Date("2026-09-02T12:00:00.000Z"),
          amount: 100,
          currency: "AED",
          authoritativeSourceKey: "RTA",
          authoritativeExternalReference: `RTA-PCP-${run}-${seq}`,
          confirmationStatus: "CONFIRMED",
          attributionStatus: "MATCHED",
          collectionStatus: "OPEN",
          attributedContractId: contract.id,
          confirmedAt: new Date(),
        },
      });

      const charge = await app.inject({
        method: "POST",
        url: `/road-liabilities/${liability.id}/customer-charge/confirm`,
        headers: auth(token),
        payload: { customerChargeAmount: 120, adjustmentReason: "Administration fee" },
      });
      assert.equal(charge.statusCode, 200, charge.body);
      const receivableId = charge.json().data.postCloseReceivableId as string;
      assert.ok(receivableId);

      return { contract, liability, receivableId, vehicleBefore, reconciliation: contract.reconciliation! };
    }

    before(async () => {
      const { env } = await import("src/config/env");
      if (!/haidara_test(?:\?|$)/.test(env.DATABASE_URL)) {
        throw new Error("post-close payment tests require haidara_test DATABASE_URL");
      }
      const { buildApp } = await import("src/app");
      app = await buildApp();
      prisma = app.prisma;
      adminUserId = await seedPaymentUser(prisma, admin.email, admin.password, `pcp_admin_${run}`, PAYMENT_PERMS);
      token = await login(app, admin);
      const vehicle = await app.inject({
        method: "POST",
        url: "/vehicles",
        headers: auth(token),
        payload: { companyId: await testCompanyId(prisma), vehicleName: `PCP ${run}`, plateNumber: `PCP ${run}`, dailyRate: 400 },
      });
      assert.equal(vehicle.statusCode, 201, vehicle.body);
      vehicleId = vehicle.json().data.id as number;
      await prisma.vehicle.update({
        where: { id: vehicleId },
        data: { operationalStatus: "AVAILABLE" },
      });
      customerId = (await prisma.customer.create({ data: { name: `PCP Customer ${run}` } })).id;
    });

    after(async () => {
      setPaymentProviderForTests(undefined);
      await app.close();
    });

    test("OPEN receivable creates server-derived 120 AED checkout", async () => {
      const { contract, receivableId } = await seedClosedWithReceivable();
      const started = await app.inject({
        method: "POST",
        url: `/contracts/${contract.id}/post-close-receivables/${receivableId}/payment`,
        headers: auth(token),
      });
      assert.equal(started.statusCode, 200, started.body);
      assert.equal(started.json().data.payment.amount, 120);
      assert.equal(started.json().data.payment.purpose, "POST_CLOSE_RECEIVABLE");
      assert.ok(started.json().data.checkoutUrl);
    });

    test("contract, vehicle, reconciliation, and official RTA amount remain unchanged before settlement", async () => {
      const { contract, liability, receivableId, vehicleBefore, reconciliation } =
        await seedClosedWithReceivable();
      await app.inject({
        method: "POST",
        url: `/contracts/${contract.id}/post-close-receivables/${receivableId}/payment`,
        headers: auth(token),
      });

      const detail = await app.inject({
        method: "GET",
        url: `/contracts/${contract.id}`,
        headers: auth(token),
      });
      assert.equal(detail.json().data.status, "CLOSED");
      assert.equal(detail.json().data.reconciliation.chargesTotal, reconciliation.chargesTotal);
      assert.equal(detail.json().data.reconciliation.finalAmount, reconciliation.finalAmount);

      const vehicle = await prisma.vehicle.findUniqueOrThrow({ where: { id: vehicleId } });
      assert.equal(vehicle.operationalStatus, vehicleBefore.operationalStatus);

      const road = await prisma.roadLiability.findUniqueOrThrow({ where: { id: liability.id } });
      assert.equal(road.amount, 100);
      assert.equal(road.collectionStatus, "OPEN");
    });

    test("trusted confirmation settles receivable and road liability", async () => {
      const { contract, liability, receivableId } = await seedClosedWithReceivable();
      const started = await app.inject({
        method: "POST",
        url: `/contracts/${contract.id}/post-close-receivables/${receivableId}/payment`,
        headers: auth(token),
      });
      const paymentId = started.json().data.payment.id as string;
      await settlePayment(app, payments, paymentId);

      const receivable = await prisma.contractPostCloseReceivable.findUniqueOrThrow({
        where: { id: receivableId },
      });
      assert.equal(receivable.status, "SETTLED");
      assert.ok(receivable.settledAt);
      assert.equal(receivable.settledPaymentId, paymentId);

      const road = await prisma.roadLiability.findUniqueOrThrow({ where: { id: liability.id } });
      assert.equal(road.collectionStatus, "SETTLED");

      const detail = await app.inject({
        method: "GET",
        url: `/contracts/${contract.id}`,
        headers: auth(token),
      });
      assert.equal(detail.json().data.status, "CLOSED");
    });

    test("SETTLED receivable cannot start another checkout", async () => {
      const { contract, receivableId } = await seedClosedWithReceivable();
      const started = await app.inject({
        method: "POST",
        url: `/contracts/${contract.id}/post-close-receivables/${receivableId}/payment`,
        headers: auth(token),
      });
      await settlePayment(app, payments, started.json().data.payment.id as string);

      const again = await app.inject({
        method: "POST",
        url: `/contracts/${contract.id}/post-close-receivables/${receivableId}/payment`,
        headers: auth(token),
      });
      assert.equal(again.statusCode, 409);
      assert.equal(again.json().error.context.reason, "ALREADY_PAID");
    });

    test("concurrent settlement confirmations produce one collection only", async () => {
      const { contract, liability, receivableId, vehicleBefore, reconciliation } =
        await seedClosedWithReceivable();
      const started = await app.inject({
        method: "POST",
        url: `/contracts/${contract.id}/post-close-receivables/${receivableId}/payment`,
        headers: auth(token),
      });
      assert.equal(started.statusCode, 200, started.body);
      const paymentId = started.json().data.payment.id as string;
      const statusToken = started.json().data.statusToken as string;
      const event = payments.buildWebhookEvent({ paymentId });
      payments.confirm();
      const [webhookRes, pollRes] = await Promise.all([
        sendTestStripeWebhook(app, event),
        app.inject({
          method: "GET",
          url: `/contracts/payments/status/${statusToken}`,
        }),
      ]);
      assert.ok(
        webhookRes.statusCode === 200 || pollRes.statusCode === 200,
        `${webhookRes.body}\n${pollRes.body}`,
      );

      const confirmed = await prisma.contractPayment.findMany({
        where: { purpose: "POST_CLOSE_RECEIVABLE", targetId: receivableId, status: "CONFIRMED" },
      });
      assert.equal(confirmed.length, 1);

      const receivable = await prisma.contractPostCloseReceivable.findUniqueOrThrow({
        where: { id: receivableId },
      });
      assert.equal(receivable.status, "SETTLED");
      assert.equal(receivable.settledPaymentId, paymentId);

      const road = await prisma.roadLiability.findUniqueOrThrow({ where: { id: liability.id } });
      assert.equal(road.collectionStatus, "SETTLED");
      assert.equal(road.amount, 100);

      const detail = await app.inject({
        method: "GET",
        url: `/contracts/${contract.id}`,
        headers: auth(token),
      });
      assert.equal(detail.json().data.status, "CLOSED");
      assert.equal(detail.json().data.reconciliation.chargesTotal, reconciliation.chargesTotal);
      assert.equal(detail.json().data.reconciliation.finalAmount, reconciliation.finalAmount);

      const vehicle = await prisma.vehicle.findUniqueOrThrow({ where: { id: vehicleId } });
      assert.equal(vehicle.operationalStatus, vehicleBefore.operationalStatus);
    });

    test("duplicate webhook produces one settlement only", async () => {
      const { contract, receivableId } = await seedClosedWithReceivable();
      const started = await app.inject({
        method: "POST",
        url: `/contracts/${contract.id}/post-close-receivables/${receivableId}/payment`,
        headers: auth(token),
      });
      const paymentId = started.json().data.payment.id as string;
      const event = await settlePayment(app, payments, paymentId);
      const dup = await sendTestStripeWebhook(app, event);
      assert.equal(dup.statusCode, 200);
      assert.equal(dup.json().data.duplicate, true);

      const confirmed = await prisma.contractPayment.findMany({
        where: { purpose: "POST_CLOSE_RECEIVABLE", targetId: receivableId, status: "CONFIRMED" },
      });
      assert.equal(confirmed.length, 1);
    });
  });
}
