import { env } from "src/config/env";
import { GeminiVisionProvider } from "src/modules/vision-ai/providers/gemini-vision.provider";
import { UnconfiguredVisionAIProvider } from "src/modules/vision-ai/providers/unconfigured-vision-ai.provider";
import type { VisionAIProvider } from "src/modules/vision-ai/vision-ai.types";

let testProvider: VisionAIProvider | undefined;

/**
 * Automated-test injection only. Refused in production so a fake provider can
 * never become the runtime Vision AI authority.
 */
export function setVisionAIProviderForTests(provider: VisionAIProvider | undefined): void {
  if (env.NODE_ENV === "production") {
    throw new Error("Vision AI test provider cannot be injected in production");
  }
  testProvider = provider;
}

/** The only place a runtime Vision AI provider is selected. */
export function createVisionAIProvider(): VisionAIProvider {
  if (testProvider && env.NODE_ENV !== "production") return testProvider;
  switch (env.AI_VISION_PROVIDER) {
    case "gemini":
      return new GeminiVisionProvider();
    case "unconfigured":
    default:
      return new UnconfiguredVisionAIProvider();
  }
}
