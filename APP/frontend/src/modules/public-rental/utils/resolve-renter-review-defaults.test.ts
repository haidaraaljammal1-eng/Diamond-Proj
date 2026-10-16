import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { PublicRentalContext } from "../types/public-rental.types.ts";
import { resolveRenterReviewDefaults } from "./resolve-renter-review-defaults.ts";

function baseContext(overrides: Partial<PublicRentalContext> = {}): PublicRentalContext {
  return {
    flow: { step: "LICENSE_VERIFICATION" },
    contract: { status: "AWAITING", contractNumber: "C-1", termsVersion: "v1" },
    licenseVerification: {
      status: "VALID",
      licenseNumber: "5128524",
      licenseNumberMasked: null,
      expiryDate: "2028-01-30",
      confidence: 0.9,
      unreadableReason: null,
      activeDocumentId: "00000000-0000-4000-8000-000000000001",
    },
    identity: {
      identityReady: true,
      licenseStatus: "LICENSE_VALID",
      passport: {
        status: "READY",
        previewAvailable: true,
        activeDocumentId: "00000000-0000-4000-8000-000000000002",
        fields: {
          passportNumber: "ZC3EJ7T2H",
          fullName: "OCR PASSPORT NAME",
          nationality: "OCR NAT",
          dateOfBirth: null,
          sex: null,
          passportIssueDate: null,
          passportExpiryDate: null,
          issuingCountry: null,
        },
      },
    },
    customer: {
      name: "Khaled Mohammad",
      mobile: "0501234567",
      email: null,
      nationality: "Syrian",
      address: "Dubai - Al Quoz",
      identityNumber: null,
      passportNumber: null,
      drivingLicenseNumber: null,
      drivingLicenseExpiry: null,
      dateOfBirth: null,
      drivingLicenseIssueDate: null,
      drivingLicensePlaceOfIssue: null,
    },
    drivingLicenseExtraction: null,
    ...overrides,
  } as PublicRentalContext;
}

describe("resolveRenterReviewDefaults", () => {
  it("prefills OCR trio and renter personal fields from distinct sources", () => {
    const values = resolveRenterReviewDefaults(baseContext());
    assert.equal(values.passportNumber, "ZC3EJ7T2H");
    assert.equal(values.drivingLicenseNumber, "5128524");
    assert.equal(values.drivingLicenseExpiryDate, "2028-01-30");
    assert.equal(values.name, "Khaled Mohammad");
    assert.equal(values.mobile, "0501234567");
    assert.equal(values.nationality, "Syrian");
    assert.equal(values.address, "Dubai - Al Quoz");
  });

  it("does not use passport OCR for review name or nationality", () => {
    const values = resolveRenterReviewDefaults(
      baseContext({
        customer: {
          name: "Renter Name",
          mobile: "050",
          email: null,
          nationality: "Renter Nat",
          address: "",
          identityNumber: null,
          passportNumber: null,
          drivingLicenseNumber: null,
          drivingLicenseExpiry: null,
          dateOfBirth: null,
          drivingLicenseIssueDate: null,
          drivingLicensePlaceOfIssue: null,
        },
      }),
    );
    assert.equal(values.name, "Renter Name");
    assert.equal(values.nationality, "Renter Nat");
    assert.notEqual(values.name, "OCR PASSPORT NAME");
    assert.notEqual(values.nationality, "OCR NAT");
  });
});
