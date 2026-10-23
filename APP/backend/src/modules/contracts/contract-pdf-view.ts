import type { ContractDetail, OfficialContractView } from "src/modules/contracts/contracts.schema";
import { OFFICIAL_CONTRACT_REVIEWABLE_STATUSES } from "src/modules/contracts/official-contract";
import { legacyContractReconstructionView } from "src/modules/contracts/contract-pdf-legacy-reconstruction";
import { liveContractView } from "src/modules/contracts/live-contract-view";

type HistoricalCompany = {
  code: string;
  displayName: string;
  legalNameAr: string;
  legalNameEn: string;
  accentColor: string;
};

export function buildContractPdfOfficialView(
  detail: ContractDetail,
  draftView: OfficialContractView | null,
  historicalCompany?: HistoricalCompany,
): OfficialContractView | null {
  if (OFFICIAL_CONTRACT_REVIEWABLE_STATUSES.includes(detail.status)) {
    return draftView;
  }
  const live = liveContractView(detail, historicalCompany);
  if (live) return live;
  if (draftView) {
    const reconstructed = legacyContractReconstructionView(detail, draftView);
    if (reconstructed) {
      return (
        liveContractView({ ...detail, snapshot: { officialContract: reconstructed } }, historicalCompany) ??
        reconstructed
      );
    }
    const liveFromDraft = liveContractView(
      { ...detail, snapshot: { officialContract: draftView } },
      historicalCompany,
    );
    if (liveFromDraft) return liveFromDraft;
    return draftView;
  }
  return null;
}

export function contractPdfFilename(contractNumber: string): string {
  const safe = contractNumber.trim().replace(/[\\/:*?"<>|]+/g, "-");
  return `Diamond-${safe}.pdf`;
}
