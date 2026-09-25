import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  formatFuelDifferenceEighths,
  formatFuelLevelEighths,
  fuelLevelToEighths,
} from "./reconciliation-fuel-format.ts";

describe("reconciliation fuel eighths display", () => {
  it("maps stored fuel levels to x/8", () => {
    assert.equal(fuelLevelToEighths("F"), 8);
    assert.equal(fuelLevelToEighths("1/2"), 4);
    assert.equal(fuelLevelToEighths("1/4"), 2);
    assert.equal(fuelLevelToEighths("5/8"), 5);
    assert.equal(fuelLevelToEighths("E"), 0);
  });

  it("formats fuel levels for reconciliation table", () => {
    assert.equal(formatFuelLevelEighths("F"), "8/8");
    assert.equal(formatFuelLevelEighths("1/2"), "4/8");
    assert.equal(formatFuelLevelEighths("1/4"), "2/8");
    assert.equal(formatFuelLevelEighths("5/8"), "5/8");
    assert.equal(formatFuelLevelEighths(null), "—");
  });

  it("formats fuel difference as signed x/8", () => {
    assert.equal(formatFuelDifferenceEighths(4), "+4/8");
    assert.equal(formatFuelDifferenceEighths(-3), "-3/8");
    assert.equal(formatFuelDifferenceEighths(0), "0/8");
    assert.equal(formatFuelDifferenceEighths(null), "—");
  });
});
