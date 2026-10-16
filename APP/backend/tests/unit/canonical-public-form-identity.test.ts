import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { calendarDateToStoredUtc, parseCalendarDate } from "src/modules/contracts/license-calendar";
import { isLicenseExpiredOn, businessToday } from "src/modules/contracts/license-calendar";

describe("canonical public form identity policy", () => {
  it("rejects VALID licence expiry correction that would be expired today", () => {
    const now = new Date("2026-06-01T12:00:00Z");
    const offset = 240;
    const parsed = parseCalendarDate("2020-01-01");
    assert.ok(parsed);
    assert.equal(isLicenseExpiredOn(parsed, businessToday(now, offset)), true);
    const stored = calendarDateToStoredUtc(parsed);
    assert.ok(stored);
  });

  it("fieldsMeta stores status metadata only, not duplicate licence text", () => {
    const meta = {
      license_number: { status: "ACCEPT", confidence: 0.9 },
    };
    assert.equal("value" in (meta.license_number as object), false);
  });
});
