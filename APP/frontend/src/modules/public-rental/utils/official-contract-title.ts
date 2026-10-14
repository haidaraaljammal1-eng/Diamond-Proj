import type { OfficialContractView } from "../types/official-contract.types";
import { officialContractCompanyNames } from "./official-contract-company.ts";
import { contractTitleEnSecondLine } from "./official-contract-template.ts";

const TITLE_AR_SUFFIX = " والمستأجر والكفيل";

/** Second line of the white agreement title box (company + hirer/sponsor wording). */
export function officialContractTitleCompanyLines(contract: OfficialContractView) {
  const names = officialContractCompanyNames(contract);
  return {
    en: contractTitleEnSecondLine(names.en),
    ar: `${names.ar}${TITLE_AR_SUFFIX}`,
  };
}
