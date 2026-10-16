import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { publicRentalFormFields } from "../schemas/public-rental-form.fields.ts";
import {
  RENTER_REVIEW_SEVEN_FIELD_NAMES,
  renterReviewSevenEditFields,
} from "./renter-review-seven-fields.ts";

describe("renter review seven fields", () => {
  it("renter details form exposes exactly 4 personal fields", () => {
    const fields = publicRentalFormFields((key) => key);
    assert.equal(fields.length, 4);
    assert.deepEqual(fields.map((f) => f.name), ["name", "mobile", "nationality", "address"]);
  });

  it("review exposes exactly 7 fields in fixed order", () => {
    assert.equal(RENTER_REVIEW_SEVEN_FIELD_NAMES.length, 7);
    assert.deepEqual(RENTER_REVIEW_SEVEN_FIELD_NAMES, [
      "passportNumber",
      "drivingLicenseNumber",
      "drivingLicenseExpiryDate",
      "name",
      "mobile",
      "nationality",
      "address",
    ]);
    const editFields = renterReviewSevenEditFields((key) => key, false);
    assert.equal(editFields.length, 7);
    assert.deepEqual(editFields.map((f) => f.name), [...RENTER_REVIEW_SEVEN_FIELD_NAMES]);
  });
});
