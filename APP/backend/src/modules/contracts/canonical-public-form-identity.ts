import type { DrivingLicenseVerification, Prisma } from "@prisma/client";
import {
  businessToday,
  calendarDateToStoredUtc,
  isLicenseExpiredOn,
  parseCalendarDate,
} from "src/modules/contracts/license-calendar";
import { contractError } from "src/modules/contracts/contracts.errors";
import type { z } from "zod";
import { PublicFormSchema } from "src/modules/contracts/contracts.schema";

type PublicFormInput = z.infer<typeof PublicFormSchema>;

type Tx = Prisma.TransactionClient;

function trimOrNull(value: string | undefined): string | null {
  if (value === undefined) return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function parseOptionalFormDate(iso: string | undefined): Date | null {
  if (!iso) return null;
  const parsed = parseCalendarDate(iso);
  return parsed ? calendarDateToStoredUtc(parsed) : null;
}

function assertActiveDocumentId(
  expected: string | undefined,
  actual: string | null | undefined,
): void {
  if (!expected) return;
  if (actual !== expected) {
    throw contractError.identityDocumentStale();
  }
}

export interface CanonicalIdentityMaterialized {
  passportNumber: string | null;
  drivingLicenseNumber: string;
  drivingLicenseExpiry: Date;
  dateOfBirth: Date | null;
  drivingLicenseIssueDate: Date | null;
  drivingLicensePlaceOfIssue: string | null;
}

/**
 * Re-read active documents under locks, apply customer-reviewed canonical text to
 * active PassportExtraction / DrivingLicense* rows, and return values for Customer.
 */
export async function applyCanonicalPublicFormIdentity(
  tx: Tx,
  contractId: string,
  input: PublicFormInput,
  verification: DrivingLicenseVerification | null,
  now: Date,
  offsetMinutes: number,
): Promise<CanonicalIdentityMaterialized> {
  const activeLicenseDoc = await tx.contractDocument.findFirst({
    where: { contractId, type: "DRIVING_LICENSE", supersededAt: null },
    select: { id: true },
  });
  const activePassportDoc = await tx.contractDocument.findFirst({
    where: { contractId, type: "PASSPORT", supersededAt: null },
    select: { id: true },
  });

  assertActiveDocumentId(input.licenseDocumentId, activeLicenseDoc?.id);
  assertActiveDocumentId(input.passportDocumentId, activePassportDoc?.id);

  let licenseNumber = verification?.licenseNumber ?? null;
  let licenseExpiry = verification?.expiryDate ?? null;

  if (activeLicenseDoc && verification?.documentId === activeLicenseDoc.id) {
    const extraction = await tx.drivingLicenseExtraction.findUnique({
      where: { documentId: activeLicenseDoc.id },
    });

    const reviewedNumber = trimOrNull(input.drivingLicenseNumber);
    if (reviewedNumber) {
      licenseNumber = reviewedNumber;
    }

    if (input.drivingLicenseExpiryDate && verification.status === "VALID") {
      const parsed = parseCalendarDate(input.drivingLicenseExpiryDate);
      if (!parsed) throw contractError.publicFormIncomplete();
      if (isLicenseExpiredOn(parsed, businessToday(now, offsetMinutes))) {
        throw contractError.drivingLicenseExpired(input.drivingLicenseExpiryDate);
      }
      licenseExpiry = calendarDateToStoredUtc(parsed);
    }

    const extractionUpdate: Prisma.DrivingLicenseExtractionUpdateInput = {};
    if (reviewedNumber) extractionUpdate.licenseNumber = reviewedNumber;
    if (licenseExpiry) extractionUpdate.expiryDate = licenseExpiry;
    if (input.licenseHolderNameEn !== undefined) {
      extractionUpdate.holderNameEn = trimOrNull(input.licenseHolderNameEn);
    }
    if (input.licenseNationality !== undefined) {
      extractionUpdate.nationality = trimOrNull(input.licenseNationality);
    }
    if (input.licenseDateOfBirth !== undefined) {
      extractionUpdate.dateOfBirth = parseOptionalFormDate(input.licenseDateOfBirth);
    }
    if (input.drivingLicenseIssueDate !== undefined) {
      extractionUpdate.issueDate = parseOptionalFormDate(input.drivingLicenseIssueDate);
    }
    if (input.drivingLicensePlaceOfIssue !== undefined) {
      extractionUpdate.placeOfIssue = trimOrNull(input.drivingLicensePlaceOfIssue);
    }

    if (extraction && Object.keys(extractionUpdate).length > 0) {
      await tx.drivingLicenseExtraction.update({
        where: { id: extraction.id },
        data: extractionUpdate,
      });
    }

    const verificationUpdate: Prisma.DrivingLicenseVerificationUpdateInput = {};
    if (reviewedNumber) verificationUpdate.licenseNumber = reviewedNumber;
    if (licenseExpiry) verificationUpdate.expiryDate = licenseExpiry;

    if (Object.keys(verificationUpdate).length > 0) {
      await tx.drivingLicenseVerification.update({
        where: { id: verification.id },
        data: verificationUpdate,
      });
    }
  }

  if (!licenseNumber || !licenseExpiry) {
    throw contractError.drivingLicenseRequired();
  }

  let passportNumber = trimOrNull(input.passportNumber);

  if (activePassportDoc) {
    const passport = await tx.passportExtraction.findUnique({
      where: { documentId: activePassportDoc.id },
    });
    if (passport) {
      const passportUpdate: Prisma.PassportExtractionUpdateInput = {};
      if (passportNumber) passportUpdate.passportNumber = passportNumber;
      if (input.passportFullName !== undefined) {
        passportUpdate.fullName = trimOrNull(input.passportFullName);
      }
      if (input.passportNationality !== undefined) {
        passportUpdate.nationality = trimOrNull(input.passportNationality);
      }
      if (input.passportDateOfBirth !== undefined) {
        passportUpdate.dateOfBirth = parseOptionalFormDate(input.passportDateOfBirth);
      }
      if (input.passportSex !== undefined) {
        passportUpdate.sex = trimOrNull(input.passportSex);
      }
      if (input.passportIssueDate !== undefined) {
        passportUpdate.passportIssueDate = parseOptionalFormDate(input.passportIssueDate);
      }
      if (input.passportExpiryDate !== undefined) {
        passportUpdate.passportExpiryDate = parseOptionalFormDate(input.passportExpiryDate);
      }
      if (input.passportIssuingCountry !== undefined) {
        passportUpdate.issuingCountry = trimOrNull(input.passportIssuingCountry);
      }

      if (Object.keys(passportUpdate).length > 0) {
        await tx.passportExtraction.update({
          where: { id: passport.id },
          data: passportUpdate,
        });
      }
      if (!passportNumber) {
        passportNumber = passport.passportNumber;
      }
    }
  }

  return {
    passportNumber,
    drivingLicenseNumber: licenseNumber,
    drivingLicenseExpiry: licenseExpiry,
    dateOfBirth: parseOptionalFormDate(input.passportDateOfBirth ?? input.dateOfBirth),
    drivingLicenseIssueDate: parseOptionalFormDate(input.drivingLicenseIssueDate),
    drivingLicensePlaceOfIssue: trimOrNull(input.drivingLicensePlaceOfIssue),
  };
}
