import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, it } from "node:test";

const en = JSON.parse(
  readFileSync(path.join(import.meta.dirname, "../../../../../messages/en.json"), "utf8"),
) as { validation: Record<string, string> };
const ar = JSON.parse(
  readFileSync(path.join(import.meta.dirname, "../../../../../messages/ar.json"), "utf8"),
) as { validation: Record<string, string> };

const FORM_ERROR_KEYS = [
  "required",
  "tooLong",
  "invalidEmail",
  "roleKey",
  "passwordMin",
  "passwordLetter",
  "passwordNumber",
  "passwordMismatch",
  "invalidYear",
  "invalidRate",
  "identityOrPassport",
  "invalidNonnegative",
  "scheduledRequired",
  "wholeAed",
  "positiveAmount",
] as const;

describe("validation i18n contract", () => {
  it("includes every FormError key in both locales without a nested validation namespace", () => {
    for (const key of FORM_ERROR_KEYS) {
      assert.equal(typeof en.validation[key], "string", `en missing validation.${key}`);
      assert.equal(typeof ar.validation[key], "string", `ar missing validation.${key}`);
      assert.ok(en.validation[key].trim().length > 0);
      assert.ok(ar.validation[key].trim().length > 0);
      assert.equal(key.startsWith("validation."), false);
    }
    assert.equal("validation" in en.validation, false);
    assert.equal("validation" in ar.validation, false);
  });

  it("resolves wholeAed to localized copy, not a raw key", () => {
    assert.equal(en.validation.wholeAed, "Enter the amount as a whole AED value.");
    assert.equal(ar.validation.wholeAed, "يجب إدخال المبلغ كرقم صحيح بالدرهم.");
    assert.equal(en.validation.wholeAed.includes("validation."), false);
    assert.equal(ar.validation.wholeAed.includes("validation."), false);
  });
});
