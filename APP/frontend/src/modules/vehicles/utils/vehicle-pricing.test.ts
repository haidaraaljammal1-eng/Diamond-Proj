import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  defaultPriceForPeriod,
  deriveHourlyRate,
  deriveMonthlyRate,
  deriveWeeklyRate,
} from "./vehicle-pricing.ts";

describe("vehicle-pricing", () => {
  it("derives weekly rate from daily using demo multiplier", () => {
    assert.equal(deriveWeeklyRate(1000), 6160);
  });

  it("prefers backend monthly rate when present", () => {
    assert.equal(deriveMonthlyRate(1000, 24000), 24000);
  });

  it("derives monthly from daily when monthly is null", () => {
    assert.equal(deriveMonthlyRate(1000, null), 30000);
  });

  it("derives hourly as daily divided by eight", () => {
    assert.equal(deriveHourlyRate(1200), 150);
  });

  it("returns default prices per rental period", () => {
    assert.equal(defaultPriceForPeriod(1000, 24000, "daily"), 1000);
    assert.equal(defaultPriceForPeriod(1000, 24000, "weekly"), 6160);
    assert.equal(defaultPriceForPeriod(1000, 24000, "monthly"), 24000);
  });
});
