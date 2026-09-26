import assert from "node:assert/strict";
import { afterEach, test } from "node:test";
import { env } from "src/config/env";
import { analyzeDrivingLicenseDocument } from "src/modules/contracts/ocr/driving-license-ocr.adapter";
import { evaluatePassportOcr } from "src/modules/contracts/passport-extraction-policy";
import { buildPassportStructuredResult } from "src/modules/vision-ai/extraction/passport-postprocess";
import { analyzeIdentityDocument } from "src/modules/vision-ai/identity-analysis.service";
import { geminiExtractDrivingLicence } from "src/modules/vision-ai/gemini/gemini-licence.extract";
import { GeminiVisionProvider } from "src/modules/vision-ai/providers/gemini-vision.provider";
import { createSimulationVisionAIProvider } from "src/modules/vision-ai/providers/simulation-vision-ai.provider";
import { UnconfiguredVisionAIProvider } from "src/modules/vision-ai/providers/unconfigured-vision-ai.provider";
import {
  createVisionAIProvider,
  setVisionAIProviderForTests,
} from "src/modules/vision-ai/vision-ai-provider.factory";
import {
  createFakeVisionAIProvider,
  fakePassportExtraction,
  fakeUnrecognizedPassportExtraction,
} from "../helpers/fake-vision-ai-provider";

const FILE = { bytes: Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), mimeType: "image/png" };

afterEach(() => setVisionAIProviderForTests(undefined));

test("simulation provider returns normalized identity through analyzer", async () => {
  const provider = createSimulationVisionAIProvider();
  const license = await analyzeIdentityDocument("DRIVER_LICENSE", FILE, provider);
  const passport = await analyzeIdentityDocument("PASSPORT", FILE, provider);
  assert.equal(license.ok, true);
  assert.equal(passport.ok, true);
  if (!license.ok || !passport.ok) return;
  assert.equal(license.provider, "DEV_SIMULATION");
  assert.equal(license.result.driverLicenseNumber, "DXB-DEV-482731");
  assert.equal(passport.result.fullName, "DEMO CUSTOMER");
});

test("provider factory defaults to unconfigured", () => {
  if (env.AI_VISION_PROVIDER !== "unconfigured") return;
  assert.ok(createVisionAIProvider() instanceof UnconfiguredVisionAIProvider);
});

test("unconfigured provider fails closed", async () => {
  const outcome = await analyzeIdentityDocument("PASSPORT", FILE, new UnconfiguredVisionAIProvider());
  assert.equal(outcome.ok, false);
  if (outcome.ok) return;
  assert.equal(outcome.reason, "IDENTITY_PROVIDER_NOT_CONFIGURED");
});

test("passport MRZ visual mismatch marks review required", () => {
  const structured = buildPassportStructuredResult({
    firstName: "ANNA",
    lastName: "ERIKSSON",
    fullName: "ANNA ERIKSSON",
    passportNumber: "WRONG0001",
    nationality: "UTO",
    dateOfBirth: "1974-08-12",
    expiryDate: "2012-04-15",
    sex: "F",
    issuingCountry: "UTO",
    mrzLine1: "P<UTOERIKSSON<<ANNA<MARIA<<<<<<<<<<<<<<<<<<<",
    mrzLine2: "L898902C<3UTO7408122F1204159ZE184226B<<<<<10",
  });
  assert.equal(structured.fields.passportNumber?.status, "REVIEW_REQUIRED");
  assert.equal(structured.requiresReview, true);
});

test("passport policy maps provider unavailable", () => {
  const evaluated = evaluatePassportOcr({
    ok: false,
    provider: "unconfigured",
    providerVersion: null,
    reason: "IDENTITY_PROVIDER_NOT_CONFIGURED",
  });
  assert.equal(evaluated.status, "PROVIDER_UNAVAILABLE");
});

test("passport policy maps unrecognized extraction", () => {
  const evaluated = evaluatePassportOcr({
    ok: false,
    provider: "test",
    providerVersion: null,
    reason: "IDENTITY_NOT_RECOGNIZED",
  });
  assert.equal(evaluated.status, "NOT_RECOGNIZED");
});

test("injected fake provider is used for passport and license", async () => {
  const fake = createFakeVisionAIProvider();
  setVisionAIProviderForTests(fake.provider);
  assert.equal((await analyzeIdentityDocument("PASSPORT", FILE)).provider, "test");
  assert.equal((await analyzeDrivingLicenseDocument(FILE)).provider, "test");
  assert.deepEqual(fake.calls, ["PASSPORT", "DRIVER_LICENSE"]);
});

test("gemini licence pipeline normalizes slash-separated printed dates", async () => {
  const result = await geminiExtractDrivingLicence(FILE, {
    apiKey: "unit-test-key",
    model: "gemini-3.8-flash",
    generateFn: async () => ({
      fullName: "TEST DRIVER",
      licenceNumber: "1893918",
      issuingCountry: "United Arab Emirates",
      nationality: "Philippines",
      dateOfBirth: "04/05/1980",
      issueDate: "13/04/2013",
      expiryDate: "13/04/2023",
    }),
  });
  assert.equal(result.ok, true);
  if (!result.ok) return;
  const fields = result.extraction.fields;
  assert.equal(fields.dateOfBirth?.value, "1980-05-04");
  assert.equal(fields.issueDate?.value, "2013-04-13");
  assert.equal(fields.expiryDate?.value, "2023-04-13");
  assert.equal(fields.dateOfBirth?.status, "CANDIDATE");
});

test("gemini licence two-pass fills dates when pass one omits them", async () => {
  let calls = 0;
  const result = await geminiExtractDrivingLicence(FILE, {
    apiKey: "unit-test-key",
    model: "gemini-3.8-flash",
    generateFn: async () => {
      calls++;
      if (calls === 1) {
        return {
          fullName: "TEST DRIVER",
          licenceNumber: "1234567890",
          issuingCountry: "UNITED ARAB EMIRATES",
        };
      }
      return {
        dateOfBirth: "01/01/1990",
        issueDate: "15/05/2023",
        expiryDate: "14/05/2033",
      };
    },
  });
  assert.equal(calls, 2);
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.extraction.fields.expiryDate?.value, "2033-05-14");
});

test("malformed gemini passport schema maps to analysis failure", async () => {
  const provider = new GeminiVisionProvider({
    apiKey: "unit-test-key",
    model: "gemini-3.8-flash",
    generateStructured: async () => ({ passportNumber: 12345 }),
  });
  const outcome = await provider.extractPassport(FILE);
  assert.equal(outcome.ok, false);
  if (outcome.ok) return;
  assert.equal(outcome.code, "VISION_AI_SCHEMA_INVALID");
});

test("gemini missing key returns provider unavailable", async () => {
  const provider = new GeminiVisionProvider({ apiKey: "", model: "gemini-3.8-flash" });
  const outcome = await provider.extractPassport(FILE);
  assert.equal(outcome.ok, false);
});

test("fake passport without identity fields fails policy", async () => {
  const fake = createFakeVisionAIProvider();
  fake.setPassport(() => fakeUnrecognizedPassportExtraction());
  const evaluated = evaluatePassportOcr(
    await analyzeIdentityDocument("PASSPORT", FILE, fake.provider),
  );
  assert.equal(evaluated.status, "NOT_RECOGNIZED");
});

test("fake passport with only nationality fails readiness", async () => {
  const fake = createFakeVisionAIProvider();
  fake.setPassport(() => fakeUnrecognizedPassportExtraction());
  const evaluated = evaluatePassportOcr(
    await analyzeIdentityDocument("PASSPORT", FILE, fake.provider),
  );
  assert.equal(evaluated.status, "NOT_RECOGNIZED");
});
