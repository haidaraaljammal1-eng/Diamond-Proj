import { analyzeIdentityDocument } from "src/modules/vision-ai/identity-analysis.service";
import type {
  DrivingLicenseOcrInput,
  DrivingLicenseOcrResult,
} from "src/modules/contracts/ocr/driving-license-ocr.types";

/**
 * Maps Vision AI identity analysis into the existing driving-license policy input.
 * Expiry/confidence rules in `driving-license-policy.ts` remain the validity authority.
 */
export async function analyzeDrivingLicenseDocument(
  input: DrivingLicenseOcrInput,
): Promise<DrivingLicenseOcrResult> {
  const outcome = await analyzeIdentityDocument("DRIVER_LICENSE", input);
  const provider = outcome.provider;
  const providerVersion = outcome.providerVersion ?? undefined;

  if (!outcome.ok) {
    return {
      ok: false,
      reason: outcome.reason === "IDENTITY_PROVIDER_NOT_CONFIGURED" ? "NOT_CONFIGURED" : "UNREADABLE",
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
