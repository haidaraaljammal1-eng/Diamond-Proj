import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { hasSearchContent, normalizeSearchSubmit } from "./data-search.utils.ts";

describe("normalizeSearchSubmit", () => {
  it("trims leading and trailing whitespace", () => {
    assert.equal(normalizeSearchSubmit("   BMW 530i   "), "BMW 530i");
  });

  it("returns an empty string for whitespace-only input", () => {
    assert.equal(normalizeSearchSubmit("   "), "");
  });
});

describe("hasSearchContent", () => {
  it("is false when draft and applied are empty", () => {
    assert.equal(hasSearchContent("", ""), false);
    assert.equal(hasSearchContent("", "   "), false);
  });

  it("is true when draft has characters", () => {
    assert.equal(hasSearchContent("Toyota", ""), true);
  });

  it("is true when applied search is set", () => {
    assert.equal(hasSearchContent("", "Toyota"), true);
  });
});
