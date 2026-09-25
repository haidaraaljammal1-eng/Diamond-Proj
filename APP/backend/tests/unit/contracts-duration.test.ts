import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  durationToEndAt,
  durationToRentalDays,
  isPeriodConsistent,
  resolveOfferPeriod,
} from "src/modules/contracts/contracts-duration";

describe("contracts-duration", () => {
  it("maps custom durations to calendar end and rentalDays", () => {
    const start = new Date("2026-09-20T06:00:00.000Z");
    assert.equal(
      durationToEndAt(start, 2, "HOUR").toISOString(),
      "2026-09-20T08:00:00.000Z",
    );
    assert.equal(durationToRentalDays(2, "HOUR"), 1);
    assert.equal(durationToRentalDays(3, "DAY"), 3);
    assert.equal(durationToRentalDays(2, "WEEK"), 14);
    assert.equal(durationToRentalDays(1, "MONTH"), 30);
  });

  it("resolves custom offer period from durationValue and durationUnit", () => {
    const start = new Date("2026-09-20T06:00:00.000Z");
    const resolved = resolveOfferPeriod({
      priceType: "CUSTOM",
      durationValue: 2,
      durationUnit: "HOUR",
      startAt: start,
    });
    assert.equal(resolved.durationValue, 2);
    assert.equal(resolved.durationUnit, "HOUR");
    assert.equal(resolved.rentalDays, 1);
    assert.equal(resolved.endAt.toISOString(), "2026-09-20T08:00:00.000Z");
  });

  it("keeps standard daily offer semantics", () => {
    const resolved = resolveOfferPeriod({
      priceType: "DAILY",
      rentalDays: 1,
    });
    assert.equal(resolved.durationValue, 1);
    assert.equal(resolved.durationUnit, "DAY");
    assert.equal(resolved.rentalDays, 1);
  });

  it("checks period consistency with structured duration", () => {
    const start = new Date("2026-09-20T06:00:00.000Z");
    const end = durationToEndAt(start, 3, "DAY");
    assert.equal(isPeriodConsistent(start, end, 3, "DAY"), true);
    assert.equal(isPeriodConsistent(start, new Date(end.getTime() + 1000), 3, "DAY"), false);
  });
});
