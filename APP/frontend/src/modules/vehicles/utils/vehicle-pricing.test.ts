import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  defaultRateForPriceType,
  deriveHourlyRate,
  deriveWeeklyRate,
  isStandardPriceType,
} from "./vehicle-pricing.ts";

const vehicle = {
  hourlyRate: 94,
  dailyRate: 750,
  weeklyRate: 4620,
  monthlyRate: 14500,
};

describe("vehicle-pricing", () => {
  it("reads stored default rates per price type", () => {
    assert.equal(defaultRateForPriceType(vehicle, "HOURLY"), 94);
    assert.equal(defaultRateForPriceType(vehicle, "DAILY"), 750);
    assert.equal(defaultRateForPriceType(vehicle, "WEEKLY"), 4620);
    assert.equal(defaultRateForPriceType(vehicle, "MONTHLY"), 14500);
    assert.equal(defaultRateForPriceType(vehicle, "CUSTOM"), null);
  });

  it("keeps legacy derive helpers for fallback callers", () => {
    assert.equal(deriveWeeklyRate(1000), 6160);
    assert.equal(deriveHourlyRate(1200), 150);
  });

  it("identifies standard pricing modes", () => {
    assert.equal(isStandardPriceType("WEEKLY"), true);
    assert.equal(isStandardPriceType("CUSTOM"), false);
  });
});
