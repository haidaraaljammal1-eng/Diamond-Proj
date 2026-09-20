import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { OperatingCompanyDto } from "@/modules/operating-companies";
import { signedContractFromSnapshot } from "./signed-contract-snapshot.ts";

const unique: OperatingCompanyDto = {
  id: 1,
  code: "UNIQUE",
  displayName: "UNIQUE",
  legalNameAr: "شركة دايموند يونيك لتأجير السيارات ذ.م.م ش.ش.و",
  legalNameEn: "DIAMOND UNIQUE CAR RENTALS CO. LLC S.O.C",
  accentColor: "#C9A15C",
  isActive: true,
};

function legacySnapshot() {
  return {
    officialContract: {
      header: { officeDisplayName: "Diamond Rent Car" },
      contract: { agreementNumber: "DE-1" },
      signatures: {},
    },
  };
}

describe("signedContractFromSnapshot company projection", () => {
  it("projects a legacy snapshot from the Contract historical company lookup", () => {
    const view = signedContractFromSnapshot(legacySnapshot(), unique);
    assert.equal(view?.header.company.code, "UNIQUE");
    assert.equal(view?.header.company.legalNameEn, unique.legalNameEn);
  });

  it("does not guess a company when a legacy snapshot has no authoritative lookup", () => {
    assert.equal(signedContractFromSnapshot(legacySnapshot()), null);
  });
});
