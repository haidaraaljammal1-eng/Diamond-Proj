import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { vehicleOptionHint, vehicleOptionLabel } from "./vehicle-option-label.ts";

describe("vehicleOptionLabel", () => {
  it("puts the plate on the option so identical models stay distinguishable", () => {
    const vehicle = {
      id: 1,
      displayName: "Toyota Corolla 2025",
      plateNumber: "Dubai A 45821",
      modelYear: 2025,
      color: "White",
    };
    assert.match(vehicleOptionLabel(vehicle), /Dubai A 45821/);
    assert.equal(vehicleOptionHint(vehicle), "2025 · White");
  });
});
