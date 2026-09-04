import { test } from "node:test";
import assert from "node:assert/strict";
import {
  hashPassword,
  verifyPassword,
  validatePasswordStrength,
} from "src/lib/security/password";

test("hashPassword produces an argon2id hash, never plaintext", async () => {
  const hash = await hashPassword("s3cret-password");
  assert.notEqual(hash, "s3cret-password");
  assert.match(hash, /^\$argon2id\$/);
});

test("verifyPassword accepts the correct password and rejects wrong ones", async () => {
  const hash = await hashPassword("correct-horse-battery");
  assert.equal(await verifyPassword(hash, "correct-horse-battery"), true);
  assert.equal(await verifyPassword(hash, "wrong-password"), false);
});

test("verifyPassword returns false (never throws) on a malformed hash", async () => {
  assert.equal(await verifyPassword("not-a-hash", "whatever"), false);
});

test("validatePasswordStrength enforces the minimum length", () => {
  assert.equal(validatePasswordStrength("short").valid, false);
  assert.equal(validatePasswordStrength("longenough").valid, true);
});
