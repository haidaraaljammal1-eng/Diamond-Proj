import { GoogleGenAI } from "@google/genai";
import { VisionAIError } from "src/modules/vision-ai/vision-ai.errors";
import { sanitizeVisionAiErrorMessage } from "src/modules/vision-ai/vision-ai.errors";

export interface GeminiStructuredRequest {
  apiKey: string;
  model: string;
  systemInstruction: string;
  responseJsonSchema: Record<string, unknown>;
  mimeType: string;
  imageBytes: Buffer;
  userPrompt: string;
}

export type GeminiStructuredGenerateFn = (
  request: GeminiStructuredRequest,
) => Promise<unknown>;

function defaultGenerate(request: GeminiStructuredRequest): Promise<unknown> {
  const ai = new GoogleGenAI({ apiKey: request.apiKey });
  return ai.models
    .generateContent({
      model: request.model,
      contents: [
        {
          role: "user",
          parts: [
            { text: request.userPrompt },
            {
              inlineData: {
                mimeType: request.mimeType,
                data: request.imageBytes.toString("base64"),
              },
            },
          ],
        },
      ],
      config: {
        systemInstruction: request.systemInstruction,
        responseMimeType: "application/json",
        responseJsonSchema: request.responseJsonSchema,
      },
    })
    .then((response) => {
      const text = response.text;
      if (!text?.trim()) {
        throw new VisionAIError("VISION_AI_EXTRACTION_FAILED", "Gemini returned an empty response");
      }
      try {
        return JSON.parse(text) as unknown;
      } catch {
        throw new VisionAIError("VISION_AI_SCHEMA_INVALID", "Gemini response was not valid JSON");
      }
    });
}

export async function geminiGenerateStructuredJson(
  request: GeminiStructuredRequest,
  generateFn?: GeminiStructuredGenerateFn,
): Promise<unknown> {
  const generate = generateFn ?? defaultGenerate;
  try {
    return await generate(request);
  } catch (error: unknown) {
    if (error instanceof VisionAIError) throw error;
    const raw = error instanceof Error ? error.message : "Unknown Gemini error";
    throw new VisionAIError(
      "VISION_AI_EXTRACTION_FAILED",
      sanitizeVisionAiErrorMessage(raw, request.apiKey),
    );
  }
}
