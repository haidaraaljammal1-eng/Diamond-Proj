import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { toPublicRentalFormPayload } from "./to-form-payload.ts";
import type { PublicRentalReviewFormValues } from "../schemas/public-rental-review.schema.ts";

const base: PublicRentalReviewFormValues = {
  name: "Test User",
  mobile: "+971500000000",
  nationality: "UAE",
  address: "Dubai",
  drivingLicenseNumber: "512852",
  drivingLicenseExpiryDate: "2030-06-01",
  passportNumber: "P1234567",
  licenseDocumentId: "00000000-0000-4000-8000-000000000001",
  passportDocumentId: "00000000-0000-4000-8000-000000000002",
};

describe("toPublicRentalFormPayload", () => {
  it("maps corrected licence and passport numbers for canonical submit", () => {
    const payload = toPublicRentalFormPayload({
      ...base,
      drivingLicenseNumber: "5128524",
      passportNumber: "P1234568",
    });
    assert.equal(payload.drivingLicenseNumber, "5128524");
    assert.equal(payload.passportNumber, "P1234568");
    assert.equal(payload.name, "Test User");
    assert.equal("passportFullName" in payload, false);
  });
});
