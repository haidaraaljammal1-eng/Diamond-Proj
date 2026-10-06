import { describe, test } from "node:test";
import assert from "node:assert/strict";
import type { DrivingLicenseExtraction } from "@prisma/client";
import {
  mapDrivingLicenseExtractionForPublicContext,
  parseDrivingLicenseFieldsMeta,
} from "src/modules/contracts/public-driving-license-extraction.mapper";

function row(overrides: Partial<DrivingLicenseExtraction> = {}): DrivingLicenseExtraction {
  return {
    id: "ex-1",
    contractId: "c-1",
    documentId: "d-1",
    attachmentId: "a-1",
    status: "READY",
    engineDocumentStatus: "ACCEPT",
    jobId: "job-internal",
    provider: "test",
    providerVersion: "v1",
    licenseNumber: "90527",
    holderNameEn: "TEST DRIVER",
    nationality: "INDIA",
    dateOfBirth: new Date("1990-05-03T12:00:00.000Z"),
    issueDate: new Date("2020-01-01T12:00:00.000Z"),
    expiryDate: new Date("2030-01-01T12:00:00.000Z"),
    placeOfIssue: "DUBAI",
    fieldsMeta: {
      license_number: { status: "ACCEPT", confidence: 0.9, engine: "tesseract" },
    },
    completedAt: new Date(),
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

describe("public-driving-license-extraction.mapper", () => {
  test("maps full ACCEPT extraction with ISO date values", () => {
    const mapped = mapDrivingLicenseExtractionForPublicContext(row());
    assert.ok(mapped);
    assert.equal(mapped!.status, "READY");
    assert.equal(mapped!.engineDocumentStatus, "ACCEPT");
    assert.equal(mapped!.fields.licenseNumber.value, "90527");
    assert.equal(mapped!.fields.licenseNumber.ocrStatus, "ACCEPT");
    assert.equal(mapped!.fields.dateOfBirth.value, "1990-05-03");
    assert.equal(mapped!.fields.expiryDate.value, "2030-01-01");
  });

  test("null row returns null", () => {
    assert.equal(mapDrivingLicenseExtractionForPublicContext(null), null);
  });

  test("PARTIAL extraction preserves per-field metadata", () => {
    const mapped = mapDrivingLicenseExtractionForPublicContext(
      row({
        status: "PARTIAL",
        engineDocumentStatus: "REVIEW_REQUIRED",
        expiryDate: null,
        fieldsMeta: {
          expiry_date: { status: "REJECT", confidence: null, engine: "date_policy" },
          license_number: { status: "ACCEPT", confidence: 0.9 },
        },
      }),
    );
    assert.equal(mapped!.status, "PARTIAL");
    assert.equal(mapped!.fields.expiryDate.value, null);
    assert.equal(mapped!.fields.expiryDate.ocrStatus, "REJECT");
  });

  test("malformed fieldsMeta degrades metadata without throwing", () => {
    const mapped = mapDrivingLicenseExtractionForPublicContext(
      row({ fieldsMeta: { license_number: "not-an-object" } as unknown as DrivingLicenseExtraction["fieldsMeta"] }),
    );
    assert.equal(mapped!.fields.licenseNumber.value, "90527");
    assert.equal(mapped!.fields.licenseNumber.ocrStatus, undefined);
  });

  test("parseDrivingLicenseFieldsMeta rejects invalid shapes", () => {
    assert.equal(parseDrivingLicenseFieldsMeta({ license_number: 1 }), null);
    assert.ok(parseDrivingLicenseFieldsMeta({ license_number: { status: "ACCEPT" } }));
  });

  test("engine ACCEPT with EXPIRED verification scenario represented in extraction row", () => {
    const mapped = mapDrivingLicenseExtractionForPublicContext(
      row({
        engineDocumentStatus: "ACCEPT",
        expiryDate: new Date("2021-09-11T12:00:00.000Z"),
      }),
    );
    assert.equal(mapped!.engineDocumentStatus, "ACCEPT");
    assert.equal(mapped!.fields.expiryDate.value, "2021-09-11");
  });
});
