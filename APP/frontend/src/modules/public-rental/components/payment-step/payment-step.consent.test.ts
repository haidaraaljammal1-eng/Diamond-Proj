import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, it } from "node:test";

const source = readFileSync(path.join(import.meta.dirname, "payment-step.tsx"), "utf8");

describe("payment-step mandatory consent", () => {
  it("requires explicit checkbox acceptance before enabling pay", () => {
    assert.match(source, /consentRequired/);
    assert.match(source, /consentAccepted/);
    assert.match(source, /disabled=\{!canPay/);
    assert.match(source, /useState\(false\)/);
    assert.match(source, /futureUseConsentRequired/);
  });
});
