import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { getDisplayName, getInitials } from "./avatar.utils.ts";

describe("getInitials", () => {
  it("uses first letters of first two words", () => {
    assert.equal(getInitials("Khaled Al Mansoori"), "KA");
  });

  it("uses first two characters for a single word", () => {
    assert.equal(getInitials("Diamond"), "DI");
  });

  it("keeps Arabic characters without forcing Latin case", () => {
    assert.equal(getInitials("خالد المنصوري"), "خا");
  });

  it("falls back when empty", () => {
    assert.equal(getInitials("   "), "?");
  });
});

describe("getDisplayName", () => {
  it("prefers name when present", () => {
    assert.equal(getDisplayName("Sara", "sara@example.com"), "Sara");
  });

  it("falls back to email", () => {
    assert.equal(getDisplayName(null, "sara@example.com"), "sara@example.com");
  });
});
