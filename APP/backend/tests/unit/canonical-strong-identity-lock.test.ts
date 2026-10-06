import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { canonicalStrongIdentityLockEntityIds } from "src/modules/contracts/contract-customer-materialization";

describe("canonicalStrongIdentityLockEntityIds", () => {
  test("normalizes identity casing and whitespace for lock keys", () => {
    const keys = canonicalStrongIdentityLockEntityIds({
      identityNumber: " ABC123 ",
      passportNumber: null,
      drivingLicenseNumber: null,
    });
    assert.deepEqual(keys, ["identity:abc123"]);
  });

  test("includes all present strong fields in sorted order", () => {
    const keys = canonicalStrongIdentityLockEntityIds({
      identityNumber: "784-1",
      passportNumber: "P999",
      drivingLicenseNumber: "DL-1",
    });
    assert.deepEqual(keys, ["identity:784-1", "license:dl-1", "passport:p999"]);
  });

  test("same key set regardless of input field order in separate calls", () => {
    const a = canonicalStrongIdentityLockEntityIds({
      identityNumber: "x",
      passportNumber: "y",
      drivingLicenseNumber: "z",
    });
    const b = canonicalStrongIdentityLockEntityIds({
      drivingLicenseNumber: "Z",
      passportNumber: "Y",
      identityNumber: "X",
    });
    assert.deepEqual(a, b);
  });
});
