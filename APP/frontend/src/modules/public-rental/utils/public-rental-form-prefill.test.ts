import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { PublicRentalContext } from "../types/public-rental.types";
import { resolvePublicRentalFormDefaults } from "./public-rental-form-prefill.ts";

function baseContext(overrides: Partial<PublicRentalContext> = {}): PublicRentalContext {
  return {
    office: {
      displayName: "Office",
      company: { code: "U", displayName: "U", legalNameAr: "U", legalNameEn: "U" },
    },
    flow: { step: "CONTRACT" },
    collection: { mode: "ELECTRONIC" },
    contract: { contractNumber: "C-1", status: "AWAITING", termsVersion: "v1" },
    vehicle: {
      displayName: "Car",
      vehicleType: null,
      plateNumber: null,
      modelYear: null,
      color: null,
      vin: null,
    },
    rental: {
      rentalDays: 1,
      durationValue: 1,
      durationUnit: "DAY",
      agreedAmount: 100,
      currency: "AED",
      startAt: null,
      endAt: null,
      actualPickupAt: null,
      actualReturnAt: null,
    },
    customer: null,
    drivingLicenseExtraction: null,
    licenseVerification: {
      status: "VALID",
      licenseNumber: "DL-1",
      licenseNumberMasked: null,
      expiryDate: "2030-01-01",
      confidence: 1,
      unreadableReason: null,
    },
    identity: {
      licenseStatus: "LICENSE_VALID",
      passport: { status: "READY", fields: null, previewAvailable: false },
      identityReady: true,
    },
    payment: {
      status: null,
      method: null,
      amount: 100,
      currency: "AED",
      providerAvailable: false,
      devSimulationAvailable: false,
      requiresCardSetupBeforeSigning: false,
      cardLast4: null,
      cardReady: false,
      futureUseConsentAvailable: false,
      futureUseConsent: null,
      checkoutRecoverable: false,
    },
    tarsOtp: {
      providerConfigured: false,
      required: false,
      status: "NOT_REQUIRED",
      maskedDestination: null,
      resendAvailableAt: null,
      expiresAt: null,
      otpLength: null,
      attemptsRemaining: null,
    },
    ...overrides,
  };
}

describe("public-rental-form-prefill", () => {
  it("uses Customer only — no OCR prefill (V1.2)", () => {
    const values = resolvePublicRentalFormDefaults(
      baseContext({
        customer: {
          name: "Confirmed",
          mobile: "+97150",
          email: null,
          nationality: "UAE",
          identityNumber: "ID1",
          passportNumber: null,
          address: null,
          drivingLicenseNumber: "C-DL",
          drivingLicenseExpiry: "2031-01-01",
          drivingLicensePlaceOfIssue: "ABU DHABI",
        },
        drivingLicenseExtraction: {
          status: "READY",
          engineDocumentStatus: "ACCEPT",
          fields: {
            licenseNumber: { value: "90527" },
            holderNameEn: { value: "OCR NAME" },
            nationality: { value: "INDIA" },
            dateOfBirth: { value: "1990-05-03" },
            issueDate: { value: "2020-01-01" },
            expiryDate: { value: "2030-01-01" },
            placeOfIssue: { value: "HAB" },
          },
        },
      }),
    );
    assert.equal(values.name, "Confirmed");
    assert.equal(values.nationality, "UAE");
    assert.equal(values.address, "");
  });

  it("leaves manual fields empty without Customer", () => {
    const values = resolvePublicRentalFormDefaults(baseContext());
    assert.equal(values.name, "");
    assert.equal(values.nationality, "");
    assert.equal(values.address, "");
  });
});
