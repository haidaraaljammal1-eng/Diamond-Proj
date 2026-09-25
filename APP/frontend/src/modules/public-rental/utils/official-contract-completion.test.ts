import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { OfficialContractView } from "../types/official-contract.types";
import {
  buildDevTestDataFill,
  collectContractCompletionIssues,
  effectiveReviewValue,
} from "./official-contract-completion.ts";

function view(overrides: Partial<OfficialContractView> = {}): OfficialContractView {
  const custody = {
    status: "NOT_AVAILABLE" as const,
    occurredAt: null,
    mileage: null,
    fuel: null,
    inspectionAngles: [],
    damage: [],
    signatureStatus: "NOT_SIGNED" as const,
  };
  const unsigned = { status: "NOT_SIGNED" as const, signedAt: null, hasImage: false, required: false };
  return {
    header: {
      officeDisplayName: "Diamond",
      company: {
        code: "UNIQUE",
        displayName: "UNIQUE",
        legalNameAr: "شركة",
        legalNameEn: "COMPANY",
        accentColor: "#000",
      },
    },
    contract: {
      agreementNumber: "DE-1",
      status: "FORM",
      templateVersion: "DIAMOND_CONTRACT_V1",
      termsVersion: "v1",
    },
    vehicle: {
      plateCode: null,
      plateNumber: "Q 1",
      vehicleType: "SUV",
      yearMade: 2025,
      color: "White",
      notes: null,
    },
    hirer: {
      name: "DEMO CUSTOMER",
      nationality: "UAE",
      passportNumber: "P1234567",
      address: null,
      telephone: null,
      driverLicenseNumber: "DL-1",
      driverLicenseExpiryDate: "2031-06-01",
    },
    additionalDriver: { name: null, nationality: null, driverLicenseNumber: null },
    sponsor: { name: null, idNumber: null },
    rental: {
      plannedStartAt: null,
      plannedEndAt: null,
      durationValue: 7,
      durationUnit: "DAY",
      periodConsistent: true,
      includedKmPerDay: null,
      extraKmRate: null,
    },
    card: { last4: null },
    vehicleOut: custody,
    vehicleIn: custody,
    signatures: {
      hirer: { ...unsigned, required: true },
      additionalDriver: unsigned,
      sponsor: unsigned,
      vehicleOutHirer: unsigned,
      vehicleInHirer: unsigned,
    },
    identity: { identityReady: true },
    permissions: {
      canEdit: true,
      editableFields: ["address", "telephone"],
      vehicleOut: { canEditDamage: false, canEditMileage: false, canEditFuel: false, canSign: false },
      vehicleIn: { canEditDamage: false, canEditMileage: false, canEditFuel: false, canSign: false },
      signableSlots: ["HIRER"],
      canSign: false,
      missingRequirements: ["ADDRESS", "TELEPHONE"],
    },
    layout: { sections: [], infoGrid: [] },
    ...overrides,
  };
}

describe("official contract completion", () => {
  it("reports missing manual fields before sign", () => {
    const issues = collectContractCompletionIssues(view(), {});
    assert.deepEqual(issues.missingRequirements, ["ADDRESS", "TELEPHONE"]);
  });

  it("clears missing fields after local edits", () => {
    const issues = collectContractCompletionIssues(view(), {
      address: "Dubai Marina",
      telephone: "+971501234567",
    });
    assert.deepEqual(issues.missingRequirements, []);
  });

  it("fills only empty editable fields for dev test data", () => {
    const filled = buildDevTestDataFill(view(), {});
    assert.equal(effectiveReviewValue(view(), filled, "address"), "Dubai Marina, UAE");
    assert.equal(effectiveReviewValue(view(), filled, "telephone"), "+971501234567");
    assert.equal(filled.hirerName, undefined);
  });
});
