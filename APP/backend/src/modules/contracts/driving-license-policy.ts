import type { DrivingLicenseVerificationStatus } from "@prisma/client";
import {
  businessToday,
  calendarDateToStoredUtc,
  formatCalendarDate,
  isLicenseExpiredOn,
  parseCalendarDate,
  type CalendarDate,
} from "src/modules/contracts/license-calendar";
import type { DrivingLicenseOcrResult } from "src/modules/contracts/ocr/driving-license-ocr.types";
import type { LicenseUploadFailureCode } from "src/modules/contracts/license-frame";

export type PublicLicenseUnreadableReason = "BAD_FRAME" | "OCR" | null;

export interface EvaluatedLicenseVerification {
  status: DrivingLicenseVerificationStatus;
  licenseNumber: string | null;
  expiryDate: Date | null;
  expiryCalendar: CalendarDate | null;
  confidence: number | null;
  provider: string | null;
  providerVersion: string | null;
  unreadableReason: PublicLicenseUnreadableReason;
  uploadFailureCode: LicenseUploadFailureCode | null;
}

export function evaluateDrivingLicenseOcr(
  result: DrivingLicenseOcrResult,
  now: Date,
  offsetMinutes: number,
): EvaluatedLicenseVerification {
  if (!result.ok) {
    const status =
      result.reason === "NOT_CONFIGURED" || result.reason === "PROVIDER_UNAVAILABLE"
        ? "PROVIDER_UNAVAILABLE"
        : "UNREADABLE";
    const uploadFailureCode =
      result.reason === "BAD_FRAME" ? ("BAD_FRAME" as LicenseUploadFailureCode) : null;
    const unreadableReason: PublicLicenseUnreadableReason =
      result.reason === "BAD_FRAME" ? "BAD_FRAME" : status === "UNREADABLE" ? "OCR" : null;
    return {
      status,
      licenseNumber: null,
      expiryDate: null,
      expiryCalendar: null,
      confidence: result.confidence ?? null,
      provider: result.provider,
      providerVersion: result.providerVersion ?? null,
      unreadableReason,
      uploadFailureCode,
    };
  }

  const number = result.licenseNumber?.trim() || null;
  const parsedExpiry = result.expiryDate ? parseCalendarDate(result.expiryDate) : null;
  const confidence = result.confidence;

  if (!number || !parsedExpiry) {
    return {
      status: "UNREADABLE",
      licenseNumber: null,
      expiryDate: null,
      expiryCalendar: null,
      confidence,
      provider: result.provider,
      providerVersion: result.providerVersion ?? null,
      unreadableReason: "OCR",
      uploadFailureCode: "OCR_FAILED",
    };
  }

  const today = businessToday(now, offsetMinutes);
  const expired = isLicenseExpiredOn(parsedExpiry, today);
  return {
    status: expired ? "EXPIRED" : "VALID",
    licenseNumber: number,
    expiryDate: calendarDateToStoredUtc(parsedExpiry),
    expiryCalendar: parsedExpiry,
    confidence,
    provider: result.provider,
    providerVersion: result.providerVersion ?? null,
    unreadableReason: null,
    uploadFailureCode: null,
  };
}

export function formatStoredExpiry(value: Date | null): string | null {
  if (!value) return null;
  return formatCalendarDate({
    y: value.getUTCFullYear(),
    m: value.getUTCMonth() + 1,
    d: value.getUTCDate(),
  });
}

export function maskLicenseNumber(value: string | null): string | null {
  if (!value) return null;
  const trimmed = value.replace(/\s+/g, "");
  if (trimmed.length <= 4) return "••••";
  return `••••${trimmed.slice(-4)}`;
}
