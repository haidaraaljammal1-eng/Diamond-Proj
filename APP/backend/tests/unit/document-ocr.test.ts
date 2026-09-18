import assert from "node:assert/strict";
import { afterEach, test } from "node:test";
import { env } from "src/config/env";
import { DOCUMENT_OCR_PROVIDER_IDS } from "src/modules/document-ocr/document-ocr.constants";
import {
  createDocumentOcrProvider,
  setDocumentOcrProviderForTests,
} from "src/modules/document-ocr/document-ocr-provider.factory";
import { analyzeDocument } from "src/modules/document-ocr/document-ocr.service";
import { createSimulationDocumentOcrProvider } from "src/modules/document-ocr/simulation-document-ocr.provider";
import type { DocumentOcrProvider } from "src/modules/document-ocr/document-ocr.types";
import { UnconfiguredDocumentOcrProvider } from "src/modules/document-ocr/unconfigured-document-ocr.provider";
import { analyzeDrivingLicenseDocument } from "src/modules/contracts/ocr/driving-license-ocr.adapter";
import { evaluatePassportOcr } from "src/modules/contracts/passport-extraction-policy";
import {
  buildContractIdentityDraft,
  PASSPORT_PROCESSING_STALE_MS,
  toPublicIdentityDraft,
} from "src/modules/contracts/contract-identity-draft";
import {
  createFakeDocumentOcrProvider,
  fakePassportResult,
  SYNTHETIC_PASSPORT,
} from "../helpers/fake-document-ocr-provider";

const FILE = { bytes: Buffer.from([0x89, 0x50, 0x4e, 0x47]), mimeType: "image/png" };

afterEach(() => setDocumentOcrProviderForTests(undefined));

test("DEV OCR provider returns normalized identity through the same analyzer", async () => {
  const provider = createSimulationDocumentOcrProvider();
  const license = await analyzeDocument("DRIVER_LICENSE", FILE, provider);
  const passport = await analyzeDocument("PASSPORT", FILE, provider);
  assert.equal(license.ok, true);
  assert.equal(passport.ok, true);
  if (!license.ok || !passport.ok) return;
  assert.equal(license.provider, "DEV_SIMULATION");
  assert.equal(license.result.driverLicenseNumber, "DXB-DEV-482731");
  assert.equal(license.result.driverLicenseExpiryDate, "2099-12-31");
  assert.equal(passport.result.fullName, "DEMO CUSTOMER");
  assert.equal(passport.result.passportNumber, "P1234567");
  assert.equal(passport.result.nationality, "United Arab Emirates");
});

// ---------------------------------------------------------------- architecture

test("provider factory defaults to UNCONFIGURED", () => {
  assert.equal(env.DOCUMENT_OCR_PROVIDER, "UNCONFIGURED");
  assert.ok(createDocumentOcrProvider() instanceof UnconfiguredDocumentOcrProvider);
});

test("unconfigured provider fails closed for every document type", async () => {
  for (const type of ["PASSPORT", "DRIVER_LICENSE"] as const) {
    const outcome = await analyzeDocument(type, FILE);
    assert.equal(outcome.ok, false);
    assert.equal(!outcome.ok && outcome.reason, "DOCUMENT_OCR_PROVIDER_NOT_CONFIGURED");
    assert.equal("result" in outcome, false);
  }
});

test("test provider cannot be activated in production or via env", () => {
  assert.deepEqual([...DOCUMENT_OCR_PROVIDER_IDS], ["UNCONFIGURED"]);
  const original = env.NODE_ENV;
  const fake = createFakeDocumentOcrProvider();
  try {
    (env as { NODE_ENV: string }).NODE_ENV = "production";
    assert.throws(() => setDocumentOcrProviderForTests(fake.provider));
    assert.ok(createDocumentOcrProvider() instanceof UnconfiguredDocumentOcrProvider);
  } finally {
    (env as { NODE_ENV: string }).NODE_ENV = original;
  }
});

test("vendor-specific fields and payloads never leave the abstraction", async () => {
  const vendor: DocumentOcrProvider = {
    name: "vendor-x",
    capabilities: { supportsDriverLicense: true, supportsPassport: true },
    async analyze() {
      return {
        ok: true,
        documentRecognized: true,
        fields: {
          fullName: "  TEST   PERSON ",
          passportNumber: "TEST123456",
          VendorGivenNames: "SHOULD NOT LEAK",
        } as never,
        fieldConfidence: { fullName: 0.9, VendorGivenNames: 0.5 } as never,
        confidence: 1.7,
        rawVendorResponse: { pages: ["x"] },
      } as never;
    },
  };
  const outcome = await analyzeDocument("PASSPORT", FILE, vendor);
  assert.equal(outcome.ok, true);
  const serialized = JSON.stringify(outcome);
  assert.equal(serialized.includes("VendorGivenNames"), false);
  assert.equal(serialized.includes("rawVendorResponse"), false);
  assert.equal(serialized.includes("SHOULD NOT LEAK"), false);
  assert.ok(outcome.ok);
  assert.equal(outcome.result.fullName, "TEST PERSON");
  assert.equal(outcome.result.confidence, 1);
  assert.deepEqual(outcome.result.fieldConfidence, { fullName: 0.9 });
});

test("normalized result is independent of the provider that produced it", async () => {
  const a = createFakeDocumentOcrProvider().provider;
  const b: DocumentOcrProvider = {
    name: "another-vendor",
    capabilities: { supportsDriverLicense: false, supportsPassport: true },
    async analyze() {
      return fakePassportResult({ ...SYNTHETIC_PASSPORT, sex: "female", dateOfBirth: "not-a-date" });
    },
  };
  const ra = await analyzeDocument("PASSPORT", FILE, a);
  const rb = await analyzeDocument("PASSPORT", FILE, b);
  assert.ok(ra.ok && rb.ok);
  assert.equal(ra.result.fullName, rb.result.fullName);
  assert.equal(ra.result.passportNumber, rb.result.passportNumber);
  assert.equal(rb.result.sex, "F");
  assert.equal(rb.result.dateOfBirth, null);
  assert.deepEqual(Object.keys(ra.result).sort(), Object.keys(rb.result).sort());
  // Capability gate: b does not support licenses.
  const lic = await analyzeDocument("DRIVER_LICENSE", FILE, b);
  assert.equal(!lic.ok && lic.reason, "DOCUMENT_OCR_PROVIDER_NOT_CONFIGURED");
});

test("provider errors are sanitized to a reason code", async () => {
  const throwing: DocumentOcrProvider = {
    name: "boom",
    capabilities: { supportsDriverLicense: true, supportsPassport: true },
    async analyze() {
      throw new Error("secret-endpoint https://vendor.example key=abc123");
    },
  };
  const outcome = await analyzeDocument("PASSPORT", FILE, throwing);
  assert.deepEqual(outcome, {
    ok: false,
    provider: "boom",
    providerVersion: null,
    reason: "DOCUMENT_OCR_FAILED",
  });
});

// ---------------------------------------------------------------- license adapter

test("driving-license adapter maps normalized fields into the existing policy input", async () => {
  const fake = createFakeDocumentOcrProvider();
  fake.setLicense({ licenseNumber: "DL-9", expiryDate: "2031-01-02", confidence: 0.95 });
  setDocumentOcrProviderForTests(fake.provider);
  const result = await analyzeDrivingLicenseDocument(FILE);
  assert.equal(result.ok, true);
  assert.ok(result.ok);
  assert.equal(result.licenseNumber, "DL-9");
  assert.equal(result.expiryDate, "2031-01-02");
  assert.deepEqual(fake.calls, ["DRIVER_LICENSE"]);

  setDocumentOcrProviderForTests(undefined);
  const unconfigured = await analyzeDrivingLicenseDocument(FILE);
  assert.equal(!unconfigured.ok && unconfigured.reason, "NOT_CONFIGURED");
});

// ---------------------------------------------------------------- passport policy

test("passport READY carries normalized fullName, passportNumber, nationality; optional fields null", async () => {
  const outcome = await analyzeDocument("PASSPORT", FILE, createFakeDocumentOcrProvider().provider);
  const evaluated = evaluatePassportOcr(outcome);
  assert.equal(evaluated.status, "READY");
  assert.equal(evaluated.fullName, "TEST PERSON");
  assert.equal(evaluated.passportNumber, "TEST123456");
  assert.equal(evaluated.nationality, "TEST");
  assert.equal(evaluated.dateOfBirth, null);
  assert.equal(evaluated.passportExpiryDate, null);
  assert.equal(evaluated.sex, null);
  assert.equal(evaluated.issuingCountry, null);
});

test("passport failure statuses are provider-neutral", async () => {
  const unconfigured = evaluatePassportOcr(await analyzeDocument("PASSPORT", FILE));
  assert.equal(unconfigured.status, "PROVIDER_UNAVAILABLE");
  assert.equal(unconfigured.fullName, null);

  const unrecognized = createFakeDocumentOcrProvider();
  unrecognized.setPassport(() => ({ ...fakePassportResult(), documentRecognized: false }) as never);
  const notRecognized = evaluatePassportOcr(
    await analyzeDocument("PASSPORT", FILE, unrecognized.provider),
  );
  assert.equal(notRecognized.status, "NOT_RECOGNIZED");
  assert.equal(notRecognized.passportNumber, null);

  const unreadable = createFakeDocumentOcrProvider();
  unreadable.setPassport(() => fakePassportResult({ nationality: "TEST" }));
  const failed = evaluatePassportOcr(await analyzeDocument("PASSPORT", FILE, unreadable.provider));
  assert.equal(failed.status, "FAILED");

  const vendorFailed = evaluatePassportOcr({
    ok: false,
    provider: "t",
    providerVersion: null,
    reason: "DOCUMENT_OCR_NOT_RECOGNIZED",
  });
  assert.equal(vendorFailed.status, "NOT_RECOGNIZED");
});

test("passport date fields are stored as calendar dates", async () => {
  const fake = createFakeDocumentOcrProvider();
  fake.setPassport(() =>
    fakePassportResult({ ...SYNTHETIC_PASSPORT, passportExpiryDate: "2032-03-04", dateOfBirth: "1990-01-31" }),
  );
  const evaluated = evaluatePassportOcr(await analyzeDocument("PASSPORT", FILE, fake.provider));
  assert.equal(evaluated.passportExpiryDate?.toISOString(), "2032-03-04T12:00:00.000Z");
  assert.equal(evaluated.dateOfBirth?.toISOString(), "1990-01-31T12:00:00.000Z");
});

// ---------------------------------------------------------------- identity draft

const now = new Date("2026-09-16T10:00:00.000Z");
const validLicense = {
  status: "VALID" as const,
  licenseNumber: "DL-1",
  expiryDate: new Date("2031-06-01T12:00:00.000Z"),
  updatedAt: now,
};
const readyPassport = {
  status: "READY" as const,
  fullName: "TEST PERSON",
  nationality: "TEST",
  passportNumber: "TEST123456",
  dateOfBirth: null,
  sex: null,
  passportIssueDate: null,
  passportExpiryDate: null,
  issuingCountry: null,
  createdAt: now,
  updatedAt: now,
};

test("identityReady is false initially and with license only", () => {
  assert.equal(buildContractIdentityDraft({ license: null, passport: null, now }).identityReady, false);
  const licenseOnly = buildContractIdentityDraft({ license: validLicense, passport: null, now });
  assert.equal(licenseOnly.identityReady, false);
  assert.equal(licenseOnly.licenseStatus, "LICENSE_VALID");
  assert.equal(licenseOnly.passportStatus, "PASSPORT_REQUIRED");
});

test("valid license + ready passport → identityReady with provenance", () => {
  const draft = buildContractIdentityDraft({ license: validLicense, passport: readyPassport, now });
  assert.equal(draft.identityReady, true);
  assert.deepEqual(draft.fullName, { value: "TEST PERSON", source: "PASSPORT_OCR" });
  assert.deepEqual(draft.driverLicenseNumber, { value: "DL-1", source: "DRIVER_LICENSE_OCR" });
  assert.equal(draft.driverLicenseExpiryDate.value, "2031-06-01");
  const pub = toPublicIdentityDraft(draft);
  assert.equal(JSON.stringify(pub).includes("PASSPORT_OCR"), false);
  assert.equal(pub.passportNumber, "TEST123456");
});

test("retaken invalid license revokes identity readiness and license fields", () => {
  const draft = buildContractIdentityDraft({
    license: { ...validLicense, status: "EXPIRED" },
    passport: readyPassport,
    now,
  });
  assert.equal(draft.identityReady, false);
  assert.equal(draft.licenseStatus, "LICENSE_INVALID");
  assert.equal(draft.driverLicenseNumber.value, null);
});

test("interrupted PROCESSING passport becomes FAILED after the stale window", () => {
  const processing = { ...readyPassport, status: "PROCESSING" as const, fullName: null };
  const fresh = buildContractIdentityDraft({ license: validLicense, passport: processing, now });
  assert.equal(fresh.passportStatus, "PASSPORT_PROCESSING");
  const later = new Date(now.getTime() + PASSPORT_PROCESSING_STALE_MS + 1);
  const stale = buildContractIdentityDraft({ license: validLicense, passport: processing, now: later });
  assert.equal(stale.passportStatus, "PASSPORT_FAILED");
  assert.equal(stale.identityReady, false);
});
