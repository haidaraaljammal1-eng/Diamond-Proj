import assert from "node:assert/strict";
import { test } from "node:test";
import { CUSTODY_OPTIONAL_ANGLES, CUSTODY_REQUIRED_ANGLES } from "./custody-angles.ts";

test("Car-In and Car-Out share four required slots in product order", () => {
  assert.deepEqual([...CUSTODY_REQUIRED_ANGLES], ["FRONT", "REAR", "LEFT", "RIGHT"]);
});

test("OTHER is the only optional slot", () => {
  assert.deepEqual([...CUSTODY_OPTIONAL_ANGLES], ["OTHER"]);
  const required = new Set<string>(CUSTODY_REQUIRED_ANGLES);
  assert.ok(CUSTODY_OPTIONAL_ANGLES.every((angle) => !required.has(angle)));
});

test("no legacy Car-In photo vocabulary survives", () => {
  const legacy = ["RIGHT_SIDE", "LEFT_SIDE", "FRONT_PLATE", "REAR_PLATE", "INTERIOR_ODOMETER", "TIRES"];
  const used = new Set<string>([...CUSTODY_REQUIRED_ANGLES, ...CUSTODY_OPTIONAL_ANGLES]);
  assert.ok(legacy.every((angle) => !used.has(angle)));
});
