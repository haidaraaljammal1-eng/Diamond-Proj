import type { DrivingLicenseOcrResult } from "src/modules/contracts/ocr/driving-license-ocr.types";
import { buildLicenceStructuredResult } from "src/modules/vision-ai/extraction/licence-postprocess";
import { buildPassportStructuredResult } from "src/modules/vision-ai/extraction/passport-postprocess";
import { visionAiNotImplemented } from "src/modules/vision-ai/vision-ai-not-implemented";
import type {
  VisionAIProvider,
  VisionExtractionResult,
  VisionImageInput,
} from "src/modules/vision-ai/vision-ai.types";

export interface FakeLicenseInput {
  licenseNumber?: string | null;
  expiryDate?: string | null;
}

export function fakeLicenseOcrResult(input: FakeLicenseInput = {}): DrivingLicenseOcrResult {
  const licenseNumber = input.licenseNumber !== undefined ? input.licenseNumber : "DL-OK";
  const expiryDate = input.expiryDate !== undefined ? input.expiryDate : "2031-06-01";
  if (!licenseNumber?.trim() || !expiryDate?.trim()) {
    return {
      ok: false,
      reason: "UNREADABLE",
      provider: "test-license-ocr",
      providerVersion: "test",
    };
  }
  return {
    ok: true,
    licenseNumber: licenseNumber.trim(),
    expiryDate: expiryDate.trim(),
    holderName: null,
    confidence: 1,
    fieldConfidences: { licenseNumber: 1, expiryDate: 1 },
    provider: "test-license-ocr",
    providerVersion: "test",
  };
}

export type FakeVisionResponder = () => Promise<VisionExtractionResult> | VisionExtractionResult;

export const SYNTHETIC_PASSPORT = {
  fullName: "TEST PERSON",
  passportNumber: "TEST123456",
  nationality: "TEST",
} as const;

export function fakeLicenseExtraction(input: FakeLicenseInput = {}): VisionExtractionResult {
  return {
    ok: true,
    providerVersion: "test-v1",
    extraction: buildLicenceStructuredResult({
      fullName: null,
      licenceNumber: input.licenseNumber !== undefined ? input.licenseNumber : "DL-OK",
      nationality: null,
      dateOfBirth: null,
      issueDate: null,
      expiryDate: input.expiryDate !== undefined ? input.expiryDate : "2031-06-01",
      issuingCountry: null,
      issuingAuthority: null,
      dateOfBirthNeedsReview: false,
      issueDateNeedsReview: false,
      expiryDateNeedsReview: false,
    }),
  };
}

export function fakeUnrecognizedPassportExtraction(): VisionExtractionResult {
  return {
    ok: true,
    providerVersion: "test-v1",
    extraction: buildPassportStructuredResult({
      firstName: null,
      lastName: null,
      fullName: null,
      passportNumber: null,
      nationality: null,
      dateOfBirth: null,
      expiryDate: null,
      sex: null,
      issuingCountry: null,
      mrzLine1: null,
      mrzLine2: null,
    }),
  };
}

export function fakePassportExtraction(
  fields: {
    fullName?: string | null;
    passportNumber?: string | null;
    nationality?: string | null;
    dateOfBirth?: string | null;
    expiryDate?: string | null;
  } = SYNTHETIC_PASSPORT,
): VisionExtractionResult {
  return {
    ok: true,
    providerVersion: "test-v1",
    extraction: buildPassportStructuredResult({
      firstName: null,
      lastName: null,
      fullName: fields.fullName !== undefined ? fields.fullName : SYNTHETIC_PASSPORT.fullName,
      passportNumber:
        fields.passportNumber !== undefined ? fields.passportNumber : SYNTHETIC_PASSPORT.passportNumber,
      nationality: fields.nationality !== undefined ? fields.nationality : SYNTHETIC_PASSPORT.nationality,
      dateOfBirth: fields.dateOfBirth ?? null,
      expiryDate: fields.expiryDate ?? null,
      sex: null,
      issuingCountry: null,
      mrzLine1: null,
      mrzLine2: null,
    }),
  };
}

export function createFakeVisionAIProvider(initial?: {
  license?: FakeVisionResponder;
  passport?: FakeVisionResponder;
}) {
  let license: FakeVisionResponder = initial?.license ?? (() => fakeLicenseExtraction());
  let passport: FakeVisionResponder = initial?.passport ?? (() => fakePassportExtraction());
  const calls: string[] = [];

  const provider: VisionAIProvider = {
    name: "test",
    configured: true,
    async runConnectionTest() {
      return { ok: true, model: "test", markerFound: true };
    },
    async extractPassport(_input: VisionImageInput) {
      calls.push("PASSPORT");
      return passport();
    },
    async extractDrivingLicence(_input: VisionImageInput) {
      calls.push("DRIVER_LICENSE");
      return license();
    },
    async compareVehicleImages() {
      return visionAiNotImplemented();
    },
  };

  return {
    provider,
    calls,
    setLicense(responder: FakeVisionResponder | FakeLicenseInput) {
      license = typeof responder === "function" ? responder : () => fakeLicenseExtraction(responder);
    },
    setPassport(responder: FakeVisionResponder) {
      passport = responder;
    },
  };
}
