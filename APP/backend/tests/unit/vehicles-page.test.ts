import { test } from "node:test";
import assert from "node:assert/strict";
import { normalizePlateNumber } from "src/lib/master-data/code";
import {
  operationalStatusFromDto,
  operationalStatusToDto,
  resolveCurrentRental,
  resolvePrimaryImage,
  vehicleDisplayName,
} from "src/modules/vehicles/vehicles.mapper";

test("normalizePlateNumber trims, collapses spaces and uppercases", () => {
  assert.equal(normalizePlateNumber("  d 56041 "), "D 56041");
  assert.equal(normalizePlateNumber("k  21883"), "K 21883");
});

test("operational status DTO mapping is symmetric", () => {
  assert.equal(operationalStatusToDto("AVAILABLE"), "available");
  assert.equal(operationalStatusToDto("RENTED"), "rented");
  assert.equal(operationalStatusToDto("SERVICE"), "service");
  assert.equal(operationalStatusFromDto("available"), "AVAILABLE");
  assert.equal(operationalStatusFromDto("rented"), "RENTED");
  assert.equal(operationalStatusFromDto("service"), "SERVICE");
});

test("vehicleDisplayName combines model name and year", () => {
  assert.equal(vehicleDisplayName("Nissan Patrol Platinum", 2024), "Nissan Patrol Platinum 2024");
  assert.equal(vehicleDisplayName("Mercedes GLE 450", null), "Mercedes GLE 450");
});

test("resolvePrimaryImage prefers isPrimary then sortOrder", () => {
  const primary = resolvePrimaryImage(1, [
    {
      id: "b",
      attachmentId: "att-b",
      sortOrder: 1,
      isPrimary: false,
      attachment: { mimeType: "image/jpeg" },
    },
    {
      id: "a",
      attachmentId: "att-a",
      sortOrder: 0,
      isPrimary: true,
      attachment: { mimeType: "image/jpeg" },
    },
  ]);
  assert.equal(primary?.id, "a");
  assert.equal(primary?.url, "/vehicles/1/photos/a/stream");
});

test("resolveCurrentRental returns null until Contracts domain exists", () => {
  assert.equal(resolveCurrentRental(99), null);
});
