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
      adminUserId = await seedRenewalGuardUser(
        prisma,
        `dr-admin-${run}@example.test`,
        "dr-pass-123",
        `dr_admin_${run}`,
      );
      const perms = [...RENEWAL_GUARD_PERMS, "violations.read", "violations.charge"];
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
      await app.close();
    });

    test("ACTIVE register → Car-In → REVIEW attaches reconciliation line once", async () => {
      seq += 1;
      const { contractId } = await createActiveRentalContract(app, prisma, auth, run, seq);
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
      const { contractId } = await createActiveRentalContract(app, prisma, auth, run, seq);
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
      const { contractId } = await createActiveRentalContract(app, prisma, auth, run, seq);
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
  });
}
