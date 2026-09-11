import { test } from "node:test";
import assert from "node:assert/strict";
import { aedToStripeMinorUnits } from "src/modules/contracts/payment/money";

test("aedToStripeMinorUnits converts whole AED to fils", () => {
  assert.equal(aedToStripeMinorUnits(570), 57000);
  assert.equal(aedToStripeMinorUnits(1), 100);
});

test("aedToStripeMinorUnits rejects non-positive or non-integer amounts", () => {
  assert.throws(() => aedToStripeMinorUnits(0));
  assert.throws(() => aedToStripeMinorUnits(-10));
  assert.throws(() => aedToStripeMinorUnits(10.5));
});
