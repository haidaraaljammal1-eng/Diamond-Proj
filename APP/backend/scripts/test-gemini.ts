/**
 * Gemini connectivity diagnostic (server-only, manual).
 *
 * Uses the Vision AI provider boundary — no images, no customer data, no DB writes.
 * Never hardcodes or logs secrets. Not exposed through any API route.
 *
 * Run: npm run test:gemini
 */
import dotenv from "dotenv";
import path from "node:path";

dotenv.config({ path: path.resolve(__dirname, "../.env") });

function fail(message: string): never {
  console.error(message);
  process.exit(1);
}

async function main(): Promise<void> {
  const { env } = await import("src/config/env");
  const { createVisionAIProvider } = await import(
    "src/modules/vision-ai/vision-ai-provider.factory"
  );

  if (env.AI_VISION_PROVIDER !== "gemini") {
    fail("Gemini test aborted: set AI_VISION_PROVIDER=gemini in APP/backend/.env");
  }

  const keyConfigured = env.GEMINI_API_KEY.trim().length > 0;
  if (!keyConfigured) {
    fail("Gemini test aborted: GEMINI_API_KEY is missing in APP/backend/.env");
  }

  const provider = createVisionAIProvider();

  console.log(`AI vision provider: ${env.AI_VISION_PROVIDER}`);
  console.log(`Runtime adapter: ${provider.name}`);
  console.log(`Configured: ${provider.configured ? "yes" : "no"}`);
  console.log(`GEMINI_API_KEY: configured`);
  console.log(`Model (from env): ${env.GEMINI_MODEL}`);

  const result = await provider.runConnectionTest();

  if (result.ok) {
    console.log(`Gemini connection: success`);
    console.log(`Expected marker received: yes`);
    console.log(`Model used: ${result.model}`);
    return;
  }

  console.error(`Gemini connection: failed`);
  console.error(`Error code: ${result.errorCode}`);
  console.error(`Message: ${result.message}`);

  if (result.errorCode === "NOT_CONFIGURED") {
    fail("Gemini test aborted: set AI_VISION_PROVIDER=gemini and GEMINI_API_KEY in APP/backend/.env");
  }
  process.exit(1);
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : "Unknown error";
  console.error(`Gemini test failed: ${message}`);
  process.exit(1);
});
