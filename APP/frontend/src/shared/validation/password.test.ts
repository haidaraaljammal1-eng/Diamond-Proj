import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { passwordValueSchema } from "./password.ts";

describe("passwordValueSchema", () => {
  it("rejects an empty value as required", () => {
    const result = passwordValueSchema.safeParse("");
    assert.equal(result.success, false);
    if (!result.success) {
      assert.equal(result.error.issues[0]?.message, "required");
    }
  });

  it("rejects a value shorter than 8 characters", () => {
    const result = passwordValueSchema.safeParse("Ab1");
    assert.equal(result.success, false);
    if (!result.success) {
      assert.equal(result.error.issues[0]?.message, "passwordMin");
    }
  });

  it("rejects a value without a letter", () => {
    const result = passwordValueSchema.safeParse("12345678");
    assert.equal(result.success, false);
    if (!result.success) {
      assert.equal(result.error.issues[0]?.message, "passwordLetter");
    }
  });

  it("rejects a value without a number", () => {
    const result = passwordValueSchema.safeParse("Password");
    assert.equal(result.success, false);
    if (!result.success) {
      assert.equal(result.error.issues[0]?.message, "passwordNumber");
    }
  });

  it("accepts a password with letters and numbers", () => {
    const result = passwordValueSchema.safeParse("Diamond123");
    assert.equal(result.success, true);
  });
});
