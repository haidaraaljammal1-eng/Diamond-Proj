import { test } from "node:test";
import assert from "node:assert/strict";
import { Secret } from "otpauth";
import { twoFactorInternals } from "src/modules/auth/two-factor.service";
import {
  encryptTwoFactorSecret,
  decryptTwoFactorSecret,
  encryptSecret,
} from "src/lib/security/encryption";
import { hashToken } from "src/lib/security/tokens";

const { totpFor, totpStepFor, generateRecoveryCode, normalizeRecoveryCode, TOTP_PERIOD } =
  twoFactorInternals;

const SECRET = new Secret({ size: 20 }).base32;

test("a code generated for the current step validates", () => {
  const now = Date.now();
  const code = totpFor(SECRET, "user@example.test").generate({ timestamp: now });
  assert.equal(totpStepFor(SECRET, code, now), Math.floor(now / 1000 / TOTP_PERIOD));
});

test("a code from a different secret does not validate", () => {
  const now = Date.now();
  const other = new Secret({ size: 20 }).base32;
  const code = totpFor(other, "user@example.test").generate({ timestamp: now });
  assert.equal(totpStepFor(SECRET, code, now), null);
});

test("the accepted window is +/- one step and no wider", () => {
  const now = Date.now();
  const totp = totpFor(SECRET, "user@example.test");
  const stepMs = TOTP_PERIOD * 1000;

  for (const offset of [-stepMs, 0, stepMs]) {
    const code = totp.generate({ timestamp: now + offset });
    assert.notEqual(
      totpStepFor(SECRET, code, now),
      null,
      `expected offset ${offset}ms to be accepted`,
    );
  }
  for (const offset of [-3 * stepMs, 3 * stepMs]) {
    const code = totp.generate({ timestamp: now + offset });
    assert.equal(
      totpStepFor(SECRET, code, now),
      null,
      `expected offset ${offset}ms to be rejected`,
    );
  }
});

test("a code's step is reported absolutely, so replay can be detected", () => {
  const now = Date.now();
  const totp = totpFor(SECRET, "user@example.test");
  const previous = totp.generate({ timestamp: now - TOTP_PERIOD * 1000 });
  const current = totp.generate({ timestamp: now });

  const previousStep = totpStepFor(SECRET, previous, now);
  const currentStep = totpStepFor(SECRET, current, now);
  assert.notEqual(previousStep, null);
  assert.notEqual(currentStep, null);
  // The guard rejects any step <= the last accepted one; a stale-but-in-window
  // code therefore cannot be replayed after a newer one has been used.
  assert.ok((previousStep as number) < (currentStep as number));
});

test("the otpauth URI is a TOTP enrolment URI carrying the issuer", () => {
  const uri = totpFor(SECRET, "user@example.test").toString();
  assert.ok(uri.startsWith("otpauth://totp/"));
  assert.ok(uri.includes("issuer="));
  assert.ok(uri.includes("digits=6"));
  assert.ok(uri.includes(`period=${TOTP_PERIOD}`));
});

test("recovery codes use an unambiguous alphabet and a stable shape", () => {
  for (let i = 0; i < 200; i += 1) {
    const code = generateRecoveryCode();
    assert.match(code, /^[ABCDEFGHJKMNPQRSTVWXYZ23456789]{5}-[ABCDEFGHJKMNPQRSTVWXYZ23456789]{5}$/);
    // Characters that are misread when transcribed must never appear.
    assert.equal(/[ILOU01]/.test(code), false);
  }
});

test("recovery codes are unique across a large sample", () => {
  const codes = new Set(Array.from({ length: 500 }, generateRecoveryCode));
  assert.equal(codes.size, 500);
});

test("recovery code comparison ignores case, spacing and punctuation", () => {
  const code = generateRecoveryCode();
  const stored = hashToken(normalizeRecoveryCode(code));
  const asRetyped = ` ${code.toLowerCase().replace("-", " ")} `;
  assert.equal(hashToken(normalizeRecoveryCode(asRetyped)), stored);
  assert.notEqual(hashToken(normalizeRecoveryCode(generateRecoveryCode())), stored);
});

test("a TOTP secret round-trips through encryption and is never stored as-is", () => {
  const ciphertext = encryptTwoFactorSecret(SECRET);
  assert.notEqual(ciphertext, SECRET);
  assert.equal(ciphertext.includes(SECRET), false);
  assert.equal(decryptTwoFactorSecret(ciphertext), SECRET);
});

test("encryption is randomized, so equal secrets do not produce equal ciphertext", () => {
  assert.notEqual(encryptTwoFactorSecret(SECRET), encryptTwoFactorSecret(SECRET));
});

test("a tampered ciphertext fails authentication rather than decrypting", () => {
  const ciphertext = encryptTwoFactorSecret(SECRET);
  const bytes = Buffer.from(ciphertext, "base64url");
  const last = bytes.length - 1;
  bytes.writeUInt8(bytes.readUInt8(last) ^ 0xff, last); // flip the final byte
  assert.throws(() => decryptTwoFactorSecret(bytes.toString("base64url")));
});

test("the 2FA key is distinct from the general-purpose encryption key", () => {
  // Cross-decryption must fail: rotating one key cannot silently expose or
  // corrupt values protected by the other.
  assert.throws(() => decryptTwoFactorSecret(encryptSecret(SECRET)));
});
