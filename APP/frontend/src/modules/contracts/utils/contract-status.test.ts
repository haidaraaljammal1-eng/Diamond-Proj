import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { getContractStatusPresentation } from "./contract-status.ts";

describe("getContractStatusPresentation", () => {
  it("maps PAID to gold Ready for Car-Out key", () => {
    assert.deepEqual(getContractStatusPresentation("PAID"), {
      translationKey: "PAID",
      tone: "gold",
    });
  });

  it("maps AWAITING to warn", () => {
    assert.equal(getContractStatusPresentation("AWAITING").tone, "warn");
  });

  it("maps CLOSED to neutral", () => {
    assert.equal(getContractStatusPresentation("CLOSED").tone, "neutral");
  });
});
