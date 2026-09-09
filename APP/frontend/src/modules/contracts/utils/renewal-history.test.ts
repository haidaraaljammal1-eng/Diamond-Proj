import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { renewalHistoryState } from "./renewal-history.ts";

describe("renewalHistoryState", () => {
  it("marks rows with approvedAt as confirmed and others as pending", () => {
    assert.equal(renewalHistoryState("2026-09-09T10:00:00.000Z"), "confirmed");
    assert.equal(renewalHistoryState(null), "pending");
  });
});
