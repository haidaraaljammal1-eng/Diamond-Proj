import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  deriveRenewalCollectionState,
  isRenewalFinanciallySettled,
} from "src/modules/contracts/contracts-renewal-collection";

describe("contracts-renewal-collection", () => {
  it("derives collection states from authoritative renewal fields", () => {
    assert.equal(
      deriveRenewalCollectionState({
        additionalAmount: 500,
        approvedAt: null,
        appliedAt: null,
        settledPaymentId: null,
      }),
      "PENDING",
    );
    assert.equal(
      deriveRenewalCollectionState({
        additionalAmount: 500,
        approvedAt: new Date(),
        appliedAt: null,
        settledPaymentId: null,
      }),
      "AWAITING_PAYMENT",
    );
    assert.equal(
      deriveRenewalCollectionState({
        additionalAmount: 500,
        approvedAt: new Date(),
        appliedAt: new Date(),
        settledPaymentId: null,
      }),
      "OFFICE_UNPAID",
    );
    assert.equal(
      deriveRenewalCollectionState({
        additionalAmount: 500,
        approvedAt: new Date(),
        appliedAt: new Date(),
        settledPaymentId: "pay-1",
      }),
      "PAID",
    );
    assert.equal(
      deriveRenewalCollectionState({
        additionalAmount: 0,
        approvedAt: new Date(),
        appliedAt: new Date(),
        settledPaymentId: null,
      }),
      "COMPLETED_NO_CHARGE",
    );
  });

  it("treats positive renewals as financially settled only with settledPaymentId", () => {
    assert.equal(
      isRenewalFinanciallySettled({
        additionalAmount: 400,
        approvedAt: new Date(),
        appliedAt: new Date(),
        settledPaymentId: null,
      }),
      false,
    );
    assert.equal(
      isRenewalFinanciallySettled({
        additionalAmount: 400,
        approvedAt: new Date(),
        appliedAt: new Date(),
        settledPaymentId: "pay-1",
      }),
      true,
    );
    assert.equal(
      isRenewalFinanciallySettled({
        additionalAmount: 0,
        approvedAt: new Date(),
        appliedAt: new Date(),
        settledPaymentId: null,
      }),
      true,
    );
  });
});
