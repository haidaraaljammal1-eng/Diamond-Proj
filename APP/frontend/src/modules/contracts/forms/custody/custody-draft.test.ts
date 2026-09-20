import assert from "node:assert/strict";
import { test } from "node:test";
import { buildCarInDraftPatch, validateCustodyStepOne } from "./custody-draft.ts";

const COMPLETE = { mileage: "41200", fuel: "3/4" as const, signatureDrawn: true, signaturePresent: false };

test("a plain draft save accepts partial return data", () => {
  assert.equal(validateCustodyStepOne({ mileage: "", fuel: null, signatureDrawn: false, signaturePresent: false }, false), null);
});

test("mileage must be a whole number of 0 or greater, on a draft save too", () => {
  assert.equal(validateCustodyStepOne({ ...COMPLETE, mileage: "41.5" }, false), "invalidMileage");
  assert.equal(validateCustodyStepOne({ ...COMPLETE, mileage: "-3" }, false), "invalidMileage");
  assert.equal(validateCustodyStepOne({ ...COMPLETE, mileage: "abc" }, false), "invalidMileage");
  assert.equal(validateCustodyStepOne({ ...COMPLETE, mileage: "0" }, true), null);
});

test("moving on to the photos requires mileage, fuel and a signature", () => {
  assert.equal(validateCustodyStepOne({ ...COMPLETE, mileage: "" }, true), "stepOneRequired");
  assert.equal(validateCustodyStepOne({ ...COMPLETE, fuel: null }, true), "stepOneRequired");
  assert.equal(validateCustodyStepOne({ ...COMPLETE, signatureDrawn: false }, true), "stepOneRequired");
  // A signature saved earlier satisfies the same requirement on a resumed draft.
  assert.equal(validateCustodyStepOne({ ...COMPLETE, signatureDrawn: false, signaturePresent: true }, true), null);
  assert.equal(validateCustodyStepOne(COMPLETE, true), null);
});

test("the draft patch omits empty values and always carries damage and notes", () => {
  assert.deepEqual(buildCarInDraftPatch({ mileage: "", fuel: null, damage: [], notes: "" }), { damageIn: [], notes: null });
  assert.deepEqual(
    buildCarInDraftPatch({ mileage: " 41200 ", fuel: "1/2", damage: [{ zone: "DOOR_FL", type: "DENT" }], notes: "scuffed bumper" }),
    { mileageIn: 41200, fuelIn: "1/2", damageIn: [{ zone: "DOOR_FL", type: "DENT" }], notes: "scuffed bumper" },
  );
});

test("the IN patch never carries OUT fields", () => {
  const patch = buildCarInDraftPatch({ mileage: "41200", fuel: "F", damage: [], notes: "" });
  assert.deepEqual(Object.keys(patch).filter((key) => key.endsWith("Out")), []);
});
