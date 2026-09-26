import { GoogleGenAI } from "@google/genai";
import {
  GEMINI_CONNECTION_TEST_MARKER,
  GEMINI_CONNECTION_TEST_PROMPT,
} from "src/modules/vision-ai/vision-ai.constants";
import { sanitizeVisionAiErrorMessage } from "src/modules/vision-ai/vision-ai.errors";

export interface GeminiTextGenerateFn {
  (model: string, prompt: string): Promise<string>;
}

export interface GeminiClientOptions {
  apiKey: string;
  model: string;
  generateText?: GeminiTextGenerateFn;
}

export type GeminiConnectionProbeResult =
  | { ok: true; model: string; markerFound: true }
  | { ok: false; kind: "missing_api_key" | "invalid_response" | "provider_error"; message: string };

function defaultGenerateText(apiKey: string): GeminiTextGenerateFn {
  const ai = new GoogleGenAI({ apiKey });
  return async (model, prompt) => {
    const response = await ai.models.generateContent({
      model,
      contents: prompt,
    });
    const text = response.text;
    if (typeof text !== "string" || !text.trim()) {
      throw new Error("Gemini returned an empty text response");
    }
    return text;
  };
}

export async function probeGeminiConnection(
  options: GeminiClientOptions,
): Promise<GeminiConnectionProbeResult> {
  const apiKey = options.apiKey.trim();
  const model = options.model.trim();

  if (!apiKey) {
    return {
      ok: false,
      kind: "missing_api_key",
      message: "GEMINI_API_KEY is missing",
    };
  }

  const generate = options.generateText ?? defaultGenerateText(apiKey);

  try {
    const text = await generate(model, GEMINI_CONNECTION_TEST_PROMPT);
    const markerFound = text.includes(GEMINI_CONNECTION_TEST_MARKER);
    if (!markerFound) {
      return {
        ok: false,
        kind: "invalid_response",
        message: "Gemini response did not include the expected connection marker",
      };
    }
    return { ok: true, model, markerFound: true };
  } catch (error: unknown) {
    const raw = error instanceof Error ? error.message : "Unknown Gemini error";
    return {
      ok: false,
      kind: "provider_error",
      message: sanitizeVisionAiErrorMessage(raw, apiKey),
    };
  }
}
