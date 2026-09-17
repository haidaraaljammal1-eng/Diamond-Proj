import type {
  DrivingLicenseVerification,
  DrivingLicenseVerificationStatus,
  PassportExtraction,
  PassportExtractionStatus,
} from "@prisma/client";
import { formatStoredExpiry } from "src/modules/contracts/driving-license-policy";

/**
 * ContractIdentityDraft — the only normalized identity structure the future
 * Official Contract Review depends on. Derived from the authoritative license
 * verification and the active passport attempt; never stored separately, so a
 * retake can never leave a stale "ready" identity behind.
 *
 * Not a Customer record and not a legal snapshot.
 */

export type IdentityFieldSource = "PASSPORT_OCR" | "DRIVER_LICENSE_OCR";

export interface IdentityDraftField {
  value: string | null;
  source: IdentityFieldSource;
}

export type IdentityLicenseStatus =
  | "LICENSE_REQUIRED"
  | "LICENSE_PROCESSING"
  | "LICENSE_VALID"
  | "LICENSE_INVALID";

export type IdentityPassportStatus =
  | "PASSPORT_REQUIRED"
  | "PASSPORT_PROCESSING"
  | "PASSPORT_READY"
  | "PASSPORT_FAILED";

/** Public passport attempt status. Detailed enough for the UI, provider-neutral. */
export type PublicPassportStatus = "REQUIRED" | PassportExtractionStatus;

export interface ContractIdentityDraft {
  fullName: IdentityDraftField;
  nationality: IdentityDraftField;
  passportNumber: IdentityDraftField;
  dateOfBirth: IdentityDraftField;
  sex: IdentityDraftField;
  passportIssueDate: IdentityDraftField;
  passportExpiryDate: IdentityDraftField;
  issuingCountry: IdentityDraftField;
  driverLicenseNumber: IdentityDraftField;
  driverLicenseExpiryDate: IdentityDraftField;
  licenseStatus: IdentityLicenseStatus;
  passportStatus: IdentityPassportStatus;
  identityReady: boolean;
  updatedAt: Date | null;
}

/** A PROCESSING attempt older than this was interrupted; the customer must retake. */
export const PASSPORT_PROCESSING_STALE_MS = 2 * 60 * 1000;

type LicenseRow = Pick<
  DrivingLicenseVerification,
  "status" | "licenseNumber" | "expiryDate" | "updatedAt"
>;

type PassportRow = Pick<
  PassportExtraction,
  | "status"
  | "fullName"
  | "nationality"
  | "passportNumber"
  | "dateOfBirth"
  | "sex"
  | "passportIssueDate"
  | "passportExpiryDate"
  | "issuingCountry"
  | "createdAt"
  | "updatedAt"
>;

export function identityLicenseStatus(
  status: DrivingLicenseVerificationStatus | null | undefined,
): IdentityLicenseStatus {
  if (!status) return "LICENSE_REQUIRED";
  if (status === "VALID") return "LICENSE_VALID";
  if (status === "PENDING") return "LICENSE_PROCESSING";
  return "LICENSE_INVALID";
}

export function publicPassportStatus(passport: PassportRow | null, now: Date): PublicPassportStatus {
  if (!passport) return "REQUIRED";
  if (
    passport.status === "PROCESSING" &&
    now.getTime() - passport.createdAt.getTime() > PASSPORT_PROCESSING_STALE_MS
  ) {
    return "FAILED";
  }
  return passport.status;
}

export function identityPassportStatus(status: PublicPassportStatus): IdentityPassportStatus {
  if (status === "REQUIRED") return "PASSPORT_REQUIRED";
  if (status === "PROCESSING") return "PASSPORT_PROCESSING";
  if (status === "READY") return "PASSPORT_READY";
  return "PASSPORT_FAILED";
}

/** Backend-authoritative continue gate. */
export function isIdentityReady(
  licenseStatus: IdentityLicenseStatus,
  passportStatus: IdentityPassportStatus,
): boolean {
  return licenseStatus === "LICENSE_VALID" && passportStatus === "PASSPORT_READY";
}

export function buildContractIdentityDraft(input: {
  license: LicenseRow | null;
  passport: PassportRow | null;
  now?: Date;
}): ContractIdentityDraft {
  const now = input.now ?? new Date();
  const licenseStatus = identityLicenseStatus(input.license?.status);
  const passportPublic = publicPassportStatus(input.passport, now);
  const passportStatus = identityPassportStatus(passportPublic);
  const license = licenseStatus === "LICENSE_VALID" ? input.license : null;
  const passport = passportPublic === "READY" ? input.passport : null;

  const fromPassport = (value: string | null | undefined): IdentityDraftField => ({
    value: value ?? null,
    source: "PASSPORT_OCR",
  });
  const fromLicense = (value: string | null | undefined): IdentityDraftField => ({
    value: value ?? null,
    source: "DRIVER_LICENSE_OCR",
  });

  const stamps = [input.license?.updatedAt, input.passport?.updatedAt].filter(
    (d): d is Date => d instanceof Date,
  );

  return {
    fullName: fromPassport(passport?.fullName),
    nationality: fromPassport(passport?.nationality),
    passportNumber: fromPassport(passport?.passportNumber),
    dateOfBirth: fromPassport(formatStoredExpiry(passport?.dateOfBirth ?? null)),
    sex: fromPassport(passport?.sex),
    passportIssueDate: fromPassport(formatStoredExpiry(passport?.passportIssueDate ?? null)),
    passportExpiryDate: fromPassport(formatStoredExpiry(passport?.passportExpiryDate ?? null)),
    issuingCountry: fromPassport(passport?.issuingCountry),
    driverLicenseNumber: fromLicense(license?.licenseNumber),
    driverLicenseExpiryDate: fromLicense(formatStoredExpiry(license?.expiryDate ?? null)),
    licenseStatus,
    passportStatus,
    identityReady: isIdentityReady(licenseStatus, passportStatus),
    updatedAt: stamps.length ? new Date(Math.max(...stamps.map((d) => d.getTime()))) : null,
  };
}

/** Public projection: normalized values only; provenance stays internal. */
export function toPublicIdentityDraft(draft: ContractIdentityDraft) {
  return {
    fullName: draft.fullName.value,
    nationality: draft.nationality.value,
    passportNumber: draft.passportNumber.value,
    dateOfBirth: draft.dateOfBirth.value,
    sex: draft.sex.value,
    passportIssueDate: draft.passportIssueDate.value,
    passportExpiryDate: draft.passportExpiryDate.value,
    issuingCountry: draft.issuingCountry.value,
    driverLicenseNumber: draft.driverLicenseNumber.value,
    driverLicenseExpiryDate: draft.driverLicenseExpiryDate.value,
    licenseStatus: draft.licenseStatus,
    passportStatus: draft.passportStatus,
    identityReady: draft.identityReady,
    updatedAt: draft.updatedAt,
  };
}
