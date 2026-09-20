import type { OfficialContractView } from "../types/official-contract.types";

/** The backend official view is the sole source of printed company identity. */
export function officialContractCompanyNames(contract: OfficialContractView) {
  return {
    ar: contract.header.company.legalNameAr,
    en: contract.header.company.legalNameEn,
  };
}
