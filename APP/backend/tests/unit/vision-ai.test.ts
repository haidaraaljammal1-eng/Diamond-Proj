import assert from "node:assert/strict";
import { afterEach, test } from "node:test";
import { env } from "src/config/env";
import { probeGeminiConnection } from "src/modules/vision-ai/gemini/gemini.client";
import { GeminiVisionProvider } from "src/modules/vision-ai/providers/gemini-vision.provider";
import { UnconfiguredVisionAIProvider } from "src/modules/vision-ai/providers/unconfigured-vision-ai.provider";
import { AI_VISION_PROVIDER_IDS } from "src/modules/vision-ai/vision-ai.constants";
import {
  sanitizeVisionAiErrorMessage,
  VisionAINotImplementedError,
} from "src/modules/vision-ai/vision-ai.errors";
import {
  createVisionAIProvider,
  setVisionAIProviderForTests,
} from "src/modules/vision-ai/vision-ai-provider.factory";
import { isGeminiConfigured, geminiRuntimeConfig } from "src/modules/vision-ai/vision-ai.config";
import { GEMINI_CONNECTION_TEST_MARKER } from "src/modules/vision-ai/vision-ai.constants";

afterEach(() => setVisionAIProviderForTests(undefined));

test("AI_VISION_PROVIDER ids are a closed list", () => {
  assert.deepEqual(AI_VISION_PROVIDER_IDS, ["unconfigured", "gemini"]);
});

test("gemini config treats empty API key as not configured", () => {
  assert.equal(isGeminiConfigured({ apiKey: "" }), false);
  assert.equal(isGeminiConfigured({ apiKey: "   " }), false);
  assert.equal(isGeminiConfigured({ apiKey: "test-key" }), true);
});

test("gemini runtime config reads model from env default", () => {
  const cfg = geminiRuntimeConfig({ apiKey: "k", model: "gemini-3.8-flash" });
  assert.equal(cfg.model, "gemini-3.8-flash");
  assert.equal(cfg.apiKey, "k");
});

test("provider factory defaults to unconfigured when env is unconfigured", () => {
  if (env.AI_VISION_PROVIDER !== "unconfigured") return;
  assert.ok(createVisionAIProvider() instanceof UnconfiguredVisionAIProvider);
});

test("unconfigured provider fails connection test safely", async () => {
  const provider = new UnconfiguredVisionAIProvider();
  const result = await provider.runConnectionTest();
  assert.equal(result.ok, false);
  if (result.ok) return;
  assert.equal(result.errorCode, "NOT_CONFIGURED");
  assert.equal(result.message.includes("GEMINI"), false);
});

test("gemini provider reports missing API key without calling the network", async () => {
  const provider = new GeminiVisionProvider({
    apiKey: "",
    model: "gemini-3.8-flash",
    generateText: async () => {
      throw new Error("network should not be called");
    },
  });
  const result = await provider.runConnectionTest();
  assert.equal(result.ok, false);
  if (result.ok) return;
  assert.equal(result.errorCode, "NOT_CONFIGURED");
});

test("gemini probe maps invalid API key to safe provider error", async () => {
  const secret = "AIzaSyInvalidKeyForUnitTestOnly";
  const result = await probeGeminiConnection({
    apiKey: secret,
    model: "gemini-3.8-flash",
    generateText: async () => {
      throw new Error(`API key not valid: ${secret}`);
    },
  });
  assert.equal(result.ok, false);
  if (result.ok) return;
  assert.equal(result.kind, "provider_error");
  assert.equal(result.message.includes(secret), false);
  assert.match(result.message, /REDACTED/);
});

test("gemini probe maps wrong model to provider error", async () => {
  const result = await probeGeminiConnection({
    apiKey: "unit-test-key",
    model: "gemini-does-not-exist",
    generateText: async () => {
      throw new Error("Model gemini-does-not-exist not found");
    },
  });
  assert.equal(result.ok, false);
  if (result.ok) return;
  assert.equal(result.kind, "provider_error");
  assert.match(result.message, /not found/i);
});

test("gemini probe succeeds when marker is present", async () => {
  const result = await probeGeminiConnection({
    apiKey: "unit-test-key",
    model: "gemini-3.8-flash",
    generateText: async () => `prefix ${GEMINI_CONNECTION_TEST_MARKER} suffix`,
  });
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.model, "gemini-3.8-flash");
});

test("sanitizeVisionAiErrorMessage redacts API key substrings", () => {
  const key = "AIzaSyUnitTestKeyMaterial";
  const out = sanitizeVisionAiErrorMessage(`Invalid key ${key}`, key);
  assert.equal(out.includes(key), false);
});

test("vehicle image comparison remains not implemented", async () => {
  const provider = new GeminiVisionProvider({
    apiKey: "k",
    model: "gemini-3.8-flash",
  });
  await assert.rejects(
    () =>
      provider.compareVehicleImages({
        outImage: { bytes: Buffer.from(""), mimeType: "image/png" },
        inImage: { bytes: Buffer.from(""), mimeType: "image/png" },
      }),
    VisionAINotImplementedError,
  );
});
