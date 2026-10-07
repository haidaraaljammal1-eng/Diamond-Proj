import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { PublicRentalContext } from "../types/public-rental.types.ts";
import { resolveDocumentVerificationSubStage } from "./document-verification-substage.ts";

function baseContext(overrides: Partial<PublicRentalContext> = {}): PublicRentalContext {
  return {
    flow: { step: "LICENSE_VERIFICATION" },
    contract: { status: "AWAITING", contractNumber: "C-1", termsVersion: "v1" },
    licenseVerification: { status: null, licenseNumber: null, expiryDate: null, unreadableReason: null },
    identity: null,
    customer: null,
    ...overrides,
  } as PublicRentalContext;
}

describe("resolveDocumentVerificationSubStage", () => {
  it("stays on licence until VALID", () => {
    assert.equal(
      resolveDocumentVerificationSubStage(
        baseContext({ licenseVerification: { status: "EXPIRED", licenseNumber: "1", expiryDate: "2020-01-01", unreadableReason: null } }),
      ),
      "LICENSE",
    );
    assert.equal(
      resolveDocumentVerificationSubStage(
        baseContext({ licenseVerification: { status: "UNREADABLE", licenseNumber: null, expiryDate: null, unreadableReason: "OCR" } }),
      ),
      "LICENSE",
    );
  });

  it("opens passport after VALID licence", () => {
    assert.equal(
      resolveDocumentVerificationSubStage(
        baseContext({
          licenseVerification: { status: "VALID", licenseNumber: "1893918", expiryDate: "2023-04-13", unreadableReason: null },
          identity: { identityReady: false, passport: { status: "REQUIRED", fields: null }, licenseStatus: "LICENSE_VALID", passportStatus: "PASSPORT_REQUIRED" },
        }),
      ),
      "PASSPORT",
    );
  });

  it("opens renter form when passport number is READY", () => {
    assert.equal(
      resolveDocumentVerificationSubStage(
        baseContext({
          licenseVerification: { status: "VALID", licenseNumber: "1893918", expiryDate: "2023-04-13", unreadableReason: null },
          identity: {
            identityReady: true,
            licenseStatus: "LICENSE_VALID",
            passportStatus: "PASSPORT_READY",
            passport: {
              status: "READY",
              fields: { passportNumber: "P1234567", fullName: "Test", nationality: "AE" },
            },
          },
        }),
      ),
      "RENTER_DETAILS",
    );
  });

  it("after form save (CONTRACT step) resolves to renter details for read-back", () => {
    assert.equal(
      resolveDocumentVerificationSubStage(
        baseContext({
          flow: { step: "CONTRACT" },
          contract: { status: "FORM", contractNumber: "C-1", termsVersion: "v1" },
        }),
      ),
      "RENTER_DETAILS",
    );
  });
});
