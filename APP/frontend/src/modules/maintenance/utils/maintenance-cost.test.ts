import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { isMaintenanceCostMissing } from "./maintenance-cost.ts";

describe("isMaintenanceCostMissing", () => {
  it("treats null and undefined as missing", () => {
    assert.equal(isMaintenanceCostMissing(null), true);
    assert.equal(isMaintenanceCostMissing(undefined), true);
  });

  it("treats zero and positive integers as present", () => {
    assert.equal(isMaintenanceCostMissing(0), false);
    assert.equal(isMaintenanceCostMissing(150), false);
  });
});
