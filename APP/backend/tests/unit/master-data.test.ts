import { test } from "node:test";
import assert from "node:assert/strict";
import {
  BooleanQueryParam,
  CodeSchema,
  MASTER_DATA_SORTABLE,
  DomainErrorReason,
  assertCodeUnchanged,
  duplicateCodeError,
  immutableFieldError,
  invalidParentError,
  normalizeCode,
  normalizeExternalId,
} from "src/lib/master-data/code";
import { ErrorCode } from "src/constants/error-codes";

test("normalizeCode trims and uppercases the canonical business key", () => {
  assert.equal(normalizeCode("  br-01 "), "BR-01");
  assert.equal(normalizeCode("abc"), "ABC");
});

test("normalizeExternalId trims but preserves case (ERP ids are case-sensitive)", () => {
  assert.equal(normalizeExternalId("  Erp-9 "), "Erp-9");
});

test("CodeSchema accepts alnum/-/_ and rejects spaces, symbols and empty", () => {
  assert.equal(CodeSchema.safeParse("BR_01-A").success, true);
  assert.equal(CodeSchema.safeParse("has space").success, false);
  assert.equal(CodeSchema.safeParse("bad!").success, false);
  assert.equal(CodeSchema.safeParse("").success, false);
});

test("BooleanQueryParam parses true/false/undefined without coercion pitfalls", () => {
  assert.equal(BooleanQueryParam.parse("true"), true);
  assert.equal(BooleanQueryParam.parse("false"), false);
  assert.equal(BooleanQueryParam.parse(undefined), undefined);
  assert.equal(BooleanQueryParam.safeParse("xyz").success, false);
});

test("duplicateCodeError is a 409 CONFLICT carrying a code conflict detail", () => {
  const err = duplicateCodeError("branch");
  assert.equal(err.code, ErrorCode.CONFLICT);
  assert.equal(err.statusCode, 409);
  assert.equal(err.conflicts?.[0]?.field, "code");
  assert.equal(err.conflicts?.[0]?.resource, "branch");
});

test("invalidParentError is a 422 VALIDATION_ERROR with field + reason context", () => {
  const err = invalidParentError("regionId");
  assert.equal(err.code, ErrorCode.VALIDATION_ERROR);
  assert.equal(err.statusCode, 422);
  assert.equal(err.context?.field, "regionId");
  assert.equal(err.context?.reason, DomainErrorReason.INVALID_PARENT);
});

test("DomainErrorReason exposes stable machine-readable constants", () => {
  assert.equal(DomainErrorReason.INVALID_PARENT, "invalid_parent");
  assert.equal(DomainErrorReason.IMMUTABLE_FIELD, "immutable_field");
});

test("immutableFieldError is a 422 VALIDATION_ERROR with immutable_field reason", () => {
  const err = immutableFieldError("code");
  assert.equal(err.code, ErrorCode.VALIDATION_ERROR);
  assert.equal(err.statusCode, 422);
  assert.equal(err.context?.field, "code");
  assert.equal(err.context?.reason, DomainErrorReason.IMMUTABLE_FIELD);
});

test("assertCodeUnchanged: ignores absent/same code, rejects a changed code", () => {
  assert.doesNotThrow(() => assertCodeUnchanged("BR-01", undefined));
  assert.doesNotThrow(() => assertCodeUnchanged("BR-01", "br-01")); // normalized-equal
  assert.throws(() => assertCodeUnchanged("BR-01", "BR-02"), /cannot be changed/);
});

test("master-data sort allow-list is fixed and does not include arbitrary fields", () => {
  assert.deepEqual(
    [...MASTER_DATA_SORTABLE],
    ["code", "name", "createdAt", "isActive"],
  );
});
