import type { OfficialContractView } from "../types/official-contract.types";
import type { PublicRentalContext } from "../types/public-rental.types";

/**
 * Fills the official contract's identity fields from the normalized identity
 * already on the rental context (Backend OCR data, or a demo-simulation overlay
 * of the same shape). Values the Backend resolved — including customer review
 * corrections — are never replaced; only missing values are filled.
 *
 * Source-agnostic by design: there is no simulation branch here.
 */
export function withNormalizedIdentity(
  view: OfficialContractView,
  context: Pick<PublicRentalContext, "identity" | "licenseVerification">,
): OfficialContractView {
  const passport = context.identity.passport.status === "READY" ? context.identity.passport.fields : null;
  const licenseValid = context.licenseVerification.status === "VALID";
  const fill = <T>(current: T | null, next: T | null | undefined): T | null =>
    current ?? next ?? null;
  const reviewable = view.contract.status === "AWAITING" || view.contract.status === "FORM";

  return {
    ...view,
    hirer: {
      ...view.hirer,
      name: fill(view.hirer.name, passport?.fullName),
      nationality: fill(view.hirer.nationality, passport?.nationality),
      passportNumber: fill(view.hirer.passportNumber, passport?.passportNumber),
      driverLicenseNumber: fill(
        view.hirer.driverLicenseNumber,
        licenseValid ? context.licenseVerification.licenseNumber : null,
      ),
      driverLicenseExpiryDate: fill(
        view.hirer.driverLicenseExpiryDate,
        licenseValid ? context.licenseVerification.expiryDate : null,
      ),
    },
    identity: {
      identityReady: view.identity.identityReady || context.identity.identityReady,
    },
    // Same gate as the Backend: a reviewable agreement becomes editable once
    // identity is ready. The field policy itself still comes from the Backend.
    permissions: {
      ...view.permissions,
      canEdit: view.permissions.canEdit || (reviewable && context.identity.identityReady),
    },
  };
}
