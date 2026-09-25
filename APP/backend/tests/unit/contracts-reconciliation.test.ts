import { describe, test } from "node:test";
import assert from "node:assert/strict";
import {
  buildReconciliationImagePairs,
  computeFuelDifference,
  computeTotalsBreakdown,
  canStaffReconcileContract,
  isReconciliationFinalized,
  isReconciliationSettled,
  loadActiveReconciliationPaymentLink,
} from "src/modules/contracts/contracts-reconciliation";

describe("contracts-reconciliation", () => {
  test("pairs OUT/IN photos by exact angle regardless of input order", () => {
    const pairs = buildReconciliationImagePairs(
      "contract-1",
      [
        { id: "out-b", angle: "REAR" },
        { id: "out-a", angle: "FRONT" },
      ],
      [
        { id: "in-a", angle: "FRONT" },
        { id: "in-b", angle: "REAR" },
      ],
    );
    assert.equal(pairs.length, 2);
    const front = pairs.find((pair) => pair.angle === "FRONT");
    assert.equal(front?.outPhoto?.id, "out-a");
    assert.equal(front?.inPhoto?.id, "in-a");
  });

  test("handles missing one side safely", () => {
    const pairs = buildReconciliationImagePairs(
      "contract-1",
      [{ id: "out-only", angle: "FRONT" }],
      [],
    );
    assert.equal(pairs.length, 1);
    assert.ok(pairs[0]?.outPhoto);
    assert.equal(pairs[0]?.inPhoto, null);
  });

  test("computes fuel difference as IN eighths minus OUT eighths", () => {
    assert.equal(computeFuelDifference("F", "1/2"), -4);
    assert.equal(computeFuelDifference("1/2", "F"), 4);
    assert.equal(computeFuelDifference("F", "1/8"), -7);
    assert.equal(computeFuelDifference("1/2", "3/4"), 2);
    assert.equal(computeFuelDifference(null, "F"), null);
  });

  test("zero finalAmount does not imply settled without settledAt", () => {
    assert.equal(isReconciliationSettled({ finalAmount: 0, settledAt: null }), false);
    assert.equal(isReconciliationSettled({ finalAmount: 0, settledAt: new Date() }), true);
    assert.equal(isReconciliationSettled({ finalAmount: 570, settledAt: null }), false);
    assert.equal(isReconciliationSettled({ finalAmount: 570, settledAt: new Date() }), true);
  });

  test("computes server-side totals breakdown", () => {
    const totals = computeTotalsBreakdown([
      { type: "DAMAGE", amount: 100 },
      { type: "DAMAGE", amount: 50 },
      { type: "FUEL", amount: 20 },
      { type: "SALIK", amount: 4 },
      { type: "VIOLATION", amount: 120 },
      { type: "LATE", amount: 10 },
      { type: "OTHER", amount: 5 },
    ]);
    assert.equal(totals.damages, 150);
    assert.equal(totals.fuel, 20);
    assert.equal(totals.salik, 4);
    assert.equal(totals.violations, 120);
    assert.equal(totals.finalAmount, 309);
  });

  test("treats finalizedAt or legacy approvedAt as finalized", () => {
    assert.equal(isReconciliationFinalized({ finalizedAt: null, approvedAt: new Date() }), true);
    assert.equal(isReconciliationFinalized({ finalizedAt: new Date(), approvedAt: null }), true);
    assert.equal(isReconciliationFinalized({ finalizedAt: null, approvedAt: null }), false);
  });

  test("active reconciliation payment link metadata ignores revoked and expired links", async () => {
    const contractId = "00000000-0000-4000-8000-000000000099";
    const prisma = {
      contractLink: {
        findFirst: async () => ({
          expiresAt: new Date(Date.now() + 60_000),
        }),
      },
    };
    const active = await loadActiveReconciliationPaymentLink(prisma as never, contractId);
    assert.equal(active.active, true);
    assert.ok(active.expiresAt);

    const expiredPrisma = {
      contractLink: {
        findFirst: async () => ({
          expiresAt: new Date(Date.now() - 60_000),
        }),
      },
    };
    const expired = await loadActiveReconciliationPaymentLink(expiredPrisma as never, contractId);
    assert.equal(expired.active, false);
    assert.equal(expired.expiresAt, null);
  });

  test("staff reconcile action hides for settled REVIEW and CLOSED", () => {
    assert.equal(
      canStaffReconcileContract({
        status: "REVIEW",
        reconciliation: { finalAmount: 570, settledAt: new Date() },
      }),
      false,
    );
    assert.equal(
      canStaffReconcileContract({
        status: "REVIEW",
        reconciliation: { finalAmount: 570, settledAt: null },
      }),
      true,
    );
    assert.equal(
      canStaffReconcileContract({
        status: "REVIEW",
        reconciliation: { finalAmount: 0, settledAt: null },
      }),
      true,
    );
    assert.equal(
      canStaffReconcileContract({
        status: "CLOSED",
        reconciliation: { finalAmount: 570, settledAt: new Date() },
      }),
      false,
    );
  });
});
