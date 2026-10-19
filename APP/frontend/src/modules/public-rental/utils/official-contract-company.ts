import type { OfficialContractView } from "../types/official-contract.types";

/** The backend official view is the sole source of printed company identity. */
export function officialContractCompanyNames(contract: OfficialContractView) {
  return {
    ar: contract.header.company.legalNameAr,
    en: contract.header.company.legalNameEn,
  };
}

/** Official contract header raster logo — keyed by `header.company.code` from the backend view. */
export function officialContractHeaderLogo(companyCode: string) {
  if (companyCode === "UNIQUE") {
    return {
      logoSrc: "/official-contract/diamond-unique-contract-logo.png",
      logoAlt: "Diamond Unique Rent Car",
    };
  }
  return {
    logoSrc: "/official-contract/diamond-elite-contract-logo.png",
    logoAlt: "Diamond Elite Rent Car",
  };
}
