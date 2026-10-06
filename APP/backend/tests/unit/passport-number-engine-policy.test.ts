import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { evaluatePassportNumberEngine } from "src/modules/contracts/passport-extraction-policy";

describe("evaluatePassportNumberEngine", () => {
  it("maps VALID to READY with passport number only", () => {
    const result = evaluatePassportNumberEngine({
      kind: "business",
      status: "VALID",
      passportNumber: "B5000479",
      provider: "passport-number-engine",
      providerVersion: "v1",
    });
    assert.equal(result.status, "READY");
    assert.equal(result.passportNumber, "B5000479");
    assert.equal(result.fullName, null);
    assert.equal(result.nationality, null);
  });

  it("maps REVIEW to NOT_RECOGNIZED without fabricating a number", () => {
    const result = evaluatePassportNumberEngine({
      kind: "business",
      status: "REVIEW",
      provider: "passport-number-engine",
      providerVersion: "v1",
    });
    assert.equal(result.status, "NOT_RECOGNIZED");
    assert.equal(result.passportNumber, null);
  });

  it("maps NOT_CONFIGURED to PROVIDER_UNAVAILABLE", () => {
    const result = evaluatePassportNumberEngine({
      kind: "error",
      code: "NOT_CONFIGURED",
      provider: "passport-number-engine",
      providerVersion: null,
    });
    assert.equal(result.status, "PROVIDER_UNAVAILABLE");
  });
});
