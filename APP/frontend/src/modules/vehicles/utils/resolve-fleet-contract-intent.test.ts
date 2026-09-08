import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { resolveFleetPrimaryIntent } from "./resolve-fleet-contract-intent.ts";

const paid = {
  contractId: "ct-paid",
  customerName: "Omar",
  endAt: "2026-12-01T00:00:00.000Z",
  status: "paid" as const,
};
const active = { ...paid, contractId: "ct-active", status: "active" as const };
const retout = { ...paid, contractId: "ct-retout", status: "retout" as const };
const review = { ...paid, contractId: "ct-review", status: "review" as const };

describe("resolveFleetPrimaryIntent", () => {
  it("A. AVAILABLE + no currentRental → Set Rental Price", () => {
    assert.deepEqual(
      resolveFleetPrimaryIntent({ operationalStatus: "available", currentRental: null }),
      { type: "set-rental-price" },
    );
  });

  it("D. PAID vehicle → Car-Out using currentRental.contractId", () => {
    assert.deepEqual(
      resolveFleetPrimaryIntent({
        operationalStatus: "available",
        currentRental: paid,
      }),
      { type: "car-out", contractId: "ct-paid" },
    );
  });

  it("E/F. RENTED + active → Generate Return Link", () => {
    assert.deepEqual(
      resolveFleetPrimaryIntent({
        operationalStatus: "rented",
        currentRental: active,
      }),
      { type: "generate-return-link", contractId: "ct-active" },
    );
  });

  it("RETOUT opens contract detail instead of minting a new link", () => {
    assert.deepEqual(
      resolveFleetPrimaryIntent({
        operationalStatus: "rented",
        currentRental: retout,
      }),
      { type: "open-contract", contractId: "ct-retout" },
    );
  });

  it("G. REVIEW → Reconciliation", () => {
    assert.deepEqual(
      resolveFleetPrimaryIntent({
        operationalStatus: "rented",
        currentRental: review,
      }),
      { type: "reconcile", contractId: "ct-review" },
    );
  });

  it("H. CLOSED vehicle is AVAILABLE again → Set Rental Price", () => {
    assert.deepEqual(
      resolveFleetPrimaryIntent({ operationalStatus: "available", currentRental: null }),
      { type: "set-rental-price" },
    );
  });
});
