import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  editDefaultRateFormSchema,
  toUpdateRatesPayload,
} from "./edit-default-rate.schema.ts";

describe("editDefaultRateFormSchema", () => {
  it("requires all four rates", () => {
    const result = editDefaultRateFormSchema.safeParse({
      hourlyRate: "90",
      dailyRate: "",
      weeklyRate: "4500",
      monthlyRate: "14500",
    });
    assert.equal(result.success, false);
  });

  it("rejects negative rates", () => {
    const result = editDefaultRateFormSchema.safeParse({
      hourlyRate: "90",
      dailyRate: "-1",
      weeklyRate: "4500",
      monthlyRate: "14500",
    });
    assert.equal(result.success, false);
  });

  it("accepts valid rates including zero", () => {
    const result = editDefaultRateFormSchema.safeParse({
      hourlyRate: "0",
      dailyRate: "750",
      weeklyRate: "4620",
      monthlyRate: "14500",
    });
    assert.equal(result.success, true);
  });
});

describe("toUpdateRatesPayload", () => {
  it("maps trimmed string values to numbers", () => {
    assert.deepEqual(
      toUpdateRatesPayload({
        hourlyRate: " 94 ",
        dailyRate: " 750 ",
        weeklyRate: "4620",
        monthlyRate: "14500",
      }),
      {
        hourlyRate: 94,
        dailyRate: 750,
        weeklyRate: 4620,
        monthlyRate: 14500,
      },
    );
  });
});
