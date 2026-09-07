import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  editDefaultRateFormSchema,
  toUpdateRatesPayload,
} from "./edit-default-rate.schema.ts";

describe("editDefaultRateFormSchema", () => {
  it("requires both rates", () => {
    const result = editDefaultRateFormSchema.safeParse({
      dailyRate: "",
      monthlyRate: "1000",
    });
    assert.equal(result.success, false);
  });

  it("rejects negative rates", () => {
    const result = editDefaultRateFormSchema.safeParse({
      dailyRate: "-1",
      monthlyRate: "1000",
    });
    assert.equal(result.success, false);
  });

  it("accepts valid rates", () => {
    const result = editDefaultRateFormSchema.safeParse({
      dailyRate: "750",
      monthlyRate: "14500",
    });
    assert.equal(result.success, true);
  });
});

describe("toUpdateRatesPayload", () => {
  it("maps trimmed string values to numbers", () => {
    assert.deepEqual(
      toUpdateRatesPayload({ dailyRate: " 750 ", monthlyRate: "14500" }),
      { dailyRate: 750, monthlyRate: 14500 },
    );
  });
});
