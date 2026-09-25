import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { resolveVehiclePlateFields } from "src/modules/vehicles/vehicle-plate";

describe("resolveVehiclePlateFields", () => {
  it("splits Dubai combined plates into code and numeric number", () => {
    assert.deepEqual(
      resolveVehiclePlateFields({ plateNumber: "DUBAI W 44503" }),
      { plateCode: "W", plateNumber: "44503" },
    );
    assert.deepEqual(
      resolveVehiclePlateFields({ plateNumber: "Dubai V 44503" }),
      { plateCode: "V", plateNumber: "44503" },
    );
  });

  it("splits short emirate-less plates", () => {
    assert.deepEqual(
      resolveVehiclePlateFields({ plateNumber: "Q 12345" }),
      { plateCode: "Q", plateNumber: "12345" },
    );
  });

  it("uses structured vehicle plateCode when present", () => {
    assert.deepEqual(
      resolveVehiclePlateFields({ plateCode: "W", plateNumber: "44503" }),
      { plateCode: "W", plateNumber: "44503" },
    );
  });

  it("keeps unrecognized plates in plateNumber only", () => {
    assert.deepEqual(
      resolveVehiclePlateFields({ plateNumber: "CUSTOM-PLATE" }),
      { plateCode: null, plateNumber: "CUSTOM-PLATE" },
    );
  });
});
