import { test, before, after, describe } from "node:test";
import assert from "node:assert/strict";
import type { FastifyInstance } from "fastify";
import type { PrismaClient } from "@prisma/client";
import {
  createActiveRentalContract,
  completeCarInToReview,
  confirmReturnForContract,
  seedRenewalGuardUser,
  RENEWAL_GUARD_PERMS,
} from "tests/helpers/renewal-integration-setup";
import { companyId as testCompanyId } from "tests/helpers/operating-company";
import {
  bindIntegrationDatabase,
  extractPostgresDatabaseName,
  INTEGRATION_ENABLED,
} from "tests/helpers/integration-harness";
import { setPaymentProviderForTests } from "src/modules/contracts/payment/payment-provider.factory";
import {
  installPaymentProvider,
  settlePayment,
} from "../helpers/payment-integration-helpers";

if (!INTEGRATION_ENABLED) {
  test("deferred receivables integration skipped (RUN_INTEGRATION + TEST_DATABASE_URL)", {
    skip: true,
  });
} else {
  bindIntegrationDatabase();

  describe("deferred receivables lifecycle", { concurrency: false }, () => {
    let app: FastifyInstance;
    let prisma: PrismaClient;
    const run = `DR-${Date.now().toString(36).toUpperCase()}`;
    let token = "";
    let adminUserId = 0;
    let seq = 0;
    let payments: ReturnType<typeof installPaymentProvider>;

    async function login() {
      const res = await app.inject({
        method: "POST",
        url: "/auth/login",
        payload: { email: `dr-admin-${run}@example.test`, password: "dr-pass-123" },
      });
      assert.equal(res.statusCode, 200, res.body);
      return res.json().data.accessToken as string;
    }

    const auth = () => ({ authorization: `Bearer ${token}` });

    function deferredPayload(ref: string, amount = 200) {
      return {
        chargeCategory: "TRAFFIC_VIOLATION",
        amountAed: amount,
        referenceNumber: ref,
      };
    }

    async function registerDeferred(contractId: string, ref: string, idempotencyKey: string) {
      return app.inject({
        method: "POST",
        url: `/contracts/${contractId}/deferred-road-charge`,
        headers: { ...auth(), "idempotency-key": idempotencyKey },
        payload: deferredPayload(ref),
      });
    }

    before(async () => {
      assert.equal(extractPostgresDatabaseName(process.env.DATABASE_URL ?? ""), "haidara_test");
      const { buildApp } = await import("src/app");
      app = await buildApp();
      prisma = app.prisma;
      payments = installPaymentProvider(run);
      adminUserId = await seedRenewalGuardUser(
        prisma,
        `dr-admin-${run}@example.test`,
        "dr-pass-123",
        `dr_admin_${run}`,
      );
      const perms = [
        ...RENEWAL_GUARD_PERMS,
        "violations.read",
        "violations.charge",
        "finance.read",
      ];
      for (const key of perms) {
        const perm = await prisma.permission.upsert({
          where: { key },
          update: {},
          create: { key, category: key.split(".")[0], description: key },
        });
        const role = await prisma.role.findFirstOrThrow({ where: { key: `dr_admin_${run}` } });
        await prisma.rolePermission.upsert({
          where: { roleId_permissionId: { roleId: role.id, permissionId: perm.id } },
          update: {},
          create: { roleId: role.id, permissionId: perm.id },
        });
      }
      token = await login();
    });

    after(async () => {
      setPaymentProviderForTests(undefined);
      await app.close();
    });

    test("ACTIVE register → Car-In → REVIEW attaches reconciliation line once", async () => {
      seq += 1;
      const { contractId } = await createActiveRentalContract(app, prisma, auth, run, seq, payments);
      const ref = `DR-ACTIVE-${run}-${seq}`;
      const reg = await registerDeferred(contractId, ref, `idem-${run}-${seq}`);
      assert.equal(reg.statusCode, 200, reg.body);
      const liabilityId = reg.json().data.roadLiabilityId as string;

      await confirmReturnForContract(app, auth, contractId);
      await completeCarInToReview(app, auth, contractId);

      const lines = await prisma.contractReconciliationLine.findMany({
        where: { reconciliation: { contractId }, sourceDomain: "road_liability" },
      });
      const matches = lines.filter((line) => line.roadLiabilityId === liabilityId);
      assert.equal(matches.length, 1);
      assert.equal(matches[0]?.amount, 200);
    });

    test("REVIEW register attaches reconciliation line once", async () => {
      seq += 1;
      const { contractId } = await createActiveRentalContract(app, prisma, auth, run, seq, payments);
      await confirmReturnForContract(app, auth, contractId);
      await completeCarInToReview(app, auth, contractId);
      const ref = `DR-REV-${run}-${seq}`;
      const reg = await registerDeferred(contractId, ref, `idem-rev-${run}-${seq}`);
      assert.equal(reg.statusCode, 200, reg.body);
      const liabilityId = reg.json().data.roadLiabilityId as string;
      const lines = await prisma.contractReconciliationLine.findMany({
        where: { reconciliation: { contractId }, roadLiabilityId: liabilityId },
      });
      assert.equal(lines.length, 1);
    });

    test("duplicate reference is rejected", async () => {
      seq += 1;
      const { contractId } = await createActiveRentalContract(app, prisma, auth, run, seq, payments);
      const ref = `DR-REF-${run}-${seq}`;
      const first = await registerDeferred(contractId, ref, `idem-ref-a-${run}-${seq}`);
      assert.equal(first.statusCode, 200, first.body);
      const second = await registerDeferred(contractId, ref, `idem-ref-b-${run}-${seq}`);
      assert.notEqual(second.statusCode, 200);
    });

    test("finance lists ROAD_LIABILITY and cash-confirm clears obligation once", async () => {
      seq += 1;
      const vehicle = await prisma.vehicle.create({
        data: {
          companyId: await testCompanyId(prisma),
          vehicleName: `DR-CASH-${run}-${seq}`,
          plateNumber: `DRC${run}${seq}`.slice(0, 20),
          operationalStatus: "RENTED",
          dailyRate: 400,
        },
      });
      const contract = await prisma.contract.create({
        data: {
          companyId: await testCompanyId(prisma),
          contractNumber: `DR-CASH-${run}-${seq}`,
          status: "ACTIVE",
          vehicleId: vehicle.id,
          customerId: (await prisma.customer.create({ data: { name: `DR Cust ${run}-${seq}` } })).id,
          createdByUserId: adminUserId,
          priceType: "DAILY",
          rentalDays: 3,
          durationValue: 3,
          durationUnit: "DAY",
          agreedAmount: 900,
          collectionMode: "CASH",
          activatedAt: new Date("2026-07-01T10:00:00.000Z"),
        },
      });
      const ref = `DR-FIN-${run}-${seq}`;
      const reg = await registerDeferred(contract.id, ref, `idem-fin-${run}-${seq}`);
      assert.equal(reg.statusCode, 200, reg.body);
      const liabilityId = reg.json().data.roadLiabilityId as string;

      const list = await app.inject({
        method: "GET",
        url: `/finance/open-receivables?sourceType=ROAD_LIABILITY&search=${encodeURIComponent(contract.contractNumber)}`,
        headers: auth(),
      });
      assert.equal(list.statusCode, 200, list.body);
      const rows = list.json().data as Array<{ sourceId: string; cashCollectionAvailable?: boolean }>;
      const row = rows.find((r) => r.sourceId === liabilityId);
      assert.ok(row);
      assert.equal(row?.cashCollectionAvailable, true);

      const confirm = await app.inject({
        method: "POST",
        url: `/finance/open-receivables/road-liabilities/${liabilityId}/cash-confirm`,
        headers: { ...auth(), "idempotency-key": `cash-${run}-${seq}` },
      });
      assert.equal(confirm.statusCode, 200, confirm.body);

      const listAfter = await app.inject({
        method: "GET",
        url: `/finance/open-receivables?sourceType=ROAD_LIABILITY&search=${encodeURIComponent(contract.contractNumber)}`,
        headers: auth(),
      });
      const rowsAfter = listAfter.json().data as Array<{ sourceId: string }>;
      assert.equal(rowsAfter.find((r) => r.sourceId === liabilityId), undefined);

      const charge = await prisma.roadLiabilityCustomerCharge.findUnique({
        where: { roadLiabilityId: liabilityId },
        include: { contractPayment: true },
      });
      assert.ok(charge?.contractPayment);
      assert.equal(charge.contractPayment.status, "CONFIRMED");
      const ledger = await prisma.financialLedgerEntry.count({
        where: {
          sourceType: "CONTRACT_PAYMENT",
          sourceId: charge.contractPayment.id,
        },
      });
      assert.equal(ledger, 1);
    });

    test("CLOSED register → post-close receivable → trusted payment → ledger once", async () => {
      seq += 1;
      const contract = await prisma.contract.create({
        data: {
          companyId: await testCompanyId(prisma),
          contractNumber: `DR-CL-${run}-${seq}`,
          status: "CLOSED",
          vehicleId: (
            await prisma.vehicle.create({
              data: {
                companyId: await testCompanyId(prisma),
                vehicleName: `DR-CL-V-${run}-${seq}`,
                plateNumber: `DRCL${run}${seq}`.slice(0, 20),
                operationalStatus: "AVAILABLE",
                dailyRate: 400,
              },
            })
          ).id,
          customerId: (await prisma.customer.create({ data: { name: `DR CL ${run}-${seq}` } })).id,
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
              chargesTotal: 0,
              depositAmount: 0,
              deductions: 0,
              finalAmount: 0,
              approvedAt: new Date("2026-09-04T10:00:00.000Z"),
              settledAt: new Date("2026-09-04T10:30:00.000Z"),
            },
          },
        },
      });
      const ref = `DR-CL-${run}-${seq}`;
      const reg = await registerDeferred(contract.id, ref, `idem-cl-${run}-${seq}`);
      assert.equal(reg.statusCode, 200, reg.body);
      const liabilityId = reg.json().data.roadLiabilityId as string;

      const postClose = await prisma.contractPostCloseReceivable.findFirst({
        where: { contractId: contract.id, roadLiabilityId: liabilityId, status: "OPEN" },
      });
      assert.ok(postClose);

      const financeRow = await app.inject({
        method: "GET",
        url: `/finance/open-receivables?sourceType=POST_CLOSE_RECEIVABLE&search=${encodeURIComponent(contract.contractNumber)}`,
        headers: auth(),
      });
      assert.equal(financeRow.statusCode, 200, financeRow.body);
      assert.ok(
        (financeRow.json().data as Array<{ sourceId: string }>).some(
          (row) => row.sourceId === postClose.id,
        ),
      );

      const started = await app.inject({
        method: "POST",
        url: `/contracts/${contract.id}/post-close-receivables/${postClose.id}/payment`,
        headers: auth(),
      });
      assert.equal(started.statusCode, 200, started.body);
      const paymentId = started.json().data.payment.id as string;
      payments.confirm();
      await settlePayment(app, payments, paymentId);

      const settled = await prisma.contractPostCloseReceivable.findUnique({
        where: { id: postClose.id },
      });
      assert.equal(settled?.status, "SETTLED");
      const ledger = await prisma.financialLedgerEntry.count({
        where: { sourceType: "CONTRACT_PAYMENT", sourceId: paymentId },
      });
      assert.equal(ledger, 1);
      const listAfter = await app.inject({
        method: "GET",
        url: `/finance/open-receivables?sourceType=POST_CLOSE_RECEIVABLE&search=${encodeURIComponent(contract.contractNumber)}`,
        headers: auth(),
      });
      assert.equal(
        (listAfter.json().data as Array<{ sourceId: string }>).find((r) => r.sourceId === postClose.id),
        undefined,
      );
    });

    test("ACTIVE deferred → REVIEW → reconciliation cash settle excludes duplicate ROAD_LIABILITY receivable", async () => {
      seq += 1;
      const { contractId, contractNumber } = await createActiveRentalContract(
        app,
        prisma,
        auth,
        run,
        seq,
        payments,
      );
      const ref = `DR-SETTLE-${run}-${seq}`;
      const reg = await registerDeferred(contractId, ref, `idem-settle-${run}-${seq}`);
      assert.equal(reg.statusCode, 200, reg.body);
      await confirmReturnForContract(app, auth, contractId);
      await completeCarInToReview(app, auth, contractId);

      const recBefore = await app.inject({
        method: "GET",
        url: `/contracts/${contractId}/reconciliation`,
        headers: auth(),
      });
      assert.equal(recBefore.statusCode, 200, recBefore.body);
      assert.equal(recBefore.json().data.totals.finalAmount, 200);

      const openBefore = await app.inject({
        method: "GET",
        url: `/finance/open-receivables?sourceType=ROAD_LIABILITY&search=${encodeURIComponent(contractNumber)}`,
        headers: auth(),
      });
      assert.equal(
        (openBefore.json().data as unknown[]).length,
        0,
        "attached violation must not double-count in Finance ROAD_LIABILITY",
      );

      const cash = await app.inject({
        method: "POST",
        url: `/contracts/${contractId}/reconciliation/cash/settle`,
        headers: auth(),
      });
      assert.equal(cash.statusCode, 200, cash.body);

      const openAfter = await app.inject({
        method: "GET",
        url: `/finance/open-receivables?search=${encodeURIComponent(contractNumber)}`,
        headers: auth(),
      });
      const rows = openAfter.json().data as Array<{ sourceType: string; outstandingAmount: number }>;
      assert.equal(
        rows.filter((r) => r.sourceType === "ROAD_LIABILITY" || r.sourceType === "RECONCILIATION").length,
        0,
      );

      const payment = await prisma.contractPayment.findFirstOrThrow({
        where: { contractId, purpose: "RECONCILIATION", status: "CONFIRMED" },
      });
      assert.equal(payment.amount, 200);
      const ledgers = await prisma.financialLedgerEntry.findMany({
        where: { contractPaymentId: payment.id },
      });
      assert.equal(ledgers.reduce((sum, row) => sum + row.amount, 0), 200);
    });

    test("awaiting electronic renewal appears in Finance RENEWAL until trusted payment settles", async () => {
      seq += 1;
      const { contractId, contractNumber } = await createActiveRentalContract(
        app,
        prisma,
        auth,
        run,
        seq,
        payments,
      );
      const renewal = await prisma.contractRenewal.create({
        data: {
          contractId,
          additionalDays: 2,
          additionalDurationValue: 2,
          additionalDurationUnit: "DAY",
          additionalAmount: 275,
          previousEndAt: new Date("2026-08-10T10:00:00.000Z"),
          newEndAt: new Date("2026-08-12T10:00:00.000Z"),
          approvedAt: new Date("2026-08-09T12:00:00.000Z"),
          appliedAt: null,
        },
      });

      const list = await app.inject({
        method: "GET",
        url: `/finance/open-receivables?sourceType=RENEWAL&search=${encodeURIComponent(contractNumber)}`,
        headers: auth(),
      });
      assert.equal(list.statusCode, 200, list.body);
      const row = (list.json().data as Array<{ sourceId: string; outstandingAmount: number }>).find(
        (r) => r.sourceId === renewal.id,
      );
      assert.ok(row);
      assert.equal(row.outstandingAmount, 275);

      const { createContractPaymentService } = await import(
        "src/modules/contracts/payment/contract-payment.service"
      );
      const paymentService = createContractPaymentService(prisma);
      const started = await paymentService.startPayment({
        purpose: "RENEWAL",
        targetId: renewal.id,
        createdByUserId: adminUserId,
      });
      payments.confirm();
      await settlePayment(app, payments, started.payment.id);

      const listAfter = await app.inject({
        method: "GET",
        url: `/finance/open-receivables?sourceType=RENEWAL&search=${encodeURIComponent(contractNumber)}`,
        headers: auth(),
      });
      assert.equal(
        (listAfter.json().data as Array<{ sourceId: string }>).find((r) => r.sourceId === renewal.id),
        undefined,
      );
    });

    test("finance cash-confirm idempotency key prevents duplicate ledger on concurrent retry", async () => {
      seq += 1;
      const vehicle = await prisma.vehicle.create({
        data: {
          companyId: await testCompanyId(prisma),
          vehicleName: `DR-IDEM-${run}-${seq}`,
          plateNumber: `DRID${run}${seq}`.slice(0, 20),
          operationalStatus: "RENTED",
          dailyRate: 400,
        },
      });
      const contract = await prisma.contract.create({
        data: {
          companyId: await testCompanyId(prisma),
          contractNumber: `DR-IDEM-${run}-${seq}`,
          status: "ACTIVE",
          vehicleId: vehicle.id,
          customerId: (await prisma.customer.create({ data: { name: `DR Idem ${run}-${seq}` } })).id,
          createdByUserId: adminUserId,
          priceType: "DAILY",
          rentalDays: 2,
          durationValue: 2,
          durationUnit: "DAY",
          agreedAmount: 600,
          collectionMode: "CASH",
          activatedAt: new Date("2026-07-01T10:00:00.000Z"),
        },
      });
      const reg = await registerDeferred(contract.id, `DR-IDEM-REF-${run}-${seq}`, `idem-idem-${run}-${seq}`);
      assert.equal(reg.statusCode, 200, reg.body);
      const liabilityId = reg.json().data.roadLiabilityId as string;
      const key = `finance-cash-idem-${run}-${seq}`;
      const first = await app.inject({
        method: "POST",
        url: `/finance/open-receivables/road-liabilities/${liabilityId}/cash-confirm`,
        headers: { ...auth(), "idempotency-key": key },
      });
      const second = await app.inject({
        method: "POST",
        url: `/finance/open-receivables/road-liabilities/${liabilityId}/cash-confirm`,
        headers: { ...auth(), "idempotency-key": key },
      });
      assert.equal(first.statusCode, 200, first.body);
      assert.equal(second.statusCode, 200, second.body);
      const charge = await prisma.roadLiabilityCustomerCharge.findUnique({
        where: { roadLiabilityId: liabilityId },
        include: { contractPayment: true },
      });
      assert.ok(charge?.contractPayment);
      const ledger = await prisma.financialLedgerEntry.count({
        where: { sourceType: "CONTRACT_PAYMENT", sourceId: charge.contractPayment.id },
      });
      assert.equal(ledger, 1);
    });
  });
}
