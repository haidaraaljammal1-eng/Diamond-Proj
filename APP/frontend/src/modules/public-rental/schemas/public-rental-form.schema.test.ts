import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { publicRentalFormSchema } from "./public-rental-form.schema.ts";
import { toPublicRentalFormPayload } from "../utils/to-form-payload.ts";
import type { PublicRentalContext } from "../types/public-rental.types.ts";

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
  const context = {
    identity: {
      passport: {
        status: "READY",
        fields: { passportNumber: "P998877", fullName: null, nationality: null },
      },
    },
  } as PublicRentalContext;

  it("sends passport from verification context, not the form", () => {
    const payload = toPublicRentalFormPayload(
      {
        name: " Sara Ali ",
        mobile: " +97150 ",
        nationality: "AE",
        address: " Dubai ",
      },
      context,
    );
    assert.equal(payload.name, "Sara Ali");
    assert.equal(payload.passportNumber, "P998877");
    assert.equal(payload.address, "Dubai");
    assert.equal("email" in payload, false);
  });
});
