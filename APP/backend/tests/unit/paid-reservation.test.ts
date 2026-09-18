import { test } from "node:test";
import assert from "node:assert/strict";
import { canCarOutFromState } from "src/modules/contracts/vehicle-rental-guard";
import { deriveVehicleReservation, isVehicleBookable } from "src/modules/vehicles/vehicles.mapper";

const paidRental = {
  contractId: "paid-contract",
  contractNumber: "DE-2026-000123",
  customerName: "Customer",
  endAt: new Date("2026-09-25T12:00:00Z"),
  status: "paid" as const,
  awaitingHandover: true,
};

test("a PAID contract reserves an operationally AVAILABLE vehicle without making it bookable", () => {
  assert.deepEqual(deriveVehicleReservation(paidRental), {
    isReserved: true,
    contractId: "paid-contract",
    contractNumber: "DE-2026-000123",
    status: "PAID",
    awaitingHandover: true,
  });
  assert.equal(isVehicleBookable("AVAILABLE", true, paidRental), false);
  assert.equal(isVehicleBookable("AVAILABLE", true, null), true);
  assert.equal(isVehicleBookable("SERVICE", true, null), false);
  assert.equal(isVehicleBookable("RENTED", true, null), false);
});

test("reservation ends at Car-Out and never attaches to a different contract", () => {
  assert.equal(deriveVehicleReservation({ ...paidRental, awaitingHandover: false }).isReserved, false);
  assert.equal(deriveVehicleReservation({ ...paidRental, status: "active", awaitingHandover: false }).contractId, null);
  assert.equal(deriveVehicleReservation(null).isReserved, false);
});

test("Car-Out capability belongs only to an uncontested PAID contract awaiting handover", () => {
  const eligible = {
    status: "PAID",
    vehicleId: 1,
    vehicleActive: true,
    vehicleStatus: "AVAILABLE",
    hasCarOut: false,
    hasConflictingContract: false,
  };
  assert.equal(canCarOutFromState(eligible), true);
  for (const status of ["SIGNED", "ACTIVE", "RETOUT", "REVIEW", "CLOSED"]) {
    assert.equal(canCarOutFromState({ ...eligible, status }), false, status);
  }
  assert.equal(canCarOutFromState({ ...eligible, vehicleStatus: "SERVICE" }), false);
  assert.equal(canCarOutFromState({ ...eligible, vehicleStatus: "RENTED" }), false);
  assert.equal(canCarOutFromState({ ...eligible, hasConflictingContract: true }), false);
  assert.equal(canCarOutFromState({ ...eligible, hasCarOut: true }), false);
  assert.equal(canCarOutFromState({ ...eligible, vehicleId: null }), false);
});
