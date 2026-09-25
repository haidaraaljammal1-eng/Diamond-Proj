import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { formatRentalDuration } from "./format-rental-duration.ts";

const en = (key: string, values: { count: number }) => {
  const map: Record<string, Record<number, string>> = {
    hours: { 2: "2 hours" },
    days: { 3: "3 days" },
    weeks: { 2: "2 weeks" },
    months: { 1: "1 month" },
  };
  return map[key]?.[values.count] ?? `${values.count} ${key}`;
};

describe("formatRentalDuration", () => {
  it("formats custom duration cases", () => {
    assert.equal(formatRentalDuration({ durationValue: 2, durationUnit: "HOUR" }, en), "2 hours");
    assert.equal(formatRentalDuration({ durationValue: 3, durationUnit: "DAY" }, en), "3 days");
    assert.equal(formatRentalDuration({ durationValue: 2, durationUnit: "WEEK" }, en), "2 weeks");
    assert.equal(formatRentalDuration({ durationValue: 1, durationUnit: "MONTH" }, en), "1 month");
  });
});
