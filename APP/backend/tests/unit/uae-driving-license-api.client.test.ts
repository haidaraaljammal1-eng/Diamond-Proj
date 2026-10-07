import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import {
  extractDrivingLicenseFromImage,
  setUaeDrivingLicenseApiClientForTests,
} from "src/modules/document-engine/uae-driving-license-api.client";
import { setDrivingLicenseDocumentAnalysisForTests } from "src/modules/contracts/ocr/driving-license-ocr.adapter";
import { analyzeDrivingLicenseDocument } from "src/modules/contracts/ocr/driving-license-ocr.adapter";
import { createFakeUaeDrivingLicenseApi } from "../helpers/fake-uae-driving-license-api";

const FILE = { bytes: Buffer.from([0xff, 0xd8, 0xff, 0x00]), mimeType: "image/jpeg" };

afterEach(() => {
  setUaeDrivingLicenseApiClientForTests(undefined);
  setDrivingLicenseDocumentAnalysisForTests(undefined);
});

describe("uae-driving-license-api.client", () => {
  it("parses ACCEPT business body via test hook", async () => {
    const fake = createFakeUaeDrivingLicenseApi();
    await fake.install();
    const outcome = await extractDrivingLicenseFromImage(FILE);
    assert.equal(outcome.kind, "business");
    if (outcome.kind === "business") {
      assert.equal(outcome.body.document_status, "ACCEPT");
      assert.equal(outcome.body.fields.license_number?.value, "90527");
    }
  });

  it("maps timeout to LICENSE_OCR_TIMEOUT", async () => {
    setUaeDrivingLicenseApiClientForTests({
      extract: async () => ({
        kind: "error",
        code: "LICENSE_OCR_TIMEOUT",
        provider: "test",
        providerVersion: "test",
      }),
    });
    const outcome = await extractDrivingLicenseFromImage(FILE);
    assert.equal(outcome.kind, "error");
    if (outcome.kind === "error") assert.equal(outcome.code, "LICENSE_OCR_TIMEOUT");
  });

  it("maps invalid response to LICENSE_OCR_INVALID_RESPONSE", async () => {
    setUaeDrivingLicenseApiClientForTests({
      extract: async () => ({
        kind: "error",
        code: "LICENSE_OCR_INVALID_RESPONSE",
        provider: "test",
        providerVersion: "test",
      }),
    });
    const outcome = await extractDrivingLicenseFromImage(FILE);
    assert.equal(outcome.kind, "error");
    if (outcome.kind === "error") {
      assert.equal(outcome.code, "LICENSE_OCR_INVALID_RESPONSE");
    }
  });
});

describe("driving-license-ocr.adapter bridge", () => {
  it("maps ACCEPT to policy fields and ISO expiry", async () => {
    const fake = createFakeUaeDrivingLicenseApi();
    await fake.install();
    setDrivingLicenseDocumentAnalysisForTests(undefined);
    const result = await analyzeDrivingLicenseDocument(FILE);
    assert.equal(result.ok, true);
    if (!result.ok) return;
    assert.equal(result.licenseNumber, "90527");
    assert.equal(result.expiryDate, "2030-01-01");
    assert.equal(result.extraction?.documentStatus, "ACCEPT");
    assert.equal(result.extraction?.nameEn, null);
  });

  it("preserves REVIEW_REQUIRED document status with partial fields", async () => {
    const fake = createFakeUaeDrivingLicenseApi();
    fake.setReviewRequired();
    await fake.install();
    setDrivingLicenseDocumentAnalysisForTests(undefined);
    const result = await analyzeDrivingLicenseDocument(FILE);
    assert.equal(result.ok, true);
    if (!result.ok) return;
    assert.equal(result.licenseNumber, "90527");
    assert.equal(result.expiryDate, null);
    assert.equal(result.extraction?.documentStatus, "REVIEW_REQUIRED");
  });

  it("maps unavailable to PROVIDER_UNAVAILABLE failure", async () => {
    const fake = createFakeUaeDrivingLicenseApi();
    fake.setError("LICENSE_OCR_UNAVAILABLE");
    await fake.install();
    setDrivingLicenseDocumentAnalysisForTests(undefined);
    const result = await analyzeDrivingLicenseDocument(FILE);
    assert.equal(result.ok, false);
    if (result.ok) return;
    assert.equal(result.reason, "PROVIDER_UNAVAILABLE");
  });

  it("maps crop failure to BAD_FRAME (geometry, not OCR unreadable)", async () => {
    const fake = createFakeUaeDrivingLicenseApi();
    fake.setError("LICENSE_OCR_CROP_FAILED");
    await fake.install();
    setDrivingLicenseDocumentAnalysisForTests(undefined);
    const result = await analyzeDrivingLicenseDocument(FILE);
    assert.equal(result.ok, false);
    if (result.ok) return;
    assert.equal(result.reason, "BAD_FRAME");
  });
});
