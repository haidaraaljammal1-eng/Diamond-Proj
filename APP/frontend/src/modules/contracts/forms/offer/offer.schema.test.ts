import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { offerFormSchema } from "./offer.schema.ts";

describe("offerFormSchema", () => {
  it("accepts a valid daily offer amount", () => {
    const parsed = offerFormSchema.parse({ rentalDays: 7, agreedAmount: 2400 });
    assert.equal(parsed.rentalDays, 7);
    assert.equal(parsed.agreedAmount, 2400);
  });

  it("rejects a zero amount", () => {
    assert.throws(() => offerFormSchema.parse({ rentalDays: 1, agreedAmount: 0 }));
  });
});
