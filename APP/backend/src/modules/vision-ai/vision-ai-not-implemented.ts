import { VisionAINotImplementedError } from "src/modules/vision-ai/vision-ai.errors";

export function visionAiNotImplemented(): never {
  throw new VisionAINotImplementedError();
}
