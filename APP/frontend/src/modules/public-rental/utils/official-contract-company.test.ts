import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { OfficialContractView } from "../types/official-contract.types.ts";
import { officialContractCompanyNames } from "./official-contract-company.ts";

function contractWithCompany(code: "UNIQUE" | "ELITE"): OfficialContractView {
  const legalNameAr = code === "UNIQUE"
    ? "شركة دايموند يونيك لتأجير السيارات ذ.م.م ش.ش.و"
    : "شركة دايموند إيليت لتأجير السيارات ذ.م.م ش.ش.و";
  const legalNameEn =
    code === "UNIQUE"
      ? "Diamond Unique Car Rental CO.L.L.C.S.O.C"
      : "Diamond Elite Car Rental LLC";
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
      en: "Diamond Unique Car Rental CO.L.L.C.S.O.C",
    });
  });

  it("renders the ELITE legal names from the official view", () => {
    assert.deepEqual(officialContractCompanyNames(contractWithCompany("ELITE")), {
      ar: "شركة دايموند إيليت لتأجير السيارات ذ.م.م ش.ش.و",
      en: "Diamond Elite Car Rental LLC",
    });
  });
});
