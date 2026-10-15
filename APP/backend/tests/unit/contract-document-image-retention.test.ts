import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  attachmentReferenceTotal,
  countAttachmentReferences,
} from "src/modules/contracts/contract-document-image-retention";

describe("contract-document-image-retention", () => {
  it("attachmentReferenceTotal sums all relation buckets", () => {
    const total = attachmentReferenceTotal({
      contractDocuments: 1,
      customerDocuments: 0,
      vehiclePhotos: 0,
      contractCarOutPhotos: 0,
      contractCarOutDraftPhotos: 0,
      contractCarInPhotos: 0,
      contractCarInDraftPhotos: 0,
      contractSignatures: 0,
      officialContractSignatures: 0,
      manualExpenses: 0,
      tarsUploads: 0,
      carOutHirerSignatures: 0,
      carOutDraftHirerSignatures: 0,
      carInDraftHirerSignatures: 0,
    });
    assert.equal(total, 1);
  });

  it("exports countAttachmentReferences for files service safety checks", () => {
    assert.equal(typeof countAttachmentReferences, "function");
  });
});
