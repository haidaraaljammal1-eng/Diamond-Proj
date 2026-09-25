import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  customRentalPriceFormSchema,
  defaultDaysForPriceType,
  isStandardPriceType,
  priceTypeChipKey,
  toCustomRentalPricePayload,
} from "./set-rental-price.schema.ts";

describe("set-rental-price.schema", () => {
  it("maps price types to chip keys", () => {
    assert.equal(priceTypeChipKey("HOURLY"), "hour");
    assert.equal(priceTypeChipKey("CUSTOM"), "custom");
  });

  it("returns default rental days per standard mode", () => {
    assert.equal(defaultDaysForPriceType("HOURLY"), 1);
    assert.equal(defaultDaysForPriceType("WEEKLY"), 7);
    assert.equal(defaultDaysForPriceType("MONTHLY"), 30);
  });

  it("treats custom as non-standard", () => {
    assert.equal(isStandardPriceType("DAILY"), true);
    assert.equal(isStandardPriceType("CUSTOM"), false);
  });

  it("uses stable validation keys instead of raw Zod messages", () => {
    const empty = customRentalPriceFormSchema.safeParse({
      durationValue: "",
      durationUnit: "DAY",
      agreedAmount: "",
    });
    assert.equal(empty.success, false);
    if (empty.success) return;
    assert.equal(empty.error.issues[0]?.message, "required");

    const invalid = customRentalPriceFormSchema.safeParse({
      durationValue: "abc",
      durationUnit: "DAY",
      agreedAmount: "4500",
    });
    assert.equal(invalid.success, false);
    if (invalid.success) return;
    assert.equal(
      invalid.error.issues.some((issue) => issue.message === "invalidDurationValue"),
      true,
    );
  });

  it("maps valid custom values to structured payload", () => {
    assert.deepEqual(
      toCustomRentalPricePayload({
        durationValue: " 2 ",
        durationUnit: "HOUR",
        agreedAmount: "160",
      }),
      { durationValue: 2, durationUnit: "HOUR", agreedAmount: 160 },
    );
    assert.deepEqual(
      toCustomRentalPricePayload({
        durationValue: "3",
        durationUnit: "DAY",
        agreedAmount: "4500",
      }),
      { durationValue: 3, durationUnit: "DAY", agreedAmount: 4500 },
    );
    assert.deepEqual(
      toCustomRentalPricePayload({
        durationValue: "2",
        durationUnit: "WEEK",
        agreedAmount: "9000",
      }),
      { durationValue: 2, durationUnit: "WEEK", agreedAmount: 9000 },
    );
    assert.deepEqual(
      toCustomRentalPricePayload({
        durationValue: "1",
        durationUnit: "MONTH",
        agreedAmount: "12000",
      }),
      { durationValue: 1, durationUnit: "MONTH", agreedAmount: 12000 },
    );
  });
});
