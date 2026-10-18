import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { StaffManualChargeInputSchema } from "src/modules/road-liabilities/staff-manual-charge.schema";

describe("StaffManualChargeInputSchema", () => {
  test("requires trimmed reference for traffic and salik", () => {
    for (const chargeCategory of ["TRAFFIC_VIOLATION", "SALIK"] as const) {
      const parsed = StaffManualChargeInputSchema.parse({
        chargeCategory,
        amountAed: 100,
        referenceNumber: "  0012345  ",
      });
      assert.equal(parsed.referenceNumber, "0012345");
      assert.equal(parsed.chargeCategory, chargeCategory);
    }
  });

  test("rejects empty or whitespace-only reference", () => {
    for (const referenceNumber of ["", "   ", "\n\t"]) {
      assert.throws(() =>
        StaffManualChargeInputSchema.parse({
          chargeCategory: "TRAFFIC_VIOLATION",
          amountAed: 50,
          referenceNumber,
        }),
      );
    }
  });
});
