import { VISION_AI_NOT_IMPLEMENTED_CODE } from "src/modules/vision-ai/vision-ai.constants";

export type VisionAIErrorCode =
  | "VISION_AI_INVALID_IMAGE"
  | "VISION_AI_EXTRACTION_FAILED"
  | "VISION_AI_SCHEMA_INVALID"
  | "VISION_AI_PROVIDER_UNAVAILABLE";

export class VisionAIError extends Error {
  readonly code: VisionAIErrorCode;

  constructor(code: VisionAIErrorCode, message: string) {
    super(message);
    this.name = "VisionAIError";
    this.code = code;
  }
}

export class VisionAINotImplementedError extends Error {
  readonly code = VISION_AI_NOT_IMPLEMENTED_CODE;

  constructor() {
    super("Vision AI capability is not implemented yet");
    this.name = "VisionAINotImplementedError";
  }
}

const API_KEY_LIKE = /AIza[0-9A-Za-z_-]{10,}/g;
const BEARER = /Bearer\s+\S+/gi;
const AQ_KEY_LIKE = /AQ\.[0-9A-Za-z_-]{10,}/g;

/** Strip secrets from provider error text before logs or CLI output. */
export function sanitizeVisionAiErrorMessage(message: string, apiKey?: string): string {
  let out = message;
  const key = apiKey?.trim();
  if (key && key.length > 4) {
    out = out.split(key).join("[REDACTED]");
  }
  out = out
    .replace(API_KEY_LIKE, "[REDACTED]")
    .replace(AQ_KEY_LIKE, "[REDACTED]")
    .replace(BEARER, "Bearer [REDACTED]");
  return out.length > 500 ? `${out.slice(0, 500)}…` : out;
}
