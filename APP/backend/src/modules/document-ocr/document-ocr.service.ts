import type { DocumentType } from "src/modules/document-ocr/document-ocr.constants";
import { createDocumentOcrProvider } from "src/modules/document-ocr/document-ocr-provider.factory";
import type {
  DocumentOcrOutcome,
  DocumentOcrProvider,
  DocumentOcrProviderResult,
  NormalizedFieldConfidence,
  NormalizedIdentityDocumentFields,
  NormalizedIdentityDocumentResult,
  NormalizedIdentityField,
  SecureDocumentInput,
} from "src/modules/document-ocr/document-ocr.types";

const TEXT_FIELDS = [
  "fullName",
  "firstName",
  "middleName",
  "lastName",
  "nationality",
  "passportNumber",
  "issuingCountry",
  "driverLicenseNumber",
] as const satisfies readonly NormalizedIdentityField[];

const DATE_FIELDS = [
  "passportIssueDate",
  "passportExpiryDate",
  "dateOfBirth",
  "driverLicenseExpiryDate",
] as const satisfies readonly NormalizedIdentityField[];

const ALL_FIELDS: readonly NormalizedIdentityField[] = [...TEXT_FIELDS, ...DATE_FIELDS, "sex"];

const MAX_TEXT_LENGTH = 200;

function cleanText(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.replace(/\s+/g, " ").trim();
  if (!trimmed) return null;
  return trimmed.slice(0, MAX_TEXT_LENGTH);
}

/** Real `YYYY-MM-DD` calendar dates only; anything else becomes null. */
function cleanDate(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(trimmed);
  if (!match) return null;
  const [y, m, d] = [Number(match[1]), Number(match[2]), Number(match[3])];
  const probe = new Date(Date.UTC(y, m - 1, d));
  if (probe.getUTCFullYear() !== y || probe.getUTCMonth() !== m - 1 || probe.getUTCDate() !== d) {
    return null;
  }
  return trimmed;
}

function cleanSex(value: unknown): "M" | "F" | "X" | null {
  if (typeof value !== "string") return null;
  const upper = value.trim().toUpperCase();
  if (upper === "M" || upper === "MALE") return "M";
  if (upper === "F" || upper === "FEMALE") return "F";
  if (upper === "X") return "X";
  return null;
}

function cleanConfidence(value: unknown): number | null {
  if (typeof value !== "number" || !Number.isFinite(value)) return null;
  return Math.min(1, Math.max(0, value));
}

/**
 * Whitelists normalized keys only. Anything else an adapter attaches (raw
 * vendor payloads, vendor field names) is dropped here and never persisted
 * or returned by an API.
 */
export function normalizeProviderResult(
  documentType: DocumentType,
  raw: Extract<DocumentOcrProviderResult, { ok: true }>,
): NormalizedIdentityDocumentResult {
  const source = (raw.fields ?? {}) as Record<string, unknown>;
  const fields = {} as NormalizedIdentityDocumentFields;
  for (const key of TEXT_FIELDS) fields[key] = cleanText(source[key]);
  for (const key of DATE_FIELDS) fields[key] = cleanDate(source[key]);
  fields.sex = cleanSex(source.sex);

  const fieldConfidence: NormalizedFieldConfidence = {};
  const rawConfidence = (raw.fieldConfidence ?? {}) as Record<string, unknown>;
  for (const key of ALL_FIELDS) {
    const value = cleanConfidence(rawConfidence[key]);
    if (value != null) fieldConfidence[key] = value;
  }

  return {
    documentType,
    documentRecognized: raw.documentRecognized === true,
    confidence: cleanConfidence(raw.confidence),
    fieldConfidence,
    ...fields,
  };
}

function supports(provider: DocumentOcrProvider, documentType: DocumentType): boolean {
  return documentType === "PASSPORT"
    ? provider.capabilities.supportsPassport
    : provider.capabilities.supportsDriverLicense;
}

/**
 * Single entry point for document OCR. Provider errors are sanitized to a
 * reason code; image bytes and vendor responses are never logged.
 */
export async function analyzeDocument(
  documentType: DocumentType,
  file: SecureDocumentInput,
  provider: DocumentOcrProvider = createDocumentOcrProvider(),
): Promise<DocumentOcrOutcome> {
  const base = { provider: provider.name, providerVersion: null };
  if (!supports(provider, documentType)) {
    return { ...base, ok: false, reason: "DOCUMENT_OCR_PROVIDER_NOT_CONFIGURED" };
  }

  let raw: DocumentOcrProviderResult;
  try {
    raw = await provider.analyze({ documentType, file });
  } catch {
    return { ...base, ok: false, reason: "DOCUMENT_OCR_FAILED" };
  }

  const providerVersion = typeof raw?.providerVersion === "string" ? raw.providerVersion : null;
  if (!raw || raw.ok !== true) {
    const reason = raw?.ok === false ? raw.reason : "DOCUMENT_OCR_FAILED";
    return { ...base, providerVersion, ok: false, reason };
  }
  return {
    ...base,
    providerVersion,
    ok: true,
    result: normalizeProviderResult(documentType, raw),
  };
}
