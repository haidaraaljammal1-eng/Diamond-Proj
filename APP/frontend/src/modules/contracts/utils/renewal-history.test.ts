import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { renewalCollectionState } from "./renewal-history.ts";
import type { ContractRenewalDto } from "../types/contract.types.ts";

function row(partial: Partial<ContractRenewalDto>): ContractRenewalDto {
  return {
    id: "r1",
    additionalDays: 7,
    additionalAmount: 500,
    previousEndAt: "2026-10-01T00:00:00.000Z",
    newEndAt: "2026-10-08T00:00:00.000Z",
    createdAt: "2026-09-26T00:00:00.000Z",
    approvedAt: null,
    appliedAt: null,
    settledPaymentId: null,
    collectionState: "PENDING",
    extensionApplied: false,
    collectable: false,
    ...partial,
  };
}

describe("renewalCollectionState", () => {
  it("derives pending, awaiting payment, office unpaid, paid, and no-charge states", () => {
    assert.equal(renewalCollectionState(row({ collectionState: "PENDING" })), "PENDING");
    assert.equal(
      renewalCollectionState(
        row({
          collectionState: "AWAITING_PAYMENT",
          approvedAt: "2026-09-26T10:00:00.000Z",
        }),
      ),
      "AWAITING_PAYMENT",
    );
    assert.equal(
      renewalCollectionState(
        row({
          collectionState: "OFFICE_UNPAID",
          approvedAt: "2026-09-26T10:00:00.000Z",
          appliedAt: "2026-09-26T10:05:00.000Z",
          collectable: true,
        }),
      ),
      "OFFICE_UNPAID",
    );
    assert.equal(
      renewalCollectionState(
        row({
          collectionState: "PAID",
          settledPaymentId: "pay-1",
          appliedAt: "2026-09-26T10:05:00.000Z",
        }),
      ),
      "PAID",
    );
    assert.equal(
      renewalCollectionState(row({ additionalAmount: 0, collectionState: "COMPLETED_NO_CHARGE", appliedAt: "x" })),
      "COMPLETED_NO_CHARGE",
    );
  });
});
