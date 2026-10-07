import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { PublicRentalContext } from "../types/public-rental.types";
import { resolvePassportPreviewUrl } from "./resolve-passport-preview-url.ts";

function context(previewAvailable: boolean, passportNumber: string | null): PublicRentalContext {
  return {
    identity: {
      licenseStatus: "LICENSE_VALID",
      identityReady: true,
      passport: {
        status: "READY",
        previewAvailable,
        fields: passportNumber
          ? {
              fullName: null,
              passportNumber,
              nationality: null,
              dateOfBirth: null,
              sex: null,
              passportIssueDate: null,
              passportExpiryDate: null,
              issuingCountry: null,
            }
          : null,
      },
    },
  } as PublicRentalContext;
}

describe("resolvePassportPreviewUrl", () => {
  it("prefers local object URL", () => {
    const url = resolvePassportPreviewUrl("tok", context(true, "A1"), "blob:local");
    assert.equal(url, "blob:local");
  });

  it("uses server preview when persisted capture exists", () => {
    const url = resolvePassportPreviewUrl("tok", context(true, "P123"), null);
    assert.ok(url?.includes("/rental/tok/passport/preview"));
    assert.ok(url?.includes("v=P123"));
  });

  it("returns null when no local or server preview", () => {
    assert.equal(resolvePassportPreviewUrl("tok", context(false, null), null), null);
  });
});
