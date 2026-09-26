import type {
  IdentityDocumentAnalysisOutcome,
  IdentityDocumentType,
  SecureDocumentInput,
} from "src/modules/vision-ai/identity-document.types";
import {
  mapExtractionFailure,
  mapExtractionSuccess,
} from "src/modules/vision-ai/identity-analysis.bridge";
import { createVisionAIProvider } from "src/modules/vision-ai/vision-ai-provider.factory";
import { VisionAIError } from "src/modules/vision-ai/vision-ai.errors";
import type { VisionAIProvider } from "src/modules/vision-ai/vision-ai.types";

/**
 * Provider-neutral identity document analysis. Image bytes and vendor payloads
 * are never logged.
 */
export async function analyzeIdentityDocument(
  documentType: IdentityDocumentType,
  file: SecureDocumentInput,
  provider: VisionAIProvider = createVisionAIProvider(),
): Promise<IdentityDocumentAnalysisOutcome> {
  const base = { provider: provider.name, providerVersion: null as string | null };

  try {
    const raw =
      documentType === "PASSPORT"
        ? await provider.extractPassport(file)
        : await provider.extractDrivingLicence(file);

    if (!raw.ok) {
      return mapExtractionFailure(base.provider, base.providerVersion, raw);
    }

    const providerVersion = raw.providerVersion;
    const outcome = mapExtractionSuccess(base.provider, providerVersion, raw);
    return outcome;
  } catch (error: unknown) {
    if (error instanceof VisionAIError) {
      if (error.code === "VISION_AI_INVALID_IMAGE") {
        return { ...base, ok: false, reason: "IDENTITY_INVALID_IMAGE" };
      }
      if (error.code === "VISION_AI_PROVIDER_UNAVAILABLE") {
        return { ...base, ok: false, reason: "IDENTITY_PROVIDER_NOT_CONFIGURED" };
      }
      return { ...base, ok: false, reason: "IDENTITY_ANALYSIS_FAILED" };
    }
    return { ...base, ok: false, reason: "IDENTITY_ANALYSIS_FAILED" };
  }
}
