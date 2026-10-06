import {
  GEMINI_PASSPORT_JSON_SCHEMA,
  parseGeminiPassportRaw,
} from "src/modules/vision-ai/extraction/passport-gemini.schema";
import { buildPassportStructuredResult } from "src/modules/vision-ai/extraction/passport-postprocess";
import { GEMINI_PASSPORT_SYSTEM_INSTRUCTION } from "src/modules/vision-ai/vision-ai.constants";
import { VisionAIError } from "src/modules/vision-ai/vision-ai.errors";
import {
  geminiGenerateStructuredJson,
  type GeminiStructuredGenerateFn,
} from "src/modules/vision-ai/gemini/gemini-structured.client";
import type { VisionExtractionResult, VisionImageInput } from "src/modules/vision-ai/vision-ai.types";
import { assertVisionAiImageInput } from "src/modules/vision-ai/vision-ai-image";

export async function geminiExtractPassport(
  input: VisionImageInput,
  options: { apiKey: string; model: string; generateFn?: GeminiStructuredGenerateFn },
): Promise<VisionExtractionResult> {
  try {
    assertVisionAiImageInput(input.bytes, input.mimeType);
  } catch (error: unknown) {
    if (error instanceof VisionAIError) {
      return { ok: false, code: error.code, message: error.message };
    }
    return { ok: false, code: "VISION_AI_INVALID_IMAGE", message: "Invalid image" };
  }

  try {
    const raw = await geminiGenerateStructuredJson(
      {
        apiKey: options.apiKey,
        model: options.model,
        systemInstruction: GEMINI_PASSPORT_SYSTEM_INSTRUCTION,
        responseJsonSchema: GEMINI_PASSPORT_JSON_SCHEMA,
        mimeType: input.mimeType,
        imageBytes: input.bytes,
        userPrompt: "Extract passport data page fields from this image.",
      },
      options.generateFn,
    );
    const visual = parseGeminiPassportRaw(raw);
    return {
      ok: true,
      providerVersion: options.model,
      extraction: buildPassportStructuredResult(visual),
    };
  } catch (error: unknown) {
    if (error instanceof VisionAIError) {
      return { ok: false, code: error.code, message: error.message };
    }
    return { ok: false, code: "VISION_AI_SCHEMA_INVALID", message: "Passport schema validation failed" };
  }
}
