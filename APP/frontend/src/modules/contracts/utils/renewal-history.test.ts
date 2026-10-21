import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  compareRenewalsChronological,
  isFirstChronologicalRenewal,
  renewalCollectionState,
  renewalDurationUnitLabelKey,
  renewalStartSourceLabelKey,
  renewalStoredDuration,
  renewalTimelineEndpoints,
  sortRenewalsChronologically,
} from "./renewal-history.ts";
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

describe("renewal timeline endpoints", () => {
  it("maps previousEndAt to start and newEndAt to end", () => {
    const renewal = row({
      previousEndAt: "2026-10-16T11:03:00.000Z",
      newEndAt: "2026-10-16T12:03:00.000Z",
    });
    assert.deepEqual(renewalTimelineEndpoints(renewal), {
      startAt: "2026-10-16T11:03:00.000Z",
      endAt: "2026-10-16T12:03:00.000Z",
    });
  });
});

describe("renewalStoredDuration", () => {
  it("uses hourly fields when present", () => {
    assert.deepEqual(
      renewalStoredDuration(
        row({ additionalDurationValue: 2, additionalDurationUnit: "HOUR", additionalDays: 0 }),
      ),
      { durationValue: 2, durationUnit: "HOUR" },
    );
    assert.equal(renewalDurationUnitLabelKey(row({ additionalDurationUnit: "HOUR" })), "detail.renewalDurationUnitHours");
  });

  it("falls back to additionalDays as days", () => {
    assert.deepEqual(renewalStoredDuration(row({ additionalDays: 3 })), {
      durationValue: 3,
      durationUnit: "DAY",
    });
    assert.equal(renewalDurationUnitLabelKey(row({})), "detail.renewalDurationUnitDays");
  });
});

describe("chronological renewal order", () => {
  const first = row({
    id: "first",
    previousEndAt: "2026-10-03T08:00:00.000Z",
    newEndAt: "2026-10-03T13:00:00.000Z",
    createdAt: "2026-10-02T00:00:00.000Z",
  });
  const second = row({
    id: "second",
    previousEndAt: "2026-10-03T13:00:00.000Z",
    newEndAt: "2026-10-04T13:00:00.000Z",
    createdAt: "2026-10-03T14:00:00.000Z",
  });
  const displayOrder = [second, first];

  it("sorts by previousEndAt regardless of display order", () => {
    const sorted = sortRenewalsChronologically(displayOrder);
    assert.equal(sorted[0]?.id, "first");
    assert.equal(sorted[1]?.id, "second");
    assert.ok(compareRenewalsChronological(first, second) < 0);
  });

  it("labels first vs later renewal start source", () => {
    assert.equal(
      renewalStartSourceLabelKey(displayOrder, "first"),
      "detail.renewalStartFromOriginalContract",
    );
    assert.equal(
      renewalStartSourceLabelKey(displayOrder, "second"),
      "detail.renewalStartFromPriorExtension",
    );
    assert.equal(isFirstChronologicalRenewal(displayOrder, "first"), true);
    assert.equal(isFirstChronologicalRenewal(displayOrder, "second"), false);
  });
});
