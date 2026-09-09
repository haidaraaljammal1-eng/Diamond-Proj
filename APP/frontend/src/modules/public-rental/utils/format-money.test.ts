import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { formatRentalAmount, formatRentalDays } from "./format-money.ts";

describe("formatRentalAmount", () => {
  it("formats backend amount without recalculating", () => {
    assert.equal(formatRentalAmount(3500, "AED"), "AED 3,500");
    assert.equal(formatRentalAmount(7, "AED"), "AED 7");
  });
});

describe("formatRentalDays", () => {
  it("joins backend days with the translated unit", () => {
    assert.equal(formatRentalDays(7, "Days"), "7 Days");
    assert.equal(formatRentalDays(7, "أيام"), "7 أيام");
  });
});
