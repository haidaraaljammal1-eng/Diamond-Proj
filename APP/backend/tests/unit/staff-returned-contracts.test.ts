import { describe, test } from "node:test";
import assert from "node:assert/strict";
import {
  isReturnedContractEligible,
  returnedContractWindowStart,
} from "src/modules/road-liabilities/staff-returned-contracts.service";
import { RETURNED_CONTRACT_WINDOW_MS } from "src/modules/road-liabilities/road-liability.constants";
import { isChargeableRoadLiability } from "src/modules/road-liabilities/road-liability.mapper";

describe("off-session collection contract eligibility", () => {
  const now = new Date("2026-10-13T12:00:00.000Z");

  test("includes car-in exactly at lower boundary", () => {
    const start = returnedContractWindowStart(now);
    assert.equal(start.getTime(), now.getTime() - RETURNED_CONTRACT_WINDOW_MS);
    assert.equal(
      isReturnedContractEligible(
        { status: "REVIEW", carIn: { occurredAt: start } },
        now,
      ),
      true,
    );
  });

  test("excludes car-in one ms before window", () => {
    const start = returnedContractWindowStart(now);
    const before = new Date(start.getTime() - 1);
    assert.equal(
      isReturnedContractEligible({ status: "CLOSED", carIn: { occurredAt: before } }, now),
      false,
    );
  });

  test("includes ACTIVE without car-in", () => {
    assert.equal(isReturnedContractEligible({ status: "ACTIVE", carIn: null }, now), true);
  });

  test("excludes pre-ACTIVE without car-in", () => {
    for (const status of ["AWAITING", "FORM", "SIGNED", "PAID"]) {
      assert.equal(isReturnedContractEligible({ status, carIn: null }, now), false);
    }
  });

  test("includes RETOUT within post-car-in window", () => {
    const recent = new Date(now.getTime() - 2 * 24 * 60 * 60 * 1000);
    assert.equal(
      isReturnedContractEligible({ status: "RETOUT", carIn: { occurredAt: recent } }, now),
      true,
    );
  });

  test("expires exactly at car-in plus 30 days (inclusive at boundary)", () => {
    const carInAt = new Date(now.getTime() - RETURNED_CONTRACT_WINDOW_MS);
    assert.equal(
      isReturnedContractEligible({ status: "REVIEW", carIn: { occurredAt: carInAt } }, now),
      true,
    );
    const expired = new Date(carInAt.getTime() - 1);
    assert.equal(
      isReturnedContractEligible({ status: "REVIEW", carIn: { occurredAt: expired } }, now),
      false,
    );
  });

  test("post-car-in statuses require car-in timestamp", () => {
    assert.equal(isReturnedContractEligible({ status: "REVIEW", carIn: null }, now), false);
    assert.equal(isReturnedContractEligible({ status: "RETOUT", carIn: null }, now), false);
  });
});

describe("staff manual chargeability", () => {
  test("staff manual confirmed liability is collectible", () => {
    assert.equal(
      isChargeableRoadLiability({
        confirmationStatus: "CONFIRMED",
        attributionStatus: "MATCHED",
        attributedContractId: "c1",
        amount: 100,
        collectionStatus: "OPEN",
        authoritativeSourceKey: "STAFF_MANUAL",
        staffEnteredAt: new Date(),
      }),
      true,
    );
  });
});
