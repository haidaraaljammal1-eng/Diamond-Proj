import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { resolveFleetPrimaryIntent } from "./resolve-fleet-contract-intent.ts";

const paid = {
  contractId: "ct-paid",
  contractNumber: "C-PAID",
  customerName: "Omar",
  endAt: "2026-12-01T00:00:00.000Z",
  status: "paid" as const,
  awaitingHandover: true,
};
const active = { ...paid, contractId: "ct-active", status: "active" as const, awaitingHandover: false };
const retout = { ...paid, contractId: "ct-retout", status: "retout" as const, awaitingHandover: false };

const activeFleetCard = { isActive: true as const };

describe("resolveFleetPrimaryIntent", () => {
  it("AVAILABLE + no context → set rental price", () => {
    assert.deepEqual(
      resolveFleetPrimaryIntent({
        ...activeFleetCard,
        operationalStatus: "available",
        currentRental: null,
        prePaymentFollowUps: [],
      }),
      { type: "set-rental-price" },
    );
  });

  it("PAID handover → car-out", () => {
    assert.deepEqual(
      resolveFleetPrimaryIntent({
        ...activeFleetCard,
        operationalStatus: "available",
        currentRental: paid,
        prePaymentFollowUps: [],
      }),
      { type: "car-out", contractId: "ct-paid" },
    );
  });

  it("RENTED active → open contract", () => {
    assert.deepEqual(
      resolveFleetPrimaryIntent({
        ...activeFleetCard,
        operationalStatus: "rented",
        currentRental: active,
        prePaymentFollowUps: [],
      }),
      { type: "open-contract", contractId: "ct-active" },
    );
  });

  it("RETOUT → open contract", () => {
    assert.deepEqual(
      resolveFleetPrimaryIntent({
        ...activeFleetCard,
        operationalStatus: "rented",
        currentRental: retout,
        prePaymentFollowUps: [],
      }),
      { type: "open-contract", contractId: "ct-retout" },
    );
  });

  it("urgent follow-up with one offer opens that contract", () => {
    assert.deepEqual(
      resolveFleetPrimaryIntent({
        ...activeFleetCard,
        operationalStatus: "available",
        currentRental: null,
        prePaymentFollowUps: [
          { contractId: "a", contractNumber: "1", status: "awaiting", customerName: null },
        ],
      }),
      { type: "urgent-follow-up", contractId: "a" },
    );
  });

  it("urgent follow-up with legacy duplicates requires explicit choice", () => {
    assert.deepEqual(
      resolveFleetPrimaryIntent({
        ...activeFleetCard,
        operationalStatus: "available",
        currentRental: null,
        prePaymentFollowUps: [
          { contractId: "a", contractNumber: "1", status: "awaiting", customerName: null },
          { contractId: "b", contractNumber: "2", status: "signed", customerName: null },
        ],
      }),
      { type: "urgent-follow-up-choose", contractIds: ["a", "b"] },
    );
  });

  it("blocking rental wins over urgent offers", () => {
    assert.deepEqual(
      resolveFleetPrimaryIntent({
        ...activeFleetCard,
        operationalStatus: "rented",
        currentRental: active,
        prePaymentFollowUps: [
          { contractId: "a", contractNumber: "1", status: "awaiting", customerName: null },
        ],
      }),
      { type: "open-contract", contractId: "ct-active" },
    );
  });
});
