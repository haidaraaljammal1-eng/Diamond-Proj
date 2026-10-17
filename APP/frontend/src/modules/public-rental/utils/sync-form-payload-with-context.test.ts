import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { PublicRentalContext } from "../types/public-rental.types";
import { syncFormPayloadWithContext } from "./sync-form-payload-with-context.ts";

function minimalContext(
  licenseId: string | null,
  passportId: string | null,
): PublicRentalContext {
  return {
    contract: { contractNumber: "DE-1", status: "AWAITING", termsVersion: "v1" },
    flow: { step: "LICENSE_VERIFICATION" },
    licenseVerification: {
      status: "VALID",
      licenseNumber: "5128524",
      licenseNumberMasked: "****",
      expiryDate: "2028-01-30",
      confidence: 1,
      unreadableReason: null,
      activeDocumentId: licenseId,
    },
    identity: {
      licenseStatus: "LICENSE_VALID",
      passport: {
        status: "READY",
        fields: { passportNumber: "RA0992035" },
        previewAvailable: true,
        activeDocumentId: passportId,
      },
      identityReady: true,
    },
  } as PublicRentalContext;
}

describe("syncFormPayloadWithContext", () => {
  it("replaces stale document ids with active ids from context", () => {
    const license = "00000000-0000-4000-8000-000000000001";
    const passport = "00000000-0000-4000-8000-000000000002";
    const synced = syncFormPayloadWithContext(
      {
        name: "Test",
        mobile: "+97150",
        nationality: "AE",
        licenseDocumentId: "stale-license",
        passportDocumentId: "stale-passport",
      },
      minimalContext(license, passport),
    );
    assert.equal(synced.licenseDocumentId, license);
    assert.equal(synced.passportDocumentId, passport);
  });

  it("clears document ids when context has no active document", () => {
    const synced = syncFormPayloadWithContext(
      {
        name: "Test",
        mobile: "+97150",
        nationality: "AE",
        licenseDocumentId: "stale-license",
      },
      minimalContext(null, null),
    );
    assert.equal(synced.licenseDocumentId, undefined);
    assert.equal(synced.passportDocumentId, undefined);
  });
});
