import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { ApiRequestError } from "../../../infrastructure/api/errors.ts";
import { resolveFinanceErrorMessage } from "./resolve-finance-error.ts";

describe("resolveFinanceErrorMessage", () => {
  const t = Object.assign(
    (key: string) => {
      const map: Record<string, string> = {
        "errors.FINANCE_EXPENSE_NO_CHANGES": "No changes to save.",
        "errors.FINANCE_EXPENSE_NOT_ACTIVE": "A voided expense cannot be corrected.",
        "errors.generic": "Finance data could not be loaded. Try again.",
      };
      if (!(key in map)) {
        throw new Error(`MISSING_MESSAGE: ${key}`);
      }
      return map[key];
    },
    {
      has: (key: string) =>
        [
          "errors.FINANCE_EXPENSE_NO_CHANGES",
          "errors.FINANCE_EXPENSE_NOT_ACTIVE",
          "errors.generic",
        ].includes(key),
    },
  );

  it("maps a known Finance reason", () => {
    const error = new ApiRequestError(
      {
        code: "VALIDATION_ERROR",
        message: "No expense fields changed",
        context: { reason: "FINANCE_EXPENSE_NO_CHANGES" },
      },
      422,
    );
    assert.equal(resolveFinanceErrorMessage(t, error), "No changes to save.");
  });

  it("falls back to generic for an unknown code without calling a missing key", () => {
    const error = new ApiRequestError(
      { code: "VALIDATION_ERROR", message: "raw backend enum VALIDATION_ERROR" },
      422,
    );
    assert.equal(
      resolveFinanceErrorMessage(t, error),
      "Finance data could not be loaded. Try again.",
    );
  });

  it("falls back to generic when a translation is missing", () => {
    const missingOnlyGeneric = Object.assign(
      (key: string) => {
        if (key === "errors.generic") return "generic";
        throw new Error(`MISSING_MESSAGE: ${key}`);
      },
      { has: (key: string) => key === "errors.generic" },
    );
    const error = new ApiRequestError(
      {
        code: "CONFLICT",
        message: "FINANCE_EXPENSE_NOT_ACTIVE",
        context: { reason: "FINANCE_EXPENSE_NOT_ACTIVE" },
      },
      409,
    );
    assert.equal(resolveFinanceErrorMessage(missingOnlyGeneric, error), "generic");
  });

  it("never crashes on a malformed error", () => {
    assert.equal(
      resolveFinanceErrorMessage(t, { message: "oops" }),
      "Finance data could not be loaded. Try again.",
    );
    assert.equal(
      resolveFinanceErrorMessage(t, "not-an-error"),
      "Finance data could not be loaded. Try again.",
    );
    assert.equal(resolveFinanceErrorMessage(t, undefined), null);
    const throwing = Object.assign(
      () => {
        throw new Error("translator exploded");
      },
      { has: () => true },
    );
    assert.equal(
      resolveFinanceErrorMessage(throwing, new ApiRequestError({ code: "X", message: "x" }, 500)),
      "Finance data could not be loaded. Try again.",
    );
  });
});
