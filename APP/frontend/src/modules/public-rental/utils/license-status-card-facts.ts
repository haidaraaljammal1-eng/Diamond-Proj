import type { DrivingLicenseVerificationStatus } from "../types/public-rental.types";

/** Show OCR-backed number/expiry inside VALID/EXPIRED status cards only when both are present. */
export function showLicenseStatusCardFacts(
  status: DrivingLicenseVerificationStatus | null | undefined,
  licenseNumber: string | null | undefined,
  expiryDisplay: string | null | undefined,
): boolean {
  if (status !== "VALID" && status !== "EXPIRED") return false;
  const number = licenseNumber?.trim();
  const expiry = expiryDisplay?.trim();
  return Boolean(number && expiry);
}
