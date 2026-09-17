import type { PassportExtractionStatus } from "@prisma/client";
import { calendarDateToStoredUtc, parseCalendarDate } from "src/modules/contracts/license-calendar";
import type { DocumentOcrOutcome } from "src/modules/document-ocr/document-ocr.types";

export interface EvaluatedPassportExtraction {
  status: Exclude<PassportExtractionStatus, "PROCESSING">;
  fullName: string | null;
  firstName: string | null;
  middleName: string | null;
  lastName: string | null;
  nationality: string | null;
  passportNumber: string | null;
  passportIssueDate: Date | null;
  passportExpiryDate: Date | null;
  dateOfBirth: Date | null;
  sex: string | null;
  issuingCountry: string | null;
  confidence: number | null;
  provider: string;
  providerVersion: string | null;
}

const EMPTY_FIELDS = {
  fullName: null,
  firstName: null,
  middleName: null,
  lastName: null,
  nationality: null,
  passportNumber: null,
  passportIssueDate: null,
  passportExpiryDate: null,
  dateOfBirth: null,
  sex: null,
  issuingCountry: null,
  confidence: null,
} as const;

function storedDate(value: string | null): Date | null {
  const parsed = value ? parseCalendarDate(value) : null;
  return parsed ? calendarDateToStoredUtc(parsed) : null;
}

/**
 * Passport success rule: recognized document with at least a full name or a
 * passport number. No passport-expiry hard gate (license validity is the gate).
 */
export function evaluatePassportOcr(outcome: DocumentOcrOutcome): EvaluatedPassportExtraction {
  const meta = { provider: outcome.provider, providerVersion: outcome.providerVersion };

  if (!outcome.ok) {
    const status =
      outcome.reason === "DOCUMENT_OCR_PROVIDER_NOT_CONFIGURED"
        ? "PROVIDER_UNAVAILABLE"
        : outcome.reason === "DOCUMENT_OCR_NOT_RECOGNIZED"
          ? "NOT_RECOGNIZED"
          : "FAILED";
    return { ...EMPTY_FIELDS, ...meta, status };
  }

  const r = outcome.result;
  if (!r.documentRecognized) {
    return { ...EMPTY_FIELDS, ...meta, status: "NOT_RECOGNIZED" };
  }

  const composedName =
    r.fullName ?? ([r.firstName, r.middleName, r.lastName].filter(Boolean).join(" ") || null);
  if (!composedName && !r.passportNumber) {
    return { ...EMPTY_FIELDS, ...meta, status: "FAILED", confidence: r.confidence };
  }

  return {
    ...meta,
    status: "READY",
    fullName: composedName,
    firstName: r.firstName,
    middleName: r.middleName,
    lastName: r.lastName,
    nationality: r.nationality,
    passportNumber: r.passportNumber,
    passportIssueDate: storedDate(r.passportIssueDate),
    passportExpiryDate: storedDate(r.passportExpiryDate),
    dateOfBirth: storedDate(r.dateOfBirth),
    sex: r.sex,
    issuingCountry: r.issuingCountry,
    confidence: r.confidence,
  };
}
