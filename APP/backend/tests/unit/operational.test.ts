import { test } from "node:test";
import assert from "node:assert/strict";
import {
  DomainErrorReason,
  assertFieldUnchanged,
  assertVinUnchanged,
  conflictError,
  inactiveReferenceError,
  normalizeVin,
} from "src/lib/master-data/code";
import { ErrorCode } from "src/constants/error-codes";

test("normalizeVin uppercases, trims and strips internal whitespace", () => {
  assert.equal(normalizeVin("  jn1az4eh8dm123456 "), "JN1AZ4EH8DM123456");
  assert.equal(normalizeVin("ab 12 cd"), "AB12CD");
});

test("DomainErrorReason exposes the operational reasons as stable constants", () => {
  assert.equal(DomainErrorReason.INACTIVE_REFERENCE, "inactive_reference");
  assert.equal(DomainErrorReason.RECORD_IN_USE, "record_in_use");
});

test("inactiveReferenceError is a 422 VALIDATION_ERROR with inactive_reference reason", () => {
  const err = inactiveReferenceError("modelId");
  assert.equal(err.code, ErrorCode.VALIDATION_ERROR);
  assert.equal(err.statusCode, 422);
  assert.equal(err.context?.field, "modelId");
  assert.equal(err.context?.reason, DomainErrorReason.INACTIVE_REFERENCE);
});

test("conflictError is a 409 CONFLICT carrying a field conflict detail", () => {
  const err = conflictError("vehicle", "vin", "A vehicle with this VIN already exists");
  assert.equal(err.code, ErrorCode.CONFLICT);
  assert.equal(err.statusCode, 409);
  assert.equal(err.conflicts?.[0]?.field, "vin");
  assert.equal(err.conflicts?.[0]?.resource, "vehicle");
});

test("assertFieldUnchanged: ignores absent/equal, rejects a changed value", () => {
  assert.doesNotThrow(() => assertFieldUnchanged("customerId", 5, undefined));
  assert.doesNotThrow(() => assertFieldUnchanged("customerId", 5, 5));
  assert.throws(() => assertFieldUnchanged("customerId", 5, 6), /cannot be changed/);
});

test("assertVinUnchanged: omitted or same normalized VIN is a no-op", () => {
  assert.doesNotThrow(() => assertVinUnchanged("JN1AZ4EH8DM123456", undefined));
  // Different case/whitespace still normalizes to the same canonical value.
  assert.doesNotThrow(() => assertVinUnchanged("JN1AZ4EH8DM123456", " jn1az4eh8dm123456 "));
  // A vehicle created without a VIN accepts an omitted or explicit-null VIN.
  assert.doesNotThrow(() => assertVinUnchanged(null, undefined));
  assert.doesNotThrow(() => assertVinUnchanged(null, null));
});

test("assertVinUnchanged: any real change is a 422 immutable_field error", () => {
  // Changing a set VIN.
  const changed = () => assertVinUnchanged("JN1AZ4EH8DM123456", "1HG......DIFFERENT");
  assert.throws(changed, /cannot be changed/);
  try {
    changed();
    assert.fail("expected immutable_field error");
  } catch (err) {
    const e = err as { code: string; statusCode: number; context?: { field?: string; reason?: string } };
    assert.equal(e.code, ErrorCode.VALIDATION_ERROR);
    assert.equal(e.statusCode, 422);
    assert.equal(e.context?.field, "vin");
    assert.equal(e.context?.reason, DomainErrorReason.IMMUTABLE_FIELD);
  }
  // Clearing a set VIN is a change.
  assert.throws(() => assertVinUnchanged("JN1AZ4EH8DM123456", null), /cannot be changed/);
  // Setting a VIN on a vehicle that had none is a change.
  assert.throws(() => assertVinUnchanged(null, "JN1AZ4EH8DM123456"), /cannot be changed/);
});
