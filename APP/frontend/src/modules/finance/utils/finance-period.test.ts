import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { resolveFinancePeriodRange } from "./finance-period.ts";

describe("resolveFinancePeriodRange", () => {
  it("returns today range with exclusive end", () => {
    const range = resolveFinancePeriodRange("today");
    assert.ok(range.from);
    assert.ok(range.to);
    assert.ok(new Date(range.to).getTime() > new Date(range.from).getTime());
  });

  it("returns custom range when provided", () => {
    const range = resolveFinancePeriodRange("custom", "2026-06-01", "2026-06-05");
    const from = new Date(range.from);
    const to = new Date(range.to);
    assert.ok(to.getTime() > from.getTime());
    assert.equal(from.getFullYear(), 2026);
    assert.equal(from.getMonth(), 5);
    assert.equal(from.getDate(), 1);
    assert.equal(to.getDate(), 6);
  });
});
