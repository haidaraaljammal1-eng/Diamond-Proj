import { test, before, after, describe } from "node:test";
import assert from "node:assert/strict";
import type { FastifyInstance } from "fastify";
import type { PrismaClient } from "@prisma/client";
import {
  auth,
  installPaymentProvider,
  login,
  PAYMENT_PERMS,
  seedPaymentUser,
  seedReviewContract,
  approveReconciliation570,
  startReconciliationPayment,
  settlePayment,
} from "../helpers/payment-integration-helpers";
import { sendTestStripeWebhook } from "../helpers/fake-payment-provider";
import { companyId as testCompanyId } from "tests/helpers/operating-company";

const RUN =
  process.env.RUN_INTEGRATION === "true" && Boolean(process.env.TEST_DATABASE_URL);

if (!RUN) {
  test("finance open receivables skipped (set RUN_INTEGRATION=true and TEST_DATABASE_URL)", {
    skip: true,
  });
} else {
  process.env.DATABASE_URL = process.env.TEST_DATABASE_URL!;

  describe("finance open receivables — all four sources", { concurrency: false }, () => {
    let app: FastifyInstance;
    let prisma: PrismaClient;
    const run = Date.now().toString(36).toUpperCase();
    let token = "";
    let adminUserId = 0;
    let vehicleId = 0;
    let customerId = 0;
    let payments: ReturnType<typeof installPaymentProvider>;
    let seq = 0;

    const FINANCE_PERMS = [
      ...PAYMENT_PERMS,
      "finance.read",
      "finance.manage_expenses",
      "violations.read",
      "violations.charge",
    ];

    const period = {
      from: new Date("2026-01-01T00:00:00.000Z"),
      to: new Date("2027-01-01T00:00:00.000Z"),
    };

    async function seedRenewalOutstanding(additionalAmount = 300) {
      seq += 1;
      const v = await prisma.vehicle.create({
        data: {
          companyId: await testCompanyId(prisma),
          vehicleName: `OR-RN-V ${run}-${seq}`,
          plateNumber: `ORRN${run}${seq}`.slice(0, 20),
          operationalStatus: "RENTED",
          dailyRate: 400,
        },
      });
      const contract = await prisma.contract.create({
        data: {
          companyId: await testCompanyId(prisma),
          contractNumber: `OR-RN-${run}-${seq}`,
          status: "ACTIVE",
          vehicleId: v.id,
          customerId,
          createdByUserId: adminUserId,
          priceType: "DAILY",
          rentalDays: 5,
          durationValue: 5,
          durationUnit: "DAY",
          agreedAmount: 1200,
          collectionMode: "ELECTRONIC",
          activatedAt: new Date("2026-06-01T10:00:00.000Z"),
        },
      });
      const renewal = await prisma.contractRenewal.create({
        data: {
          contractId: contract.id,
          additionalDays: 2,
          additionalAmount,
          previousEndAt: new Date("2026-06-05T10:00:00.000Z"),
          newEndAt: new Date("2026-06-07T10:00:00.000Z"),
          approvedAt: new Date("2026-06-05T11:00:00.000Z"),
          appliedAt: null,
        },
      });
      return {
        contractId: contract.id,
        contractNumber: contract.contractNumber,
        renewalId: renewal.id,
        additionalAmount,
      };
    }

    async function seedPostCloseOutstanding(amount = 120) {
      seq += 1;
      const contract = await prisma.contract.create({
        data: {
          companyId: await testCompanyId(prisma),
          contractNumber: `OR-PC-${run}-${seq}`,
          status: "CLOSED",
          vehicleId,
          customerId,
          createdByUserId: adminUserId,
          priceType: "DAILY",
          rentalDays: 2,
          durationValue: 2,
          durationUnit: "DAY",
          agreedAmount: 800,
          collectionMode: "ELECTRONIC",
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
              finalAmount: 350,
              approvedAt: new Date("2026-09-04T11:00:00.000Z"),
              settledAt: new Date("2026-09-04T11:30:00.000Z"),
              lines: { create: { type: "DAMAGE", description: "scuff", amount: 350 } },
            },
          },
        },
      });
      const liability = await prisma.roadLiability.create({
        data: {
          type: "RTA_VIOLATION",
          vehicleId,
          occurredAt: new Date("2026-09-02T12:00:00.000Z"),
          amount: 100,
          currency: "AED",
          authoritativeSourceKey: "RTA",
          authoritativeExternalReference: `RTA-OR-PC-${run}-${seq}`,
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
        payload: { customerChargeAmount: amount, adjustmentReason: "Administration fee" },
      });
      assert.equal(charge.statusCode, 200, charge.body);
      return {
        contractId: contract.id,
        contractNumber: contract.contractNumber,
        receivableId: charge.json().data.postCloseReceivableId as string,
        amount,
      };
    }

    before(async () => {
      const { env } = await import("src/config/env");
      if (!/haidara_test(?:\?|$)/.test(env.DATABASE_URL)) {
        throw new Error("finance open receivables tests require haidara_test");
      }
      const { buildApp } = await import("src/app");
      app = await buildApp();
      prisma = app.prisma;
      payments = installPaymentProvider(run);
      adminUserId = await seedPaymentUser(
        prisma,
        `or-admin-${run}@example.test`,
        "or-pass-123",
        `or_admin_${run}`,
        FINANCE_PERMS,
      );
      token = await login(app, {
        email: `or-admin-${run}@example.test`,
        password: "or-pass-123",
      });
      const vehicle = await prisma.vehicle.create({
        data: {
          companyId: await testCompanyId(prisma),
          vehicleName: `OR Vehicle ${run}`,
          plateNumber: `OR ${run}`,
          operationalStatus: "AVAILABLE",
          dailyRate: 400,
        },
      });
      vehicleId = vehicle.id;
      customerId = (await prisma.customer.create({ data: { name: `OR Customer ${run}` } })).id;
    });

    after(async () => {
      const { setPaymentProviderForTests } = await import(
        "src/modules/contracts/payment/payment-provider.factory"
      );
      setPaymentProviderForTests(undefined);
      await app.close();
    });

    test("all four sources normalize, total invariant holds, and settlement removes each obligation", async () => {
      const rentalVehicle = await prisma.vehicle.create({
        data: {
          companyId: await testCompanyId(prisma),
          vehicleName: `OR Rent ${run}`,
          plateNumber: `ORR ${run}`,
          operationalStatus: "AVAILABLE",
          dailyRate: 500,
        },
      });
      const rentalContract = await prisma.contract.create({
        data: {
          companyId: await testCompanyId(prisma),
          contractNumber: `OR-RENT-${run}`,
          status: "SIGNED",
          vehicleId: rentalVehicle.id,
          customerId,
          createdByUserId: adminUserId,
          priceType: "DAILY",
          rentalDays: 3,
          durationValue: 3,
          durationUnit: "DAY",
          agreedAmount: 1500,
          collectionMode: "ELECTRONIC",
          acceptance: {
            create: {
              acceptedAt: new Date("2026-06-01T10:00:00.000Z"),
              termsVersion: "diamond-rental-terms-v1",
            },
          },
        },
      });

      const renewal = await seedRenewalOutstanding(300);

      seq += 1;
      const recContract = await seedReviewContract(prisma, {
        run: `OR${run}`,
        seq,
        vehicleId,
        customerId,
        adminUserId,
        vehicleAvailable: true,
      });
      const liability = await prisma.roadLiability.create({
        data: {
          type: "RTA_VIOLATION",
          vehicleId,
          occurredAt: new Date("2026-09-02T12:00:00.000Z"),
          amount: 100,
          currency: "AED",
          authoritativeSourceKey: "RTA",
          authoritativeExternalReference: `RTA-OR-REC-${run}-${seq}`,
          confirmationStatus: "CONFIRMED",
          attributionStatus: "MATCHED",
          collectionStatus: "OPEN",
          attributedContractId: recContract.id,
          confirmedAt: new Date(),
        },
      });
      const recData = await approveReconciliation570(app, token, recContract.id, liability.id);
      const reconciliationId = recData.reconciliation.id as string;

      const postClose = await seedPostCloseOutstanding(120);

      const assertRow = async (
        sourceType: string,
        matcher: (row: { sourceId: string; contractNumber: string }) => boolean,
        amount: number,
        search: string,
      ) => {
        const res = await app.inject({
          method: "GET",
          url: `/finance/open-receivables?sourceType=${sourceType}&pageSize=100&search=${encodeURIComponent(search)}`,
          headers: auth(token),
        });
        assert.equal(res.statusCode, 200, res.body);
        const row = res.json().data.find(matcher);
        assert.ok(row, `${sourceType} missing for ${search}: ${res.body}`);
        assert.equal(row.sourceType, sourceType);
        assert.equal(row.amountDue, amount);
        assert.equal(row.amountPaid, 0);
        assert.equal(row.outstandingAmount, amount);
        return row;
      };

      await assertRow("RENTAL", (r) => r.sourceId === rentalContract.id, 1500, rentalContract.contractNumber);
      await assertRow("RENEWAL", (r) => r.sourceId === renewal.renewalId, 300, renewal.contractNumber);
      await assertRow(
        "RECONCILIATION",
        (r) => r.sourceId === reconciliationId,
        570,
        recContract.contractNumber,
      );
      await assertRow(
        "POST_CLOSE_RECEIVABLE",
        (r) => r.sourceId === postClose.receivableId,
        120,
        postClose.contractNumber,
      );

      const summary = await app.inject({
        method: "GET",
        url: `/finance/summary?from=${period.from.toISOString()}&to=${period.to.toISOString()}`,
        headers: auth(token),
      });
      const analytics = await app.inject({
        method: "GET",
        url: `/finance/analytics?from=${period.from.toISOString()}&to=${period.to.toISOString()}`,
        headers: auth(token),
      });
      const breakdownTotal = analytics.json().data.outstandingBreakdown.reduce(
        (sum: number, row: { amount: number }) => sum + row.amount,
        0,
      );
      const expectedOutstanding = 1500 + 300 + 570 + 120;
      assert.equal(summary.json().data.outstanding, expectedOutstanding);
      assert.equal(breakdownTotal, expectedOutstanding);

      const { createContractPaymentService } = await import(
        "src/modules/contracts/payment/contract-payment.service"
      );
      const paymentService = createContractPaymentService(prisma);

      const rentalStarted = await paymentService.startPayment({
        purpose: "RENTAL",
        targetId: rentalContract.id,
        createdByUserId: adminUserId,
      });
      payments.confirm();
      await settlePayment(app, payments, rentalStarted.payment.id);

      const recStarted = await startReconciliationPayment(app, token, recContract.id);
      payments.confirm();
      await settlePayment(app, payments, recStarted.payment.id);

      const renewalPaymentStart = await paymentService.startPayment({
        purpose: "RENEWAL",
        targetId: renewal.renewalId,
        createdByUserId: adminUserId,
      });
      payments.confirm();
      await settlePayment(app, payments, renewalPaymentStart.payment.id);

      const pcStarted = await app.inject({
        method: "POST",
        url: `/contracts/${postClose.contractId}/post-close-receivables/${postClose.receivableId}/payment`,
        headers: auth(token),
      });
      assert.equal(pcStarted.statusCode, 200, pcStarted.body);
      const pcPaymentId = pcStarted.json().data.payment.id as string;
      const pcStatusToken = pcStarted.json().data.statusToken as string;
      payments.confirm();
      await settlePayment(app, payments, pcPaymentId);

      const gone = async (
        sourceType: string,
        matcher: (row: { sourceId: string }) => boolean,
        search: string,
      ) => {
        const res = await app.inject({
          method: "GET",
          url: `/finance/open-receivables?sourceType=${sourceType}&pageSize=100&search=${encodeURIComponent(search)}`,
          headers: auth(token),
        });
        assert.equal(res.json().data.some(matcher), false);
      };

      await gone("RENTAL", (r) => r.sourceId === rentalContract.id, rentalContract.contractNumber);
      await gone("RENEWAL", (r) => r.sourceId === renewal.renewalId, renewal.contractNumber);
      await gone("RECONCILIATION", (r) => r.sourceId === reconciliationId, recContract.contractNumber);
      await gone(
        "POST_CLOSE_RECEIVABLE",
        (r) => r.sourceId === postClose.receivableId,
        postClose.contractNumber,
      );
    });
  });
}
