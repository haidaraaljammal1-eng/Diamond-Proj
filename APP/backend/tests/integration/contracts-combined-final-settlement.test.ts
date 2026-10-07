import { test, before, after, describe } from "node:test";
import assert from "node:assert/strict";
import type { FastifyInstance } from "fastify";
import type { PrismaClient } from "@prisma/client";
import { setPaymentProviderForTests } from "src/modules/contracts/payment/payment-provider.factory";
import { createFakePaymentProvider } from "../helpers/fake-payment-provider";
import {
  completeCarInToReview,
  confirmReturnForContract,
  createActiveRentalContract,
  seedRenewalGuardUser,
} from "../helpers/renewal-integration-setup";

const RUN =
  process.env.RUN_INTEGRATION === "true" && Boolean(process.env.TEST_DATABASE_URL);

if (!RUN) {
  test("combined final settlement skipped (set RUN_INTEGRATION=true and TEST_DATABASE_URL)", {
    skip: true,
  });
} else {
  process.env.DATABASE_URL = process.env.TEST_DATABASE_URL!;
  process.env.LEGACY_CARD_LINK_ENABLED = "true";

  describe("combined final reconciliation settlement", { concurrency: false }, () => {
    let app: FastifyInstance;
    let prisma: PrismaClient;
    const run = Date.now().toString(36).toUpperCase();
    const admin = { email: `cfs-admin-${run}@example.test`, password: "cfs-admin-pass-123" };
    let token = "";
    let adminUserId = 0;
    let seq = 0;

    const auth = () => ({ authorization: `Bearer ${token}` });

    async function login() {
      const res = await app.inject({ method: "POST", url: "/auth/login", payload: admin });
      assert.equal(res.statusCode, 200, res.body);
      token = res.json().data.accessToken;
    }

    async function nextActive() {
      seq += 1;
      return createActiveRentalContract(app, prisma, auth, run, seq);
    }

    async function officeRenew(contractId: string, days = 2, amount = 300) {
      return app.inject({
        method: "POST",
        url: `/contracts/${contractId}/renew`,
        headers: auth(),
        payload: { additionalDays: days, additionalAmount: amount },
      });
    }

    async function moveToReview(contractId: string) {
      await confirmReturnForContract(app, auth, contractId);
      await completeCarInToReview(app, auth, contractId);
    }

    before(async () => {
      const { env } = await import("src/config/env");
      if (!/haidara_test(?:\?|$)/.test(env.DATABASE_URL)) {
        throw new Error("combined settlement tests require haidara_test");
      }
      const { buildApp } = await import("src/app");
      app = await buildApp();
      prisma = app.prisma;
      adminUserId = await seedRenewalGuardUser(prisma, admin.email, admin.password, `cfs_admin_${run}`);
      await login();
    });

    after(async () => {
      setPaymentProviderForTests(undefined);
      await app.close();
    });

    test("settlementAmountDue combines reconciliation charges and unpaid renewals", async () => {
      const active = await nextActive();
      await officeRenew(active.contractId, 3, 500);
      await moveToReview(active.contractId);
      await app.inject({
        method: "POST",
        url: `/contracts/${active.contractId}/reconcile`,
        headers: auth(),
        payload: { lines: [{ type: "DAMAGE", description: "door", amount: 450 }] },
      });
      const rec = await app.inject({
        method: "GET",
        url: `/contracts/${active.contractId}/reconciliation`,
        headers: auth(),
      });
      assert.equal(rec.statusCode, 200, rec.body);
      const data = rec.json().data;
      assert.equal(data.totals.finalAmount, 450);
      assert.equal(data.reconciliationChargesAmount, 450);
      assert.equal(data.outstandingRenewalAmount, 500);
      assert.equal(data.settlementAmountDue, 950);
    });

    test("cash 950 writes split ledgers and one physical payment", async () => {
      const active = await nextActive();
      await officeRenew(active.contractId, 3, 500);
      await moveToReview(active.contractId);
      await app.inject({
        method: "POST",
        url: `/contracts/${active.contractId}/reconcile`,
        headers: auth(),
        payload: { lines: [{ type: "DAMAGE", description: "door", amount: 450 }] },
      });

      const cash = await app.inject({
        method: "POST",
        url: `/contracts/${active.contractId}/reconciliation/cash/settle`,
        headers: auth(),
      });
      assert.equal(cash.statusCode, 200, cash.body);
      assert.equal(cash.json().data.status, "CLOSED");

      const payment = await prisma.contractPayment.findFirstOrThrow({
        where: { contractId: active.contractId, purpose: "RECONCILIATION", status: "CONFIRMED" },
      });
      assert.equal(payment.amount, 950);

      const allocations = await prisma.contractPaymentAllocation.findMany({
        where: { contractPaymentId: payment.id },
        orderBy: { allocationPurpose: "asc" },
      });
      assert.equal(allocations.length, 2);
      const reconAlloc = allocations.find((row) => row.allocationPurpose === "RECONCILIATION");
      const renewalAlloc = allocations.find((row) => row.allocationPurpose === "RENEWAL");
      assert.equal(reconAlloc?.amount, 450);
      assert.equal(renewalAlloc?.amount, 500);

      const ledgers = await prisma.financialLedgerEntry.findMany({
        where: { contractPaymentId: payment.id },
        orderBy: { kind: "asc" },
      });
      assert.equal(ledgers.reduce((sum, row) => sum + row.amount, 0), 950);
      assert.equal(
        ledgers.find((row) => row.kind === "RECONCILIATION_PAYMENT")?.amount,
        450,
      );
      assert.equal(ledgers.find((row) => row.kind === "RENEWAL_PAYMENT")?.amount, 500);

      const renewal = await prisma.contractRenewal.findFirstOrThrow({
        where: { contractId: active.contractId },
      });
      assert.equal(renewal.settledPaymentId, payment.id);
    });

    test("zero reconciliation lines still require renewal-only collection", async () => {
      const active = await nextActive();
      await officeRenew(active.contractId, 2, 500);
      await moveToReview(active.contractId);

      const rec = await app.inject({
        method: "GET",
        url: `/contracts/${active.contractId}/reconciliation`,
        headers: auth(),
      });
      assert.equal(rec.json().data.settlementAmountDue, 500);

      const finalize = await app.inject({
        method: "POST",
        url: `/contracts/${active.contractId}/reconciliation/finalize`,
        headers: auth(),
      });
      assert.equal(finalize.statusCode, 200, finalize.body);
      assert.equal(finalize.json().data.status, "REVIEW");

      const cash = await app.inject({
        method: "POST",
        url: `/contracts/${active.contractId}/reconciliation/cash/settle`,
        headers: auth(),
      });
      assert.equal(cash.statusCode, 200, cash.body);
      assert.equal(cash.json().data.status, "CLOSED");
      const payment = await prisma.contractPayment.findFirstOrThrow({
        where: { contractId: active.contractId, purpose: "RECONCILIATION", status: "CONFIRMED" },
      });
      assert.equal(payment.amount, 500);
    });

    test("multiple renewals share one final settlement payment", async () => {
      const active = await nextActive();
      await officeRenew(active.contractId, 2, 300);
      await officeRenew(active.contractId, 1, 400);
      await moveToReview(active.contractId);
      await app.inject({
        method: "POST",
        url: `/contracts/${active.contractId}/reconcile`,
        headers: auth(),
        payload: { lines: [{ type: "DAMAGE", description: "scratch", amount: 200 }] },
      });

      const cash = await app.inject({
        method: "POST",
        url: `/contracts/${active.contractId}/reconciliation/cash/settle`,
        headers: auth(),
      });
      assert.equal(cash.statusCode, 200, cash.body);
      const payment = await prisma.contractPayment.findFirstOrThrow({
        where: { contractId: active.contractId, purpose: "RECONCILIATION", status: "CONFIRMED" },
      });
      assert.equal(payment.amount, 900);
      const renewals = await prisma.contractRenewal.findMany({ where: { contractId: active.contractId } });
      assert.equal(renewals.length, 2);
      assert.ok(renewals.every((row) => row.settledPaymentId === payment.id));
    });

    test("duplicate cash confirmation is idempotent", async () => {
      const active = await nextActive();
      await officeRenew(active.contractId, 1, 150);
      await moveToReview(active.contractId);
      const first = await app.inject({
        method: "POST",
        url: `/contracts/${active.contractId}/reconciliation/cash/settle`,
        headers: auth(),
      });
      assert.equal(first.statusCode, 200, first.body);
      const second = await app.inject({
        method: "POST",
        url: `/contracts/${active.contractId}/reconciliation/cash/settle`,
        headers: auth(),
      });
      assert.equal(second.statusCode, 200, second.body);
      assert.equal(
        await prisma.contractPayment.count({
          where: { contractId: active.contractId, purpose: "RECONCILIATION", status: "CONFIRMED" },
        }),
        1,
      );
    });

    test("electronic reconciliation checkout uses combined amount", async () => {
      const active = await nextActive();
      await officeRenew(active.contractId, 2, 500);
      await moveToReview(active.contractId);
      await app.inject({
        method: "POST",
        url: `/contracts/${active.contractId}/reconcile`,
        headers: auth(),
        payload: { lines: [{ type: "DAMAGE", description: "panel", amount: 200 }] },
      });
      const payments = createFakePaymentProvider(`${run}-combined-stripe`);
      setPaymentProviderForTests(payments.provider);
      const started = await app.inject({
        method: "POST",
        url: `/contracts/${active.contractId}/reconciliation/payment`,
        headers: auth(),
      });
      assert.equal(started.statusCode, 200, started.body);
      assert.equal(started.json().data.payment.amount, 700);
    });

    test("finance open receivables do not double-count REVIEW combined exposure", async () => {
      const active = await nextActive();
      await officeRenew(active.contractId, 2, 500);
      await moveToReview(active.contractId);
      await app.inject({
        method: "POST",
        url: `/contracts/${active.contractId}/reconcile`,
        headers: auth(),
        payload: { lines: [{ type: "DAMAGE", description: "scratch", amount: 200 }] },
      });

      const renewals = await app.inject({
        method: "GET",
        url: `/finance/open-receivables?sourceType=RENEWAL&pageSize=100&search=${encodeURIComponent(active.contractNumber)}`,
        headers: auth(),
      });
      assert.equal(renewals.json().data.length, 0);

      const reconciliation = await app.inject({
        method: "GET",
        url: `/finance/open-receivables?sourceType=RECONCILIATION&pageSize=100&search=${encodeURIComponent(active.contractNumber)}`,
        headers: auth(),
      });
      assert.equal(reconciliation.statusCode, 200, reconciliation.body);
      assert.equal(reconciliation.json().data.length, 1);
      assert.equal(reconciliation.json().data[0].outstandingAmount, 700);
    });

    test("legacy reconciliation payment without allocations still settles", async () => {
      const active = await nextActive();
      await moveToReview(active.contractId);
      await app.inject({
        method: "POST",
        url: `/contracts/${active.contractId}/reconcile`,
        headers: auth(),
        payload: { lines: [{ type: "DAMAGE", description: "legacy", amount: 120 }] },
      });
      const reconciliation = await prisma.contractReconciliation.findUniqueOrThrow({
        where: { contractId: active.contractId },
      });
      const { withTransaction } = await import("src/lib/db/transaction");
      const { ensureReconciliationFinalizedInTx } = await import(
        "src/modules/contracts/contracts-reconciliation"
      );
      const { applyLegacyReconciliationSettlementInTx } = await import(
        "src/modules/contracts/contracts-final-settlement"
      );
      const adminUser = await prisma.user.findUniqueOrThrow({ where: { id: adminUserId } });
      await withTransaction(prisma, async (tx) => {
        await ensureReconciliationFinalizedInTx(tx, active.contractId, adminUser.id);
        const payment = await tx.contractPayment.create({
          data: {
            contractId: active.contractId,
            purpose: "RECONCILIATION",
            targetId: reconciliation.id,
            amount: 120,
            currency: "AED",
            method: "CASH",
            status: "CONFIRMED",
            confirmedAt: new Date(),
            createdByUserId: adminUser.id,
          },
        });
        await applyLegacyReconciliationSettlementInTx(tx, payment);
        const { recordTrustedCollectionLedger } = await import(
          "src/modules/finance/finance-ledger.service"
        );
        await recordTrustedCollectionLedger(tx, payment);
      });
      assert.equal(
        (await prisma.contract.findUniqueOrThrow({ where: { id: active.contractId } })).status,
        "CLOSED",
      );
      assert.equal(
        await prisma.contractPaymentAllocation.count({
          where: { contractPaymentId: (await prisma.contractPayment.findFirstOrThrow({
            where: { contractId: active.contractId, purpose: "RECONCILIATION" },
          })).id },
        }),
        0,
      );
    });

    test("direct renewal cash on ACTIVE contract still works", async () => {
      const active = await nextActive();
      const renew = await officeRenew(active.contractId, 2, 175);
      assert.equal(renew.statusCode, 200, renew.body);
      const renewalId = (renew.json().data.renewals as Array<{ id: string }>)[0]!.id;
      const collected = await app.inject({
        method: "POST",
        url: `/contracts/${active.contractId}/renewals/${renewalId}/cash/settle`,
        headers: auth(),
      });
      assert.equal(collected.statusCode, 200, collected.body);
      assert.equal(
        await prisma.contractPayment.count({
          where: { contractId: active.contractId, purpose: "RENEWAL", status: "CONFIRMED" },
        }),
        1,
      );
    });
  });
}
