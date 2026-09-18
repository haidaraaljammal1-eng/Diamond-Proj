import type { OfficialContractView } from "../types/official-contract.types";
import type { PublicRentalContext } from "../types/public-rental.types";

/**
 * Fills the official contract's identity fields from the normalized identity
 * already on the rental context (Backend OCR data). Values the Backend resolved,
 * including customer review corrections, are never replaced. Permission and
 * readiness flags remain exactly as the Backend returned them.
 */
export function withNormalizedIdentity(
  view: OfficialContractView,
  context: Pick<PublicRentalContext, "identity" | "licenseVerification">,
): OfficialContractView {
  const passport = context.identity.passport.status === "READY" ? context.identity.passport.fields : null;
  const licenseValid = context.licenseVerification.status === "VALID";
  const fill = <T>(current: T | null, next: T | null | undefined): T | null =>
    current ?? next ?? null;

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
  };
}
