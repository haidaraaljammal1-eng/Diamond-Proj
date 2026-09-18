import { test } from "node:test";
import assert from "node:assert/strict";
import { CAR_OUT_REQUIRED_ANGLES } from "src/modules/contracts/contracts.constants";
import { carOutPhotoProgress, carOutReadiness } from "src/modules/contracts/car-out-evidence";

test("eight exterior views are required; optional operational views do not affect progress", () => {
  const seven = CAR_OUT_REQUIRED_ANGLES.slice(0, 7).map((angle) => ({ angle }));
  assert.deepEqual(carOutPhotoProgress([...seven, { angle: "ODOMETER" }]), {
    required: 8, completed: 7, missing: ["REAR_RIGHT"], complete: false,
  });
  const complete = carOutReadiness({
    mileageOut: 0, fuelOut: "E", hasSignature: true,
    photos: [...seven, { angle: "REAR_RIGHT" }, { angle: "DASHBOARD_FUEL" }],
  });
  assert.equal(complete.complete, true);
  assert.equal(complete.ready, true);
  assert.equal(carOutReadiness({ mileageOut: 0, fuelOut: "E", hasSignature: false,
    photos: CAR_OUT_REQUIRED_ANGLES.map((angle) => ({ angle })) }).ready, false);
});
