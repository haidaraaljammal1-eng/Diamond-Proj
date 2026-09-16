import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { RECONCILIATION_LINE_TYPES } from "../constants/inspection.ts";

describe("reconciliation line types", () => {
  it("surfaces every backend settlement category including Salik and Violation", () => {
    assert.deepEqual([...RECONCILIATION_LINE_TYPES], [
      "DAMAGE",
      "FUEL",
      "LATE",
      "SALIK",
      "VIOLATION",
      "OTHER",
    ]);
  });
});
