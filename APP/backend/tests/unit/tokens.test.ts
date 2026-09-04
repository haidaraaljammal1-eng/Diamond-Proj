import { test } from "node:test";
import assert from "node:assert/strict";
import {
  expiryFromNow,
  generateOpaqueToken,
  hashToken,
  isExpired,
} from "src/lib/security/tokens";

test("hashToken is deterministic and never equals the raw token", () => {
  assert.equal(hashToken("abc"), hashToken("abc"));
  assert.notEqual(hashToken("abc"), "abc");
});

test("generateOpaqueToken returns unique values", () => {
  assert.notEqual(generateOpaqueToken(), generateOpaqueToken());
});

test("expiry helpers behave correctly", () => {
  assert.equal(isExpired(new Date(Date.now() - 1000)), true);
  assert.equal(isExpired(expiryFromNow(60)), false);
});
