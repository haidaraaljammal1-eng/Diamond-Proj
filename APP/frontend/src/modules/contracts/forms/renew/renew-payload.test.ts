import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { previewRenewalEndAt } from "./renew-payload.ts";

describe("previewRenewalEndAt", () => {
  it("adds hours without rounding to days", () => {
    const start = new Date("2026-06-01T12:00:00.000Z");
    const end = previewRenewalEndAt(start, 6, "HOUR");
    assert.equal(end.toISOString(), "2026-06-01T18:00:00.000Z");
  });
});
