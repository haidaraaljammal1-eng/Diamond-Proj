import type { DrivingLicenseVerificationStatus } from "@prisma/client";
import { env } from "src/config/env";
import { DRIVING_LICENSE_MIN_CONFIDENCE } from "src/modules/contracts/contracts.constants";
import {
  businessToday,
  calendarDateToStoredUtc,
  formatCalendarDate,
  isLicenseExpiredOn,
  parseCalendarDate,
  type CalendarDate,
} from "src/modules/contracts/license-calendar";
import type { DrivingLicenseOcrResult } from "src/modules/contracts/ocr/driving-license-ocr.types";

export interface EvaluatedLicenseVerification {
  status: DrivingLicenseVerificationStatus;
  licenseNumber: string | null;
  expiryDate: Date | null;
  expiryCalendar: CalendarDate | null;
  confidence: number | null;
  provider: string | null;
  providerVersion: string | null;
}

function minConfidence(): number {
  return env.DOCUMENT_OCR_MIN_CONFIDENCE || DRIVING_LICENSE_MIN_CONFIDENCE;
}

function confidencePasses(result: Extract<DrivingLicenseOcrResult, { ok: true }>): boolean {
  const threshold = minConfidence();
  const fields = result.fieldConfidences;
  if (fields && (fields.licenseNumber != null || fields.expiryDate != null)) {
    const numberOk = fields.licenseNumber == null || fields.licenseNumber >= threshold;
    const expiryOk = fields.expiryDate == null || fields.expiryDate >= threshold;
    return numberOk && expiryOk;
  }
  if (result.confidence == null) return false;
  return result.confidence >= threshold;
}

export function evaluateDrivingLicenseOcr(
  result: DrivingLicenseOcrResult,
  now: Date,
  offsetMinutes: number,
): EvaluatedLicenseVerification {
  if (!result.ok) {
    return {
      status: result.reason === "NOT_CONFIGURED" ? "PROVIDER_UNAVAILABLE" : "UNREADABLE",
      licenseNumber: null,
      expiryDate: null,
      expiryCalendar: null,
      confidence: result.confidence ?? null,
      provider: result.provider,
      providerVersion: result.providerVersion ?? null,
    };
  }

  const number = result.licenseNumber?.trim() || null;
  const parsedExpiry = result.expiryDate ? parseCalendarDate(result.expiryDate) : null;
  const confidence = result.confidence;

  if (!number || !parsedExpiry) {
    return {
      status: "UNREADABLE",
      licenseNumber: number,
      expiryDate: parsedExpiry ? calendarDateToStoredUtc(parsedExpiry) : null,
      expiryCalendar: parsedExpiry,
      confidence,
      provider: result.provider,
      providerVersion: result.providerVersion ?? null,
    };
  }

  if (!confidencePasses(result)) {
    return {
      status: "REVIEW_REQUIRED",
      licenseNumber: number,
      expiryDate: calendarDateToStoredUtc(parsedExpiry),
      expiryCalendar: parsedExpiry,
      confidence,
      provider: result.provider,
      providerVersion: result.providerVersion ?? null,
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
