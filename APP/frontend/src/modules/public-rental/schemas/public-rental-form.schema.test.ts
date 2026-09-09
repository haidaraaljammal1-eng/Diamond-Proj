import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { publicRentalFormSchema } from "./public-rental-form.schema.ts";
import { toPublicRentalFormPayload } from "../utils/to-form-payload.ts";

describe("publicRentalFormSchema", () => {
  it("requires personal fields and identity or passport", () => {
    const parsed = publicRentalFormSchema.parse({
      name: "Sara Ali",
      mobile: "+971501234567",
      email: "sara@example.com",
      nationality: "AE",
      identityNumber: "784-1990-1234567-1",
      passportNumber: "",
      address: "Dubai",
    });
    assert.equal(parsed.name, "Sara Ali");
    assert.throws(() =>
      publicRentalFormSchema.parse({
        name: "Sara Ali",
        mobile: "+971501234567",
        email: "",
        nationality: "AE",
        identityNumber: "",
        passportNumber: "",
        address: "",
      }),
    );
  });

  it("does not include server-owned rental fields", () => {
    const keys = Object.keys(
      publicRentalFormSchema.parse({
        name: "Sara Ali",
        mobile: "+971501234567",
        email: "",
        nationality: "AE",
        identityNumber: "7841990",
        passportNumber: "",
        address: "",
      }),
    );
    assert.equal(keys.includes("agreedAmount"), false);
    assert.equal(keys.includes("rentalDays"), false);
    assert.equal(keys.includes("contractNumber"), false);
    assert.equal(keys.includes("licenseNumber"), false);
  });
});

describe("toPublicRentalFormPayload", () => {
  it("sends only customer-editable fields and omits empty optionals", () => {
    const payload = toPublicRentalFormPayload({
      name: " Sara Ali ",
      mobile: " +97150 ",
      email: "",
      nationality: "AE",
      identityNumber: "7841990",
      passportNumber: "",
      address: "",
    });
    assert.deepEqual(payload, {
      name: "Sara Ali",
      mobile: "+97150",
      nationality: "AE",
      identityNumber: "7841990",
      email: undefined,
      passportNumber: undefined,
      address: undefined,
    });
  });
});
