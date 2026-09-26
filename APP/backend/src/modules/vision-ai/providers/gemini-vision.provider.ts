import { env } from "src/config/env";
import { geminiExtractDrivingLicence } from "src/modules/vision-ai/gemini/gemini-licence.extract";
import { geminiExtractPassport } from "src/modules/vision-ai/gemini/gemini-passport.extract";
import { probeGeminiConnection, type GeminiTextGenerateFn } from "src/modules/vision-ai/gemini/gemini.client";
import type { GeminiStructuredGenerateFn } from "src/modules/vision-ai/gemini/gemini-structured.client";
import { geminiRuntimeConfig, isGeminiConfigured } from "src/modules/vision-ai/vision-ai.config";
import { visionAiNotImplemented } from "src/modules/vision-ai/vision-ai-not-implemented";
import type {
  VehicleImageCompareInput,
  VisionAIConnectionTestResult,
  VisionAIProvider,
  VisionExtractionResult,
  VisionImageInput,
} from "src/modules/vision-ai/vision-ai.types";

export interface GeminiVisionProviderDeps {
  apiKey?: string;
  model?: string;
  generateText?: GeminiTextGenerateFn;
  generateStructured?: GeminiStructuredGenerateFn;
  /** @deprecated alias for generateStructured */
  generateStructuredJson?: GeminiStructuredGenerateFn;
}

export class GeminiVisionProvider implements VisionAIProvider {
  readonly name = "gemini";
  readonly configured: boolean;
  private readonly apiKey: string;
  private readonly model: string;
  private readonly generateText?: GeminiTextGenerateFn;
  private readonly generateStructured?: GeminiStructuredGenerateFn;

  constructor(deps: GeminiVisionProviderDeps = {}) {
    const runtime = geminiRuntimeConfig({ apiKey: deps.apiKey, model: deps.model });
    this.apiKey = runtime.apiKey;
    this.model = runtime.model;
    this.generateText = deps.generateText;
    this.generateStructured = deps.generateStructured ?? deps.generateStructuredJson;
    this.configured = env.AI_VISION_PROVIDER === "gemini" && isGeminiConfigured({ apiKey: this.apiKey });
  }

  async runConnectionTest(): Promise<VisionAIConnectionTestResult> {
    const probe = await probeGeminiConnection({
      apiKey: this.apiKey,
      model: this.model,
      generateText: this.generateText,
    });

    if (probe.ok) {
      return { ok: true, model: probe.model, markerFound: true };
    }

    if (probe.kind === "missing_api_key") {
      return { ok: false, errorCode: "NOT_CONFIGURED", message: probe.message };
    }
    if (probe.kind === "invalid_response") {
      return { ok: false, errorCode: "INVALID_RESPONSE", message: probe.message };
    }
    return { ok: false, errorCode: "PROVIDER_ERROR", message: probe.message };
  }

  async extractPassport(input: VisionImageInput): Promise<VisionExtractionResult> {
    if (!this.configured) {
      return {
        ok: false,
        code: "VISION_AI_PROVIDER_UNAVAILABLE",
        message: "Gemini Vision AI is not configured",
      };
    }
    return geminiExtractPassport(input, {
      apiKey: this.apiKey,
      model: this.model,
      generateFn: this.generateStructured,
    });
  }

  async extractDrivingLicence(input: VisionImageInput): Promise<VisionExtractionResult> {
    if (!this.configured) {
      return {
        ok: false,
        code: "VISION_AI_PROVIDER_UNAVAILABLE",
        message: "Gemini Vision AI is not configured",
      };
    }
    return geminiExtractDrivingLicence(input, {
      apiKey: this.apiKey,
      model: this.model,
      generateFn: this.generateStructured,
    });
  }

  async compareVehicleImages(_input: VehicleImageCompareInput): Promise<never> {
    return visionAiNotImplemented();
  }
}
