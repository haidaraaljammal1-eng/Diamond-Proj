import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { PublicRentalContext } from "../types/public-rental.types.ts";
import { resolveLicenseStatusCardValues } from "./license-status-card-display.ts";

const emptyExtraction = {
  status: "READY" as const,
  engineDocumentStatus: "ACCEPT" as const,
  fields: {
    licenseNumber: { value: null },
    holderNameEn: { value: null },
    nationality: { value: null },
    dateOfBirth: { value: null },
    issueDate: { value: null },
    expiryDate: { value: null },
    placeOfIssue: { value: null },
  },
};

function baseContext(
  overrides: Partial<PublicRentalContext["licenseVerification"]>,
): Pick<PublicRentalContext, "licenseVerification" | "customer" | "drivingLicenseExtraction"> {
  return {
    licenseVerification: {
      status: "PENDING",
      licenseNumber: null,
      licenseNumberMasked: null,
      expiryDate: null,
      confidence: null,
      unreadableReason: null,
      ...overrides,
    },
    customer: null,
    drivingLicenseExtraction: emptyExtraction,
  };
}

describe("resolveLicenseStatusCardValues", () => {
  it("EXPIRED: shows facts when verification exposes number and expiry", () => {
    const resolved = resolveLicenseStatusCardValues(
      baseContext({
        status: "EXPIRED",
        licenseNumber: "2490527",
        expiryDate: "2021-09-11",
      }),
    );
    assert.equal(resolved.showFacts, true);
    assert.equal(resolved.licenseNumber, "2490527");
    assert.equal(resolved.expiryDisplay, "11/09/2021");
  });

  it("EXPIRED: falls back to extraction when API omitted verification number", () => {
    const ctx = baseContext({
      status: "EXPIRED",
      licenseNumber: null,
      expiryDate: "2021-09-11",
    });
    ctx.drivingLicenseExtraction = {
      ...emptyExtraction,
      fields: {
        ...emptyExtraction.fields,
        licenseNumber: { value: "2490527" },
        expiryDate: { value: "2021-09-11" },
      },
    };
    const resolved = resolveLicenseStatusCardValues(ctx);
    assert.equal(resolved.showFacts, true);
    assert.equal(resolved.licenseNumber, "2490527");
    assert.equal(resolved.expiryDisplay, "11/09/2021");
  });

  it("UNREADABLE: does not show facts without both values", () => {
    const resolved = resolveLicenseStatusCardValues(
      baseContext({ status: "UNREADABLE", licenseNumber: null, expiryDate: null }),
    );
    assert.equal(resolved.showFacts, false);
  });

  it("VALID: still resolves verification-backed values", () => {
    const resolved = resolveLicenseStatusCardValues(
      baseContext({
        status: "VALID",
        licenseNumber: "52288463",
        expiryDate: "2027-01-15",
      }),
    );
    assert.equal(resolved.showFacts, true);
    assert.equal(resolved.licenseNumber, "52288463");
    assert.equal(resolved.expiryDisplay, "15/01/2027");
  });
});
