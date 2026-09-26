import { env } from "src/config/env";

export function isGeminiConfigured(
  input: { apiKey?: string } = { apiKey: env.GEMINI_API_KEY },
): boolean {
  return (input.apiKey ?? "").trim().length > 0;
}

/** Server-only Gemini runtime settings. Model id stays inside the provider layer. */
export function geminiRuntimeConfig(
  input: { apiKey?: string; model?: string } = {},
): { apiKey: string; model: string } {
  return {
    apiKey: (input.apiKey ?? env.GEMINI_API_KEY).trim(),
    model: (input.model ?? env.GEMINI_MODEL).trim(),
  };
}
