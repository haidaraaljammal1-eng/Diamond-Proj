import { test } from "node:test";
import assert from "node:assert/strict";
import { sniffMime, verifyContentType } from "src/lib/files/magic-bytes";

const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0]);

test("sniffMime detects a PNG by content", () => {
  assert.equal(sniffMime(PNG), "image/png");
});

test("verifyContentType rejects a declared type that mismatches the content", () => {
  const result = verifyContentType(PNG, "application/pdf");
  assert.equal(result.ok, false);
});

test("verifyContentType rejects content with no recognizable signature", () => {
  const result = verifyContentType(Buffer.from("just some text"), "image/png");
  assert.equal(result.detected, null);
  assert.equal(result.ok, false);
});
