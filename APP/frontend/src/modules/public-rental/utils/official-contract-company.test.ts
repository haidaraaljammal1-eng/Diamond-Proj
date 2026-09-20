import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { OfficialContractView } from "../types/official-contract.types.ts";
import { officialContractCompanyNames } from "./official-contract-company.ts";

function contractWithCompany(code: "UNIQUE" | "ELITE"): OfficialContractView {
  const legalNameAr = code === "UNIQUE"
    ? "شركة دايموند يونيك لتأجير السيارات ذ.م.م ش.ش.و"
    : "شركة دايموند إيليت لتأجير السيارات ذ.م.م ش.ش.و";
  const legalNameEn = `DIAMOND ${code} CAR RENTALS CO. LLC S.O.C`;
  return {
    header: {
      officeDisplayName: "Diamond Rent Car",
      company: { code, displayName: code, legalNameAr, legalNameEn, accentColor: "#000000" },
    },
  } as OfficialContractView;
}

describe("official contract company identity", () => {
  it("renders the UNIQUE legal names from the official view", () => {
    assert.deepEqual(officialContractCompanyNames(contractWithCompany("UNIQUE")), {
      ar: "شركة دايموند يونيك لتأجير السيارات ذ.م.م ش.ش.و",
      en: "DIAMOND UNIQUE CAR RENTALS CO. LLC S.O.C",
    });
  });

  it("renders the ELITE legal names from the official view", () => {
    assert.deepEqual(officialContractCompanyNames(contractWithCompany("ELITE")), {
      ar: "شركة دايموند إيليت لتأجير السيارات ذ.م.م ش.ش.و",
      en: "DIAMOND ELITE CAR RENTALS CO. LLC S.O.C",
    });
  });
});
