import type { PublicRentalContext } from "../types/public-rental.types";
import { formatLicenseExpiry } from "./format-license-date.ts";
import { showLicenseStatusCardFacts } from "./license-status-card-facts.ts";

/** Read-only licence number/expiry for VALID/EXPIRED status cards (verification-first). */
export function resolveLicenseStatusCardValues(
  context: Pick<
    PublicRentalContext,
    "licenseVerification" | "customer" | "drivingLicenseExtraction"
  >,
): { licenseNumber: string | null; expiryDisplay: string | null; showFacts: boolean } {
  const status = context.licenseVerification.status;
  let licenseNumber = context.licenseVerification.licenseNumber?.trim() || null;

  if (!licenseNumber && status === "VALID") {
    licenseNumber = context.customer?.drivingLicenseNumber?.trim() || null;
  }

  if (!licenseNumber && status === "EXPIRED") {
    licenseNumber =
      context.drivingLicenseExtraction?.fields.licenseNumber.value?.trim() || null;
  }

  let expiryIso =
    context.licenseVerification.expiryDate?.trim() ||
    (status === "VALID" ? context.customer?.drivingLicenseExpiry?.trim() : null) ||
    null;

  if (!expiryIso && status === "EXPIRED") {
    expiryIso = context.drivingLicenseExtraction?.fields.expiryDate.value?.trim() || null;
  }

  const expiryDisplay = formatLicenseExpiry(expiryIso);
  const showFacts = showLicenseStatusCardFacts(status, licenseNumber, expiryDisplay);

  return { licenseNumber, expiryDisplay, showFacts };
}
