import type { OfficialContractView } from "src/modules/contracts/contracts.schema";

type HistoricalCompany = {
  code: string;
  displayName: string;
  legalNameAr: string;
  legalNameEn: string;
  accentColor: string;
};

/** The signed legal view is frozen in the Contract snapshot. */
export function signedContractFromSnapshot(
  snapshot: unknown,
  historicalCompany?: HistoricalCompany,
): OfficialContractView | null {
  if (!snapshot || typeof snapshot !== "object" || !("officialContract" in snapshot)) return null;
  const view = (snapshot as { officialContract?: unknown }).officialContract;
  if (!view || typeof view !== "object" || !("contract" in view) || !("signatures" in view)) return null;
  const official = view as OfficialContractView;
  if (official.header?.company) return official;
  if (!historicalCompany || !official.header) return null;

  return {
    ...official,
    header: {
      ...official.header,
      company: {
        code: historicalCompany.code,
        displayName: historicalCompany.displayName,
        legalNameAr: historicalCompany.legalNameAr,
        legalNameEn: historicalCompany.legalNameEn,
        accentColor: historicalCompany.accentColor,
      },
    },
  };
}
