import { describe, test } from "node:test";
import assert from "node:assert/strict";

function parseWholeAed(raw: string): number | null {
  const trimmed = raw.trim().replace(/,/g, "");
  if (!/^\d+$/.test(trimmed)) return null;
  const n = Number(trimmed);
  if (!Number.isInteger(n) || n <= 0) return null;
  return n;
}

describe("staff charge amount parsing", () => {
  test("accepts positive whole AED amounts", () => {
    assert.equal(parseWholeAed("150"), 150);
    assert.equal(parseWholeAed("1,200"), 1200);
  });

  test("rejects decimals, zero, and non-numeric input", () => {
    assert.equal(parseWholeAed("0"), null);
    assert.equal(parseWholeAed("12.5"), null);
    assert.equal(parseWholeAed("abc"), null);
  });
});
