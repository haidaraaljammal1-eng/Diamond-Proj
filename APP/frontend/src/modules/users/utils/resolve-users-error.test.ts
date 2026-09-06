import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { ApiRequestError } from "../../../infrastructure/api/errors.ts";
import {
  isLastAdminConflict,
  resolveUsersErrorMessage,
} from "./resolve-users-error.ts";

describe("isLastAdminConflict", () => {
  it("detects the last-admin delete conflict", () => {
    const error = new ApiRequestError(
      {
        code: "CONFLICT",
        message: "Cannot remove the last account with administrative access",
      },
      409,
    );
    assert.equal(isLastAdminConflict(error), true);
  });

  it("ignores email duplicate conflicts", () => {
    const error = new ApiRequestError(
      { code: "CONFLICT", message: "Email already in use" },
      409,
    );
    assert.equal(isLastAdminConflict(error), false);
  });
});

describe("resolveUsersErrorMessage", () => {
  const t = Object.assign(
    (key: string) => {
      const map: Record<string, string> = {
        "error.lastAdmin": "last admin",
        "error.CONFLICT": "email conflict",
        "error.generic": "generic",
        "delete.error.CONFLICT": "delete conflict",
      };
      return map[key] ?? key;
    },
    {
      has: (key: string) =>
        [
          "error.lastAdmin",
          "error.CONFLICT",
          "error.generic",
          "delete.error.CONFLICT",
        ].includes(key),
    },
  );

  it("prefers last-admin copy over generic CONFLICT", () => {
    const error = new ApiRequestError(
      {
        code: "CONFLICT",
        message: "Cannot remove the last administrator",
      },
      409,
    );
    assert.equal(resolveUsersErrorMessage(t, error), "last admin");
  });

  it("uses email conflict for unrelated CONFLICT", () => {
    const error = new ApiRequestError(
      { code: "CONFLICT", message: "Email already in use" },
      409,
    );
    assert.equal(resolveUsersErrorMessage(t, error), "email conflict");
  });
});
