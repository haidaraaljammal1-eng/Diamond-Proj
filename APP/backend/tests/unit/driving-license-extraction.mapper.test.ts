import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { buildDrivingLicenseExtractionCreateData } from "src/modules/contracts/driving-license-extraction.mapper";
import { formatStoredExpiry } from "src/modules/contracts/driving-license-policy";

describe("driving-license-extraction.mapper", () => {
  test("maps ISO dates to UTC noon storage", () => {
    const data = buildDrivingLicenseExtractionCreateData({
      contractId: "c1",
      documentId: "d1",
      attachmentId: "a1",
      ocr: {
        ok: true,
        licenseNumber: "90527",
        expiryDate: "2030-01-01",
        holderName: "TEST DRIVER",
        confidence: 0.9,
        provider: "test",
        extraction: {
          documentStatus: "ACCEPT",
          dateOfBirth: "1990-05-03",
          issueDate: "2020-01-01",
          nationality: "INDIA",
          placeOfIssue: "HAB",
        },
      },
    });
    assert.equal(formatStoredExpiry(data.expiryDate as Date), "2030-01-01");
    assert.equal(data.dateOfBirth, null);
    assert.equal(data.issueDate, null);
    assert.equal(data.status, "READY");
    assert.equal(data.engineDocumentStatus, "ACCEPT");
    assert.equal(data.placeOfIssue, null);
  });

  test("REJECT document maps to FAILED extraction status", () => {
    const data = buildDrivingLicenseExtractionCreateData({
      contractId: "c1",
      documentId: "d1",
      attachmentId: "a1",
      ocr: {
        ok: true,
        licenseNumber: "90527",
        expiryDate: null,
        confidence: 0.5,
        provider: "test",
        extraction: { documentStatus: "REJECT" },
      },
    });
    assert.equal(data.status, "FAILED");
    assert.equal(data.expiryDate, null);
  });
});
