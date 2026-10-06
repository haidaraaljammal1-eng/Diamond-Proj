import type { VisionAIConnectionErrorCode } from "src/modules/vision-ai/vision-ai.constants";
import type { VisionStructuredDocumentResult } from "src/modules/vision-ai/identity-document.types";

export type VisionAIConnectionTestResult =
  | { ok: true; model: string; markerFound: true }
  | { ok: false; errorCode: VisionAIConnectionErrorCode; message: string };

export interface VisionImageInput {
  bytes: Buffer;
  mimeType: string;
}

export interface VehicleImageCompareInput {
  outImage: VisionImageInput;
  inImage: VisionImageInput;
  angle?: string;
}

export type VisionExtractionResult =
  | {
      ok: true;
      providerVersion: string | null;
      extraction: VisionStructuredDocumentResult;
    }
  | {
      ok: false;
      code:
        | "VISION_AI_INVALID_IMAGE"
        | "VISION_AI_EXTRACTION_FAILED"
        | "VISION_AI_SCHEMA_INVALID"
        | "VISION_AI_PROVIDER_UNAVAILABLE";
      message: string;
    };

/**
 * Vendor-neutral Vision AI boundary (passport, licence, vehicle imagery).
 * Business modules must depend on this interface — never on Gemini SDK types.
 */
export interface VisionAIProvider {
  readonly name: string;
  readonly configured: boolean;

  runConnectionTest(): Promise<VisionAIConnectionTestResult>;
  extractPassport(input: VisionImageInput): Promise<VisionExtractionResult>;
  extractDrivingLicence(input: VisionImageInput): Promise<VisionExtractionResult>;
  compareVehicleImages(input: VehicleImageCompareInput): Promise<never>;
}
