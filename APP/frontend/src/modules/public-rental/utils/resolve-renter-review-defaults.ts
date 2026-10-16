import type { PublicRentalContext } from "../types/public-rental.types";
import type { PublicRentalReviewFormValues } from "../schemas/public-rental-review.schema";
import { resolvePublicRentalFormDefaults } from "./public-rental-form-prefill.ts";

function trimOrEmpty(value: string | null | undefined): string {
  return value?.trim() ?? "";
}

function resolveOcrPassportNumber(context: PublicRentalContext): string {
  const passport = context.identity?.passport.fields;
  return trimOrEmpty(passport?.passportNumber) || trimOrEmpty(context.customer?.passportNumber);
}

function resolveOcrLicenseNumber(context: PublicRentalContext): string {
  const license = context.licenseVerification;
  const extraction = context.drivingLicenseExtraction?.fields;
  return (
    trimOrEmpty(license.licenseNumber) ||
    trimOrEmpty(extraction?.licenseNumber.value) ||
    trimOrEmpty(context.customer?.drivingLicenseNumber)
  );
}

function resolveOcrLicenseExpiry(context: PublicRentalContext): string {
  const license = context.licenseVerification;
  const extraction = context.drivingLicenseExtraction?.fields;
  return (
    trimOrEmpty(license.expiryDate) ||
    trimOrEmpty(extraction?.expiryDate.value) ||
    trimOrEmpty(context.customer?.drivingLicenseExpiry)
  );
}

export function resolveRenterReviewDefaults(context: PublicRentalContext): PublicRentalReviewFormValues {
  const personal = resolvePublicRentalFormDefaults(context);

  return {
    ...personal,
    licenseDocumentId: context.licenseVerification.activeDocumentId ?? undefined,
    passportDocumentId: context.identity?.passport.activeDocumentId ?? undefined,
    passportNumber: resolveOcrPassportNumber(context),
    drivingLicenseNumber: resolveOcrLicenseNumber(context),
    drivingLicenseExpiryDate: resolveOcrLicenseExpiry(context),
  };
}

export function renterReviewMountKey(context: PublicRentalContext): string {
  const ids = [
    context.licenseVerification.activeDocumentId,
    context.identity?.passport.activeDocumentId,
    context.licenseVerification.licenseNumber,
    context.identity?.passport.fields?.passportNumber,
  ]
    .filter(Boolean)
    .join("|");
  return `review-${context.contract.contractNumber}-${ids}`;
}
