import type { OfficialContractView } from "@/modules/public-rental/types/official-contract.types";
import type { OperatingCompanyDto } from "@/modules/operating-companies";

/** The signed legal view is frozen in the Contract snapshot. */
export function signedContractFromSnapshot(
  snapshot: unknown,
  historicalCompany?: OperatingCompanyDto,
): OfficialContractView | null {
  if (!snapshot || typeof snapshot !== "object" || !("officialContract" in snapshot)) return null;
  const view = snapshot.officialContract;
  if (!view || typeof view !== "object" || !("contract" in view) || !("signatures" in view)) return null;
  const official = view as OfficialContractView;
  if (official.header?.company) return official;
  if (!historicalCompany || !official.header) return null;

  // Pre-multi-company snapshots stay frozen. Their missing company block is
  // projected from the Contract's historical company plus the backend lookup.
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
