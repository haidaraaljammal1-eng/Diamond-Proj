import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  formatRentalDurationCompact,
  getRentalDurationParts,
  shouldShowCurrentRental,
  shouldShowRentalTimer,
} from "./rental-timer.ts";

describe("rental-timer", () => {
  it("computes remaining duration parts", () => {
    const now = Date.parse("2026-09-06T12:00:00.000Z");
    const endAt = "2026-09-08T15:30:00.000Z";
    const parts = getRentalDurationParts(endAt, now);
    assert.equal(parts.days, 2);
    assert.equal(parts.hours, 3);
    assert.equal(parts.minutes, 30);
    assert.equal(parts.expired, false);
  });

  it("marks expired rentals", () => {
    const parts = getRentalDurationParts("2020-01-01T00:00:00.000Z", Date.now());
    assert.equal(parts.expired, true);
  });

  it("does not show renter when currentRental is null", () => {
    assert.equal(shouldShowCurrentRental("rented", null), false);
  });

  it("shows renter only when rented with real rental data", () => {
    assert.equal(
      shouldShowCurrentRental("rented", {
        customerName: "Ahmed",
        endAt: "2026-12-01T00:00:00.000Z",
      }),
      true,
    );
  });

  it("does not show timer without endAt", () => {
    assert.equal(shouldShowRentalTimer("rented", null), false);
  });

  it("shows timer when rented with endAt", () => {
    assert.equal(
      shouldShowRentalTimer("rented", { endAt: "2026-12-01T00:00:00.000Z" }),
      true,
    );
  });

  it("formats compact duration with English units regardless of locale", () => {
    const parts = getRentalDurationParts("2026-09-08T15:30:00.000Z", Date.parse("2026-09-06T12:00:00.000Z"));
    assert.equal(formatRentalDurationCompact(parts), "2d · 3h · 30m");
  });

  it("omits zero days and uses English units", () => {
    const parts = getRentalDurationParts("2026-09-06T14:24:00.000Z", Date.parse("2026-09-06T12:00:00.000Z"));
    assert.equal(formatRentalDurationCompact(parts), "2h · 24m");
  });

  it("formats expired duration in English units", () => {
    assert.equal(
      formatRentalDurationCompact(getRentalDurationParts("2020-01-01T00:00:00.000Z", Date.now())),
      "0d · 0h · 0m",
    );
  });
});
