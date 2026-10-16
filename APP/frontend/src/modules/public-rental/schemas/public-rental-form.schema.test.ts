import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { publicRentalFormSchema } from "./public-rental-form.schema.ts";
import { toPublicRentalFormPayload } from "../utils/to-form-payload.ts";
import type { PublicRentalReviewFormValues } from "./public-rental-review.schema.ts";

describe("publicRentalFormSchema", () => {
  it("requires name, mobile, and nationality", () => {
    const parsed = publicRentalFormSchema.parse({
      name: "Sara Ali",
      mobile: "+971501234567",
      nationality: "AE",
      address: "Dubai",
    });
    assert.equal(parsed.name, "Sara Ali");
    assert.throws(() =>
      publicRentalFormSchema.parse({
        name: "",
        mobile: "+971501234567",
        nationality: "AE",
        address: "",
      }),
    );
  });

  it("does not include server-owned rental fields", () => {
    const keys = Object.keys(
      publicRentalFormSchema.parse({
        name: "Sara Ali",
        mobile: "+971501234567",
        nationality: "AE",
        address: "",
      }),
    );
    assert.equal(keys.includes("passportNumber"), false);
    assert.equal(keys.includes("drivingLicenseNumber"), false);
  });
});

describe("toPublicRentalFormPayload", () => {
  const reviewed: PublicRentalReviewFormValues = {
    name: " Sara Ali ",
    mobile: " +97150 ",
    nationality: "AE",
    address: " Dubai ",
    drivingLicenseNumber: "5128524",
    drivingLicenseExpiryDate: "2030-01-01",
    passportNumber: "P998877",
    licenseDocumentId: "00000000-0000-4000-8000-000000000001",
    passportDocumentId: "00000000-0000-4000-8000-000000000002",
  };

  it("sends final reviewed identity values from the renter review form", () => {
    const payload = toPublicRentalFormPayload(reviewed);
    assert.equal(payload.name, "Sara Ali");
    assert.equal(payload.passportNumber, "P998877");
    assert.equal(payload.drivingLicenseNumber, "5128524");
    assert.equal(payload.address, "Dubai");
    assert.equal("email" in payload, false);
  });
});
