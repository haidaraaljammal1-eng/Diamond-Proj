import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { dateAndTimeToIso, isoToDateInput, isoToTimeInput } from "./maintenance-datetime.ts";

describe("maintenance datetime", () => {
  it("round-trips a local date and time through ISO", () => {
    const iso = dateAndTimeToIso("2026-09-15", "09:30");
    assert.ok(iso);
    assert.equal(isoToDateInput(iso), "2026-09-15");
    assert.equal(isoToTimeInput(iso), "09:30");
  });

  it("returns null for an empty date", () => {
    assert.equal(dateAndTimeToIso("", "09:00"), null);
  });

  it("defaults a missing time to 09:00 local", () => {
    const iso = dateAndTimeToIso("2026-09-15", "");
    assert.ok(iso);
    assert.equal(isoToTimeInput(iso), "09:00");
  });
});
