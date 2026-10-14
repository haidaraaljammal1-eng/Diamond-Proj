import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { OfficialContractView } from "../types/official-contract.types.ts";
import { officialContractTitleCompanyLines } from "./official-contract-title.ts";
import { contractTitleEnSecondLine } from "./official-contract-template.ts";

function contractWithCompany(code: "UNIQUE" | "ELITE"): OfficialContractView {
  const legalNameAr = code === "UNIQUE"
    ? "شركة دايموند يونيك لتأجير السيارات ذ.م.م ش.ش.و"
    : "دايموند إليت لتأجير السيارات ش.ذ.م.م";
  const legalNameEn = code === "UNIQUE"
    ? "Diamond Unique Car Rental CO.L.L.C.S.O.C"
    : "Diamond Elite Car Rental LLC";
  return {
    header: {
      officeDisplayName: "Diamond Rent Car",
      company: { code, displayName: code, legalNameAr, legalNameEn, accentColor: "#000000" },
    },
  } as OfficialContractView;
}

describe("official contract title company lines", () => {
  it("uses UNIQUE legal English name with hirer/sponsor suffix", () => {
    const contract = contractWithCompany("UNIQUE");
    const lines = officialContractTitleCompanyLines(contract);
    assert.equal(
      lines.en,
      contractTitleEnSecondLine("Diamond Unique Car Rental CO.L.L.C.S.O.C"),
    );
    assert.equal(
      lines.ar,
      "شركة دايموند يونيك لتأجير السيارات ذ.م.م ش.ش.و والمستأجر والكفيل",
    );
  });

  it("uses ELITE legal names with the same hirer/sponsor suffix", () => {
    const lines = officialContractTitleCompanyLines(contractWithCompany("ELITE"));
    assert.equal(
      lines.en,
      "Diamond Elite Car Rental LLC With Hirer & Sponsor",
    );
    assert.equal(
      lines.ar,
      "دايموند إليت لتأجير السيارات ش.ذ.م.م والمستأجر والكفيل",
    );
  });
});
