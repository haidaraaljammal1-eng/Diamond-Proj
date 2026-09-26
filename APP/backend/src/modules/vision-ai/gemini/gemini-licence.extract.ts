import {
  GEMINI_LICENCE_DATES_ONLY_JSON_SCHEMA,
  GEMINI_LICENCE_DATES_ONLY_SYSTEM_INSTRUCTION,
  mergeLicenceDateFields,
  parseGeminiLicenceDatesOnlyRaw,
} from "src/modules/vision-ai/extraction/licence-date-gemini.schema";
import {
  GEMINI_LICENCE_JSON_SCHEMA,
  parseGeminiLicenceRaw,
} from "src/modules/vision-ai/extraction/licence-gemini.schema";
import { buildLicenceStructuredResult } from "src/modules/vision-ai/extraction/licence-postprocess";
import { GEMINI_LICENCE_SYSTEM_INSTRUCTION } from "src/modules/vision-ai/vision-ai.constants";
import { VisionAIError } from "src/modules/vision-ai/vision-ai.errors";
import {
  geminiGenerateStructuredJson,
  type GeminiStructuredGenerateFn,
} from "src/modules/vision-ai/gemini/gemini-structured.client";
import type { VisionExtractionResult, VisionImageInput } from "src/modules/vision-ai/vision-ai.types";
import { assertVisionAiImageInput } from "src/modules/vision-ai/vision-ai-image";

function licenceDatesIncomplete(visual: ReturnType<typeof parseGeminiLicenceRaw>): boolean {
  return !visual.dateOfBirth || !visual.issueDate || !visual.expiryDate;
}

export async function geminiExtractDrivingLicence(
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
        systemInstruction: GEMINI_LICENCE_SYSTEM_INSTRUCTION,
        responseJsonSchema: GEMINI_LICENCE_JSON_SCHEMA,
        mimeType: input.mimeType,
        imageBytes: input.bytes,
        userPrompt: "Extract driving licence fields from this image.",
      },
      options.generateFn,
    );
    let visual = parseGeminiLicenceRaw(raw);

    if (licenceDatesIncomplete(visual)) {
      const dateRaw = await geminiGenerateStructuredJson(
        {
          apiKey: options.apiKey,
          model: options.model,
          systemInstruction: GEMINI_LICENCE_DATES_ONLY_SYSTEM_INSTRUCTION,
          responseJsonSchema: GEMINI_LICENCE_DATES_ONLY_JSON_SCHEMA,
          mimeType: input.mimeType,
          imageBytes: input.bytes,
          userPrompt: "Read Date of Birth, Issue Date, and Expiry Date from this driving licence image.",
        },
        options.generateFn,
      );
      const dateFields = parseGeminiLicenceDatesOnlyRaw(dateRaw, {
        issuingCountry: visual.issuingCountry,
        nationality: visual.nationality,
      });
      visual = mergeLicenceDateFields(visual, dateFields);
    }

    return {
      ok: true,
      providerVersion: options.model,
      extraction: buildLicenceStructuredResult(visual),
    };
  } catch (error: unknown) {
    if (error instanceof VisionAIError) {
      return { ok: false, code: error.code, message: error.message };
    }
    return { ok: false, code: "VISION_AI_SCHEMA_INVALID", message: "Licence schema validation failed" };
  }
}
