import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createUserSchema } from "./user.schema.ts";

const validBase = {
  email: "staff@diamond.test",
  name: "Staff",
  roleId: "1",
  password: "Diamond123",
  confirmPassword: "Diamond123",
};

describe("createUserSchema", () => {
  it("accepts a complete create payload", () => {
    const result = createUserSchema.safeParse(validBase);
    assert.equal(result.success, true);
  });

  it("requires a password", () => {
    const result = createUserSchema.safeParse({
      ...validBase,
      password: "",
      confirmPassword: "",
    });
    assert.equal(result.success, false);
  });

  it("rejects a password confirmation mismatch", () => {
    const result = createUserSchema.safeParse({
      ...validBase,
      confirmPassword: "OtherPass1",
    });
    assert.equal(result.success, false);
    if (!result.success) {
      const confirmIssue = result.error.issues.find(
        (issue) => issue.path[0] === "confirmPassword",
      );
      assert.equal(confirmIssue?.message, "passwordMismatch");
    }
  });
});
