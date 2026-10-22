import { test } from "node:test";
import assert from "node:assert/strict";
import { CAR_OUT_PHOTO_ANGLES, CAR_OUT_REQUIRED_ANGLES } from "src/modules/contracts/contracts.constants";
import {
  assertCustodyPhotoAngles,
  carOutPhotoProgress,
  carOutReadiness,
} from "src/modules/contracts/car-out-evidence";
import { carInPhotoProgress, carInReadiness } from "src/modules/contracts/car-in-evidence";

test("final custody vocabulary is exactly FRONT, REAR, LEFT, RIGHT, OTHER", () => {
  assert.deepEqual([...CAR_OUT_REQUIRED_ANGLES], ["FRONT", "REAR", "LEFT", "RIGHT"]);
  assert.deepEqual([...CAR_OUT_PHOTO_ANGLES], ["FRONT", "REAR", "LEFT", "RIGHT", "OTHER"]);
});

test("Car-Out: four required angles complete evidence; OTHER is optional", () => {
  const four = CAR_OUT_REQUIRED_ANGLES.map((angle) => ({ angle }));
  assert.deepEqual(carOutPhotoProgress(four), {
    required: 4,
    completed: 4,
    missing: [],
    complete: true,
  });
  const missingRear = four.filter((p) => p.angle !== "REAR");
  assert.equal(carOutPhotoProgress(missingRear).complete, false);
  assert.deepEqual(carOutPhotoProgress([...four, { angle: "OTHER" }]).complete, true);
});

test("Car-In photo progress matches Car-Out", () => {
  const four = CAR_OUT_REQUIRED_ANGLES.map((angle) => ({ angle }));
  assert.equal(carInPhotoProgress(four).complete, true);
  assert.equal(carInPhotoProgress(four.filter((p) => p.angle !== "LEFT")).complete, false);
});

test("complete Car-Out and Car-In readiness need mileage, fuel, signature, four photos", () => {
  const photos = CAR_OUT_REQUIRED_ANGLES.map((angle) => ({ angle }));
  assert.equal(
    carOutReadiness({ mileageOut: 1, fuelOut: "F", hasSignature: true, photos }).ready,
    true,
  );
  assert.equal(
    carOutReadiness({ mileageOut: null, fuelOut: "F", hasSignature: true, photos }).ready,
    false,
  );
  assert.equal(
    carInReadiness({ mileageIn: 1, fuelIn: "F", hasSignature: true, photos }).ready,
    true,
  );
});

test("assertCustodyPhotoAngles rejects legacy and duplicate angles", () => {
  const photos = CAR_OUT_REQUIRED_ANGLES.map((angle) => ({ angle }));
  assertCustodyPhotoAngles(photos);
  assert.throws(() => assertCustodyPhotoAngles([...photos, { angle: "ODOMETER" }]));
  assert.throws(() => assertCustodyPhotoAngles([...photos, { angle: "FRONT_LEFT" }]));
  assert.throws(() => assertCustodyPhotoAngles(photos.filter((p) => p.angle !== "RIGHT")));
  assert.throws(() => assertCustodyPhotoAngles([...photos, { angle: "FRONT" }]));
});
