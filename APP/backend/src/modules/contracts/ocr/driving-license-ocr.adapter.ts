import { analyzeDocument } from "src/modules/document-ocr/document-ocr.service";
import type {
  DrivingLicenseOcrInput,
  DrivingLicenseOcrResult,
} from "src/modules/contracts/ocr/driving-license-ocr.types";

/**
 * Maps the provider-neutral Document OCR outcome into the existing
 * driving-license policy input. The expiry/confidence rules in
 * `driving-license-policy.ts` stay the single validity authority.
 */
export async function analyzeDrivingLicenseDocument(
  input: DrivingLicenseOcrInput,
): Promise<DrivingLicenseOcrResult> {
  const outcome = await analyzeDocument("DRIVER_LICENSE", input);
  const provider = outcome.provider;
  const providerVersion = outcome.providerVersion ?? undefined;

  if (!outcome.ok) {
    return {
      ok: false,
      reason: outcome.reason === "DOCUMENT_OCR_PROVIDER_NOT_CONFIGURED" ? "NOT_CONFIGURED" : "UNREADABLE",
      provider,
      providerVersion,
    };
  }

  const result = outcome.result;
  if (!result.documentRecognized) {
    return { ok: false, reason: "UNREADABLE", provider, providerVersion, confidence: result.confidence };
  }

  return {
    ok: true,
    licenseNumber: result.driverLicenseNumber,
    expiryDate: result.driverLicenseExpiryDate,
    holderName: result.fullName,
    confidence: result.confidence,
    fieldConfidences: {
      licenseNumber: result.fieldConfidence.driverLicenseNumber,
      expiryDate: result.fieldConfidence.driverLicenseExpiryDate,
    },
    provider,
    providerVersion,
  };
}
