import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { OfficialContractView } from "../types/official-contract.types.ts";
import { officialContractTitleCompanyLines } from "./official-contract-title.ts";
import { CONTRACT_TITLE } from "./official-contract-template.ts";

function contractWithCompany(code: "UNIQUE" | "ELITE"): OfficialContractView {
  const legalNameAr = code === "UNIQUE"
    ? "شركة دايموند يونيك لتأجير السيارات ذ.م.م ش.ش.و"
    : "دايموند إليت لتأجير السيارات ش.ذ.م.م";
  const legalNameEn = code === "UNIQUE"
    ? "DIAMOND UNIQUE CAR RENTALS CO. LLC S.O.C"
    : "DIAMOND ELITE CAR RENTAL L.L.C";
  return {
    header: {
      officeDisplayName: "Diamond Rent Car",
      company: { code, displayName: code, legalNameAr, legalNameEn, accentColor: "#000000" },
    },
  } as OfficialContractView;
}

describe("official contract title company lines", () => {
  it("keeps UNIQUE white-box company lines byte-for-byte from CONTRACT_TITLE", () => {
    const lines = officialContractTitleCompanyLines(contractWithCompany("UNIQUE"));
    assert.equal(lines.en, CONTRACT_TITLE.en[1]);
    assert.equal(lines.ar, CONTRACT_TITLE.ar[1]);
  });

  it("uses ELITE legal names with the same hirer/sponsor suffix as the template", () => {
    const lines = officialContractTitleCompanyLines(contractWithCompany("ELITE"));
    assert.equal(
      lines.en,
      "DIAMOND ELITE CAR RENTAL L.L.C With Hirer & Sponsor",
    );
    assert.equal(
      lines.ar,
      "دايموند إليت لتأجير السيارات ش.ذ.م.م والمستأجر والكفيل",
    );
  });
});
