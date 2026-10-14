import type { OfficialContractView } from "../types/official-contract.types";
import { officialContractCompanyNames } from "./official-contract-company.ts";
import { CONTRACT_TITLE } from "./official-contract-template.ts";

const TITLE_EN_SUFFIX = " With Hirer & Sponsor";
const TITLE_AR_SUFFIX = " والمستأجر والكفيل";

/** Second line of the white agreement title box (company + hirer/sponsor wording). */
export function officialContractTitleCompanyLines(contract: OfficialContractView) {
  if (contract.header.company.code === "ELITE") {
    const names = officialContractCompanyNames(contract);
    return {
      en: `${names.en}${TITLE_EN_SUFFIX}`,
      ar: `${names.ar}${TITLE_AR_SUFFIX}`,
    };
  }
  return {
    en: CONTRACT_TITLE.en[1],
    ar: CONTRACT_TITLE.ar[1],
  };
}
