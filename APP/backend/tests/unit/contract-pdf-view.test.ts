import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  buildContractPdfOfficialView,
  contractPdfFilename,
} from "src/modules/contracts/contract-pdf-view";
import type { ContractDetail, OfficialContractView } from "src/modules/contracts/contracts.schema";

function minimalDraft(): OfficialContractView {
  return {
    templateVersion: "DIAMOND_CONTRACT_V1",
    header: {
      officeDisplayName: "Diamond",
      company: {
        code: "ELITE",
        displayName: "Diamond Elite",
        legalNameAr: "دايموند",
        legalNameEn: "Diamond Elite",
        accentColor: "#c9a227",
      },
    },
    contract: {
      agreementNumber: "DE-2026-000001",
      status: "FORM",
      plateCode: "A",
      plateNumber: "12345",
      vehicleType: "SUV",
      yearMade: 2024,
      color: "Black",
      notes: null,
      hirer: {
        name: null,
        nationality: null,
        passportNumber: null,
        address: null,
        telephone: null,
        driverLicenseNumber: null,
        driverLicenseExpiryDate: null,
      },
      additionalDriver: { name: null, nationality: null, driverLicenseNumber: null },
      sponsor: { name: null, idNumber: null },
      plannedStartAt: null,
      plannedEndAt: null,
      durationValue: 7,
      durationUnit: "DAY",
      includedKmPerDay: null,
      extraKmRate: null,
    },
    vehicleOut: {
      status: "NOT_AVAILABLE",
      occurredAt: null,
      mileage: null,
      fuel: null,
      inspectionAngles: [],
      damage: [],
      signatureStatus: "NOT_SIGNED",
    },
    vehicleIn: {
      status: "NOT_AVAILABLE",
      occurredAt: null,
      mileage: null,
      fuel: null,
      inspectionAngles: [],
      damage: [],
      signatureStatus: "NOT_SIGNED",
    },
    signatures: {
      hirer: { status: "NOT_SIGNED", signedAt: null, hasImage: false, required: true },
      additionalDriver: { status: "NOT_SIGNED", signedAt: null, hasImage: false, required: false },
      sponsor: { status: "NOT_SIGNED", signedAt: null, hasImage: false, required: false },
      vehicleOutHirer: { status: "NOT_SIGNED", signedAt: null, hasImage: false, required: false },
      vehicleInHirer: { status: "NOT_SIGNED", signedAt: null, hasImage: false, required: false },
    },
    permissions: { canEdit: true, missingRequirements: [] },
  } as OfficialContractView;
}

describe("contract-pdf-view", () => {
  it("uses draft view for AWAITING/FORM", () => {
    const draft = minimalDraft();
    const detail = {
      status: "FORM",
      snapshot: null,
      carOut: null,
      carIn: null,
      carOutHandover: { status: "NOT_STARTED", signature: { present: false } },
    } as ContractDetail;
    const view = buildContractPdfOfficialView(detail, draft);
    assert.equal(view?.contract.agreementNumber, "DE-2026-000001");
  });

  it("builds a safe pdf filename", () => {
    assert.equal(contractPdfFilename("DE-2026-000001"), "Diamond-DE-2026-000001.pdf");
  });
});
