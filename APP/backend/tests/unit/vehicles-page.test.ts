import { test } from "node:test";
import assert from "node:assert/strict";
import { normalizePlateNumber } from "src/lib/master-data/code";
import {
  fleetVehicleTypeLabel,
  normalizeFleetTypeKey,
  operationalStatusFromDto,
  operationalStatusToDto,
  resolveCurrentRental,
  resolvePrimaryImage,
  vehicleDisplayName,
} from "src/modules/vehicles/vehicles.mapper";
import { buildVehicleListOrderBy } from "src/modules/vehicles/vehicles-sort";
import { DEMO_FLEET } from "prisma/seed/demo-fleet";
import { CreateVehicleSchema } from "src/modules/vehicles/vehicles.schema";

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

test("vehicleDisplayName prefers direct vehicleName", () => {
  assert.equal(
    vehicleDisplayName({
      vehicleName: "Toyota Land Cruiser",
      modelName: "Legacy Model",
      modelYear: 2024,
      plateNumber: "D 1",
    }),
    "Toyota Land Cruiser",
  );
});

test("vehicleDisplayName falls back to legacy model name and year", () => {
  assert.equal(
    vehicleDisplayName({
      vehicleName: null,
      modelName: "Nissan Patrol Platinum",
      modelYear: 2024,
      plateNumber: null,
    }),
    "Nissan Patrol Platinum 2024",
  );
  assert.equal(
    vehicleDisplayName({
      vehicleName: null,
      modelName: "Mercedes GLE 450",
      modelYear: null,
      plateNumber: null,
    }),
    "Mercedes GLE 450",
  );
});

test("vehicleDisplayName falls back to plate then generic label", () => {
  assert.equal(
    vehicleDisplayName({
      vehicleName: null,
      modelName: null,
      modelYear: null,
      plateNumber: "D 56041",
    }),
    "D 56041",
  );
  assert.equal(
    vehicleDisplayName({
      vehicleName: null,
      modelName: null,
      modelYear: null,
      plateNumber: null,
    }),
    "Vehicle",
  );
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

test("resolveCurrentRental stub stays null; list/detail load from Contracts", () => {
  assert.equal(resolveCurrentRental(99), null);
});

test("CreateVehicleSchema accepts vehicleName without modelId property", () => {
  const parsed = CreateVehicleSchema.parse({
    vehicleName: "Toyota Land Cruiser",
    modelYear: 2025,
    plateNumber: "Dubai A 47291",
    color: "White",
    dailyRate: 750,
    monthlyRate: 14500,
  });
  assert.equal(parsed.vehicleName, "Toyota Land Cruiser");
  assert.equal(parsed.modelId, undefined);
});

test("CreateVehicleSchema rejects empty vehicle identity", () => {
  assert.throws(() => CreateVehicleSchema.parse({ vin: "VIN-ONLY" }));
  assert.throws(() =>
    CreateVehicleSchema.parse({ modelId: null, vin: "VIN-NULL-MODEL" }),
  );
});

test("CreateVehicleSchema accepts legacy modelId without vehicleName", () => {
  const parsed = CreateVehicleSchema.parse({ modelId: 42, vin: "VIN-LEGACY" });
  assert.equal(parsed.modelId, 42);
  assert.equal(parsed.vehicleName, undefined);
});

test("demo fleet seed fixture has diverse realistic distribution", () => {
  assert.equal(DEMO_FLEET.length, 20);
  const plates = new Set(DEMO_FLEET.map((c) => c.plateNumber));
  assert.equal(plates.size, DEMO_FLEET.length);
  const externalIds = new Set(DEMO_FLEET.map((c) => c.externalId));
  assert.equal(externalIds.size, DEMO_FLEET.length);
  assert.equal(DEMO_FLEET.filter((c) => c.status === "AVAILABLE").length, 9);
  assert.equal(DEMO_FLEET.filter((c) => c.status === "RENTED").length, 7);
  assert.equal(DEMO_FLEET.filter((c) => c.status === "SERVICE").length, 4);
  assert.equal(DEMO_FLEET.filter((c) => !c.isActive).length, 0);
  const rates = new Set(DEMO_FLEET.map((c) => c.dailyRate));
  assert.ok(rates.size > 1);
  assert.equal(DEMO_FLEET.filter((c) => c.dailyRate === 0).length, 2);
  const years = new Set(DEMO_FLEET.map((c) => c.modelYear));
  assert.ok(years.size > 1);
});

test("fleetVehicleTypeLabel prefers direct vehicleName over legacy model", () => {
  assert.equal(fleetVehicleTypeLabel("Toyota Supra", "Legacy"), "Toyota Supra");
  assert.equal(fleetVehicleTypeLabel(null, "Nissan Patrol"), "Nissan Patrol");
  assert.equal(fleetVehicleTypeLabel(null, null), null);
});

test("normalizeFleetTypeKey deduplicates case variants", () => {
  assert.equal(
    normalizeFleetTypeKey(" Toyota Land Cruiser "),
    normalizeFleetTypeKey("toyota land cruiser"),
  );
});

test("buildVehicleListOrderBy places nulls first on dailyRate asc", () => {
  const orderBy = buildVehicleListOrderBy("dailyRate", "asc");
  assert.deepEqual(orderBy[0], { dailyRate: { sort: "asc", nulls: "first" } });
  assert.deepEqual(orderBy[1], { createdAt: "desc" });
  assert.deepEqual(orderBy[2], { id: "desc" });
});

test("buildVehicleListOrderBy places nulls last on dailyRate desc", () => {
  const orderBy = buildVehicleListOrderBy("dailyRate", "desc");
  assert.deepEqual(orderBy[0], { dailyRate: { sort: "desc", nulls: "last" } });
});
