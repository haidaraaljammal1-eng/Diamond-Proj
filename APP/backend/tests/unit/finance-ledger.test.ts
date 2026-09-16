import { test } from "node:test";
import assert from "node:assert/strict";
import { isTrustedStripeCollection } from "src/modules/finance/finance-ledger.service";

test("isTrustedStripeCollection accepts confirmed CARD stripe payments only", () => {
  assert.equal(
    isTrustedStripeCollection({
      status: "CONFIRMED",
      method: "CARD",
      provider: "stripe",
      confirmedAt: new Date(),
    }),
    true,
  );
  assert.equal(
    isTrustedStripeCollection({
      status: "CONFIRMED",
      method: "MANUAL",
      provider: "stripe",
      confirmedAt: new Date(),
    }),
    false,
  );
  assert.equal(
    isTrustedStripeCollection({
      status: "CONFIRMED",
      method: "CARD",
      provider: "stripe",
      confirmedAt: null,
    }),
    false,
  );
  assert.equal(
    isTrustedStripeCollection({
      status: "CONFIRMED",
      method: "CARD",
      provider: null,
      confirmedAt: new Date(),
    }),
    false,
  );
});
