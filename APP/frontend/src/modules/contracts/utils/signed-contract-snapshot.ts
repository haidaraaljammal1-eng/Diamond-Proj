import type { OfficialContractView } from "@/modules/public-rental/types/official-contract.types";

/** The signed legal view is frozen in the Contract snapshot. */
export function signedContractFromSnapshot(snapshot: unknown): OfficialContractView | null {
  if (!snapshot || typeof snapshot !== "object" || !("officialContract" in snapshot)) return null;
  const view = snapshot.officialContract;
  if (!view || typeof view !== "object" || !("contract" in view) || !("signatures" in view)) return null;
  return view as OfficialContractView;
}
