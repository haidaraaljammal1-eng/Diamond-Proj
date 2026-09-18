import { test } from "node:test";
import assert from "node:assert/strict";
import { CAR_OUT_REQUIRED_ANGLES } from "src/modules/contracts/contracts.constants";
import { carOutPhotoProgress, carOutReadiness } from "src/modules/contracts/car-out-evidence";

test("six exterior views plus odometer and fuel are required; optional side views do not affect progress", () => {
  assert.deepEqual(CAR_OUT_REQUIRED_ANGLES, [
    "FRONT", "REAR", "FRONT_RIGHT", "REAR_RIGHT", "FRONT_LEFT", "REAR_LEFT", "ODOMETER", "DASHBOARD_FUEL",
  ]);
  const seven = CAR_OUT_REQUIRED_ANGLES.slice(0, 7).map((angle) => ({ angle }));
  assert.deepEqual(carOutPhotoProgress([...seven, { angle: "LEFT" }]), {
    required: 8, completed: 7, missing: ["DASHBOARD_FUEL"], complete: false,
  });
  const complete = carOutReadiness({
    mileageOut: 0, fuelOut: "E", hasSignature: true,
    photos: [...seven, { angle: "DASHBOARD_FUEL" }, { angle: "RIGHT" }],
  });
  assert.equal(complete.complete, true);
  assert.equal(complete.ready, true);
  assert.equal(carOutReadiness({ mileageOut: 0, fuelOut: "E", hasSignature: false,
    photos: CAR_OUT_REQUIRED_ANGLES.map((angle) => ({ angle })) }).ready, false);
});
