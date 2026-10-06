import assert from "node:assert/strict";
import { test } from "node:test";
import { publicLicenseNumberForRentalContext } from "src/modules/contracts/public-rental-context";

test("publicLicenseNumberForRentalContext exposes number for VALID and EXPIRED only", () => {
  assert.equal(publicLicenseNumberForRentalContext("VALID", "2490527"), "2490527");
  assert.equal(publicLicenseNumberForRentalContext("EXPIRED", "2490527"), "2490527");
  assert.equal(publicLicenseNumberForRentalContext("UNREADABLE", "2490527"), null);
  assert.equal(publicLicenseNumberForRentalContext("EXPIRED", null), null);
});
