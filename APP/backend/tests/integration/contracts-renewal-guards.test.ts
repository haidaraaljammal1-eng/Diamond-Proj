import { test, before, after, describe } from "node:test";
import assert from "node:assert/strict";
import type { FastifyInstance } from "fastify";
import type { PrismaClient } from "@prisma/client";
import { setPaymentProviderForTests } from "src/modules/contracts/payment/payment-provider.factory";
import {
  createFakePaymentProvider,
} from "../helpers/fake-payment-provider";
import {
  completeCarInToReview,
  confirmReturnForContract,
  createActiveRentalContract,
  seedRenewalGuardUser,
} from "../helpers/renewal-integration-setup";

const RUN =
  process.env.RUN_INTEGRATION === "true" && Boolean(process.env.TEST_DATABASE_URL);

if (!RUN) {
  test("contracts renewal guards skipped (set RUN_INTEGRATION=true and TEST_DATABASE_URL)", {
    skip: true,
  });
} else {
  process.env.DATABASE_URL = process.env.TEST_DATABASE_URL!;
  process.env.LEGACY_CARD_LINK_ENABLED = "true";

  describe("contracts renewal guards", { concurrency: false }, () => {
    let app: FastifyInstance;
    let prisma: PrismaClient;
    const run = Date.now().toString(36).toUpperCase();
    const admin = { email: `rg-admin-${run}@example.test`, password: "rg-admin-pass-123" };
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

    async function issueElectronicLink(contractId: string, days = 3, amount = 450) {
      const issued = await app.inject({
        method: "POST",
        url: `/contracts/${contractId}/renewal-link`,
        headers: auth(),
        payload: { additionalDays: days, additionalAmount: amount },
      });
      assert.equal(issued.statusCode, 200, issued.body);
      return issued.json().data.link.token as string;
    }

    async function officeRenew(contractId: string, days = 2, amount = 300) {
      return app.inject({
        method: "POST",
        url: `/contracts/${contractId}/renew`,
        headers: auth(),
        payload: { additionalDays: days, additionalAmount: amount },
      });
    }

    before(async () => {
      const { env } = await import("src/config/env");
      if (!/haidara_test(?:\?|$)/.test(env.DATABASE_URL)) {
        throw new Error("renewal guard tests require haidara_test");
      }
      const { buildApp } = await import("src/app");
      app = await buildApp();
      prisma = app.prisma;
      adminUserId = await seedRenewalGuardUser(prisma, admin.email, admin.password, `rg_admin_${run}`);
      await login();
    });

    after(async () => {
      setPaymentProviderForTests(undefined);
      await app.close();
    });

    test("electronic AWAITING_PAYMENT is excluded from finance office receivables", async () => {
      const active = await nextActive();
      const renewToken = await issueElectronicLink(active.contractId, 2, 250);
      const confirm = await app.inject({
        method: "POST",
        url: `/contracts/renew/${renewToken}/confirm`,
        payload: {},
      });
      assert.equal(confirm.statusCode, 200, confirm.body);

      const awaiting = await prisma.contractRenewal.findFirstOrThrow({
        where: { contractId: active.contractId },
      });
      assert.ok(awaiting.approvedAt);
      assert.equal(awaiting.appliedAt, null);

      const receivables = await app.inject({
        method: "GET",
        url: `/finance/open-receivables?sourceType=RENEWAL&pageSize=100&search=${encodeURIComponent(active.contractNumber)}`,
        headers: auth(),
      });
      assert.equal(receivables.statusCode, 200, receivables.body);
      assert.equal(
        receivables.json().data.some((row: { sourceId: string }) => row.sourceId === awaiting.id),
        false,
      );

      const office = await officeRenew(active.contractId, 1, 120);
      assert.equal(office.statusCode, 200, office.body);
      const officeRenewal = (office.json().data.renewals as Array<{ id: string; collectionState: string }>)[0];
      assert.equal(officeRenewal?.collectionState, "OFFICE_UNPAID");

      const afterOffice = await app.inject({
        method: "GET",
        url: `/finance/open-receivables?sourceType=RENEWAL&pageSize=100&search=${encodeURIComponent(active.contractNumber)}`,
        headers: auth(),
      });
      const row = afterOffice.json().data.find(
        (r: { sourceId: string }) => r.sourceId === officeRenewal?.id,
      );
      assert.ok(row);
      assert.equal(row.outstandingAmount, 120);
    });

    test("OFFICE_UNPAID appears on Final Reconciliation read model", async () => {
      const active = await nextActive();
      const endBefore = active.endAt;
      const renew = await officeRenew(active.contractId, 3, 360);
      assert.equal(renew.statusCode, 200, renew.body);
      assert.notEqual(renew.json().data.endAt, endBefore);

      await confirmReturnForContract(app, auth, active.contractId);
      await completeCarInToReview(app, auth, active.contractId);

      const rec = await app.inject({
        method: "GET",
        url: `/contracts/${active.contractId}/reconciliation`,
        headers: auth(),
      });
      assert.equal(rec.statusCode, 200, rec.body);
      const outstanding = rec.json().data.outstandingRenewals as Array<{ amount: number }>;
      assert.equal(outstanding.length, 1);
      assert.equal(outstanding[0]?.amount, 360);
      assert.equal(rec.json().data.outstandingRenewalAmount, 360);
    });

    test("finalize zero-balance reconciliation freezes charges while unpaid renewals remain in settlement", async () => {
      const active = await nextActive();
      await officeRenew(active.contractId, 2, 200);
      await confirmReturnForContract(app, auth, active.contractId);
      await completeCarInToReview(app, auth, active.contractId);

      const finalize = await app.inject({
        method: "POST",
        url: `/contracts/${active.contractId}/reconciliation/finalize`,
        headers: auth(),
      });
      assert.equal(finalize.statusCode, 200, finalize.body);
      assert.equal((await prisma.contract.findUniqueOrThrow({ where: { id: active.contractId } })).status, "REVIEW");
      const rec = await app.inject({
        method: "GET",
        url: `/contracts/${active.contractId}/reconciliation`,
        headers: auth(),
      });
      assert.equal(rec.json().data.settlementAmountDue, 200);
      assert.ok(rec.json().data.reconciliation.finalizedAt);
    });

    test("reconciliation cash and electronic payment include unpaid office renewals", async () => {
      const active = await nextActive();
      await officeRenew(active.contractId, 2, 180);
      await confirmReturnForContract(app, auth, active.contractId);
      await completeCarInToReview(app, auth, active.contractId);

      const draft = await app.inject({
        method: "POST",
        url: `/contracts/${active.contractId}/reconcile`,
        headers: auth(),
        payload: { lines: [{ type: "DAMAGE", description: "scratch", amount: 150 }] },
      });
      assert.equal(draft.statusCode, 200, draft.body);

      const recBefore = await app.inject({
        method: "GET",
        url: `/contracts/${active.contractId}/reconciliation`,
        headers: auth(),
      });
      assert.equal(recBefore.json().data.settlementAmountDue, 330);

      const cash = await app.inject({
        method: "POST",
        url: `/contracts/${active.contractId}/reconciliation/cash/settle`,
        headers: auth(),
      });
      assert.equal(cash.statusCode, 200, cash.body);
      assert.equal(cash.json().data.status, "CLOSED");
      assert.equal(
        await prisma.contractPayment.count({
          where: { contractId: active.contractId, purpose: "RECONCILIATION", status: "CONFIRMED" },
        }),
        1,
      );
    });

    test("direct renewal cash during REVIEW is blocked", async () => {
      const active = await nextActive();
      const renewRes = await officeRenew(active.contractId, 2, 220);
      assert.equal(renewRes.statusCode, 200, renewRes.body);
      const renewalId = (renewRes.json().data.renewals as Array<{ id: string }>)[0]!.id;

      await confirmReturnForContract(app, auth, active.contractId);
      await completeCarInToReview(app, auth, active.contractId);

      const collected = await app.inject({
        method: "POST",
        url: `/contracts/${active.contractId}/renewals/${renewalId}/cash/settle`,
        headers: auth(),
      });
      assert.equal(collected.statusCode, 409, collected.body);
      assert.equal(collected.json().error.context.reason, "RENEWAL_INCLUDED_IN_FINAL_SETTLEMENT");
    });

    test("combined reconciliation cash settles renewal and closes contract", async () => {
      const active = await nextActive();
      const renewRes = await officeRenew(active.contractId, 2, 220);
      assert.equal(renewRes.statusCode, 200, renewRes.body);
      const renewalId = (renewRes.json().data.renewals as Array<{ id: string }>)[0]!.id;
      const endAfterRegister = renewRes.json().data.endAt as string;

      await confirmReturnForContract(app, auth, active.contractId);
      await completeCarInToReview(app, auth, active.contractId);

      const vehicleBefore = await prisma.vehicle.findUniqueOrThrow({ where: { id: active.vehicleId } });

      const collected = await app.inject({
        method: "POST",
        url: `/contracts/${active.contractId}/reconciliation/cash/settle`,
        headers: auth(),
      });
      assert.equal(collected.statusCode, 200, collected.body);
      assert.equal(collected.json().data.endAt, endAfterRegister);
      assert.equal(collected.json().data.status, "CLOSED");

      const payment = await prisma.contractPayment.findFirstOrThrow({
        where: { contractId: active.contractId, purpose: "RECONCILIATION", status: "CONFIRMED" },
      });
      assert.equal(payment.amount, 220);
      const renewal = await prisma.contractRenewal.findUniqueOrThrow({ where: { id: renewalId } });
      assert.equal(renewal.settledPaymentId, payment.id);
      assert.equal(
        await prisma.financialLedgerEntry.count({
          where: { contractId: active.contractId, kind: "RENEWAL_PAYMENT" },
        }),
        1,
      );
      assert.equal(
        await prisma.financialLedgerEntry.count({
          where: { contractId: active.contractId, kind: "RECONCILIATION_PAYMENT" },
        }),
        0,
      );

      const vehicleAfter = await prisma.vehicle.findUniqueOrThrow({ where: { id: active.vehicleId } });
      assert.equal(vehicleAfter.operationalStatus, vehicleBefore.operationalStatus);
    });

    test("electronic link-only renewal is superseded by office registration", async () => {
      const active = await nextActive();
      const renewToken = await issueElectronicLink(active.contractId, 4, 500);
      const preview = await app.inject({ method: "GET", url: `/contracts/renew/${renewToken}` });
      assert.equal(preview.statusCode, 200, preview.body);

      const office = await officeRenew(active.contractId, 2, 250);
      assert.equal(office.statusCode, 200, office.body);
      const history = office.json().data.renewals as Array<{ collectionState: string }>;
      assert.equal(history.length, 1);
      assert.equal(history[0]?.collectionState, "OFFICE_UNPAID");

      const oldLink = await app.inject({ method: "GET", url: `/contracts/renew/${renewToken}` });
      assert.ok(oldLink.statusCode >= 400 && oldLink.statusCode < 500, oldLink.body);

      const payAttempt = await app.inject({
        method: "POST",
        url: `/contracts/renew/${renewToken}/payment`,
      });
      assert.ok(payAttempt.statusCode >= 400 && payAttempt.statusCode < 500, payAttempt.body);
    });

    test("active electronic checkout is neutralized before office registration", async () => {
      const active = await nextActive();
      const payments = createFakePaymentProvider(`${run}-office-switch`);
      setPaymentProviderForTests(payments.provider);
      const renewToken = await issueElectronicLink(active.contractId, 3, 330);
      await app.inject({ method: "POST", url: `/contracts/renew/${renewToken}/confirm`, payload: {} });
      const payStart = await app.inject({ method: "POST", url: `/contracts/renew/${renewToken}/payment` });
      assert.equal(payStart.statusCode, 200, payStart.body);

      const office = await officeRenew(active.contractId, 2, 210);
      assert.equal(office.statusCode, 200, office.body);
      assert.equal(
        (office.json().data.renewals as Array<{ collectionState: string }>)[0]?.collectionState,
        "OFFICE_UNPAID",
      );

      const stalePay = await app.inject({
        method: "POST",
        url: `/contracts/renew/${renewToken}/payment`,
      });
      assert.ok(stalePay.statusCode >= 400 && stalePay.statusCode < 500, stalePay.body);
    });

    test("provider-paid electronic renewal wins over office registration attempt", async () => {
      const active = await nextActive();
      const payments = createFakePaymentProvider(`${run}-paid-race`);
      setPaymentProviderForTests(payments.provider);
      const renewToken = await issueElectronicLink(active.contractId, 3, 390);
      await app.inject({ method: "POST", url: `/contracts/renew/${renewToken}/confirm`, payload: {} });
      const payStart = await app.inject({ method: "POST", url: `/contracts/renew/${renewToken}/payment` });
      assert.equal(payStart.statusCode, 200, payStart.body);
      payments.confirm();

      const office = await officeRenew(active.contractId, 1, 100);
      assert.equal(office.statusCode, 409, office.body);
      assert.equal(office.json().error.context.reason, "ALREADY_PAID");

      const detail = await app.inject({ method: "GET", url: `/contracts/${active.contractId}`, headers: auth() });
      assert.equal(detail.json().data.rentalDays, 6);
      assert.equal(
        await prisma.contractRenewal.count({ where: { contractId: active.contractId } }),
        1,
      );
      assert.equal(
        await prisma.contractPayment.count({
          where: { contractId: active.contractId, purpose: "RENEWAL", status: "CONFIRMED" },
        }),
        1,
      );
    });

    test("multiple applied unpaid renewals are preserved and collected independently", async () => {
      const active = await nextActive();
      const first = await officeRenew(active.contractId, 2, 200);
      assert.equal(first.statusCode, 200, first.body);
      const firstId = (first.json().data.renewals as Array<{ id: string }>)[0]!.id;
      const endAfterFirst = first.json().data.endAt as string;

      const second = await officeRenew(active.contractId, 1, 150);
      assert.equal(second.statusCode, 200, second.body);
      const renewals = second.json().data.renewals as Array<{ id: string; collectionState: string }>;
      assert.equal(renewals.length, 2);
      assert.equal(renewals.filter((row) => row.collectionState === "OFFICE_UNPAID").length, 2);
      assert.notEqual(second.json().data.endAt, endAfterFirst);

      const collectFirst = await app.inject({
        method: "POST",
        url: `/contracts/${active.contractId}/renewals/${firstId}/cash/settle`,
        headers: auth(),
      });
      assert.equal(collectFirst.statusCode, 200, collectFirst.body);
      const afterFirst = collectFirst.json().data.renewals as Array<{ id: string; collectionState: string }>;
      assert.equal(afterFirst.find((row) => row.id === firstId)?.collectionState, "PAID");
      assert.equal(afterFirst.find((row) => row.id !== firstId)?.collectionState, "OFFICE_UNPAID");

      const secondId = renewals.find((row) => row.id !== firstId)!.id;
      const collectSecond = await app.inject({
        method: "POST",
        url: `/contracts/${active.contractId}/renewals/${secondId}/cash/settle`,
        headers: auth(),
      });
      assert.equal(collectSecond.statusCode, 200, collectSecond.body);
      assert.equal(
        await prisma.contractPayment.count({
          where: { contractId: active.contractId, purpose: "RENEWAL", status: "CONFIRMED" },
        }),
        2,
      );
    });

    test("zero-amount renewal completes without payment or receivable", async () => {
      const active = await nextActive();
      const endBefore = active.endAt;
      const renew = await officeRenew(active.contractId, 1, 0);
      assert.equal(renew.statusCode, 200, renew.body);
      assert.notEqual(renew.json().data.endAt, endBefore);
      const row = (renew.json().data.renewals as Array<{ collectionState: string }>)[0];
      assert.equal(row?.collectionState, "COMPLETED_NO_CHARGE");
      assert.equal(
        await prisma.contractPayment.count({ where: { contractId: active.contractId, purpose: "RENEWAL" } }),
        0,
      );
      assert.equal(
        await prisma.financialLedgerEntry.count({
          where: { contractId: active.contractId, kind: "RENEWAL_PAYMENT" },
        }),
        0,
      );

      const receivables = await app.inject({
        method: "GET",
        url: `/finance/open-receivables?sourceType=RENEWAL&pageSize=100&search=${encodeURIComponent(active.contractNumber)}`,
        headers: auth(),
      });
      assert.equal(receivables.json().data.length, 0);
    });
  });
}
