import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  buildRenewalPersistenceFields,
  renewalNewEndAt,
  resolveRenewalDurationInput,
} from "src/modules/contracts/contracts-renewal-duration";

describe("contracts-renewal-duration", () => {
  const previousEndAt = new Date("2026-06-01T12:00:00.000Z");

  it("extends by exact hours without converting to full days", () => {
    const resolved = resolveRenewalDurationInput({
      additionalDurationValue: 6,
      additionalDurationUnit: "HOUR",
    });
    assert.equal(resolved.rentalDayIncrement, 1);
    const newEnd = renewalNewEndAt(previousEndAt, resolved);
    assert.equal(newEnd.toISOString(), "2026-06-01T18:00:00.000Z");
  });

  it("legacy additionalDays remains day-based", () => {
    const resolved = resolveRenewalDurationInput({ additionalDays: 3 });
    assert.equal(resolved.durationUnit, "DAY");
    assert.equal(resolved.durationValue, 3);
    assert.equal(resolved.rentalDayIncrement, 3);
    const newEnd = renewalNewEndAt(previousEndAt, resolved);
    assert.equal(newEnd.toISOString(), "2026-06-04T12:00:00.000Z");
  });

  it("buildRenewalPersistenceFields stores structured duration", () => {
    const fields = buildRenewalPersistenceFields(
      { additionalDurationValue: 1, additionalDurationUnit: "HOUR", additionalAmount: 50 },
      previousEndAt,
    );
    assert.equal(fields.additionalDays, 1);
    assert.equal(fields.additionalDurationValue, 1);
    assert.equal(fields.additionalDurationUnit, "HOUR");
    assert.equal(fields.newEndAt.toISOString(), "2026-06-01T13:00:00.000Z");
  });
});
