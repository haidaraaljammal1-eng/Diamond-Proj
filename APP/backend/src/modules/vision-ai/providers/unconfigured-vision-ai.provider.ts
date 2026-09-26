import { visionAiNotImplemented } from "src/modules/vision-ai/vision-ai-not-implemented";
import type {
  VehicleImageCompareInput,
  VisionAIConnectionTestResult,
  VisionAIProvider,
  VisionExtractionResult,
  VisionImageInput,
} from "src/modules/vision-ai/vision-ai.types";

export class UnconfiguredVisionAIProvider implements VisionAIProvider {
  readonly name = "unconfigured";
  readonly configured = false;

  async runConnectionTest(): Promise<VisionAIConnectionTestResult> {
    return {
      ok: false,
      errorCode: "NOT_CONFIGURED",
      message: "Vision AI provider is not configured",
    };
  }

  async extractPassport(_input: VisionImageInput): Promise<VisionExtractionResult> {
    return {
      ok: false,
      code: "VISION_AI_PROVIDER_UNAVAILABLE",
      message: "Vision AI provider is not configured",
    };
  }

  async extractDrivingLicence(_input: VisionImageInput): Promise<VisionExtractionResult> {
    return {
      ok: false,
      code: "VISION_AI_PROVIDER_UNAVAILABLE",
      message: "Vision AI provider is not configured",
    };
  }

  async compareVehicleImages(_input: VehicleImageCompareInput): Promise<never> {
    return visionAiNotImplemented();
  }
}
