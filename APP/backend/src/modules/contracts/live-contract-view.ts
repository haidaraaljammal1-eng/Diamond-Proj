import type { ContractDetail, OfficialContractView } from "src/modules/contracts/contracts.schema";
import { signedContractFromSnapshot } from "src/modules/contracts/signed-contract-snapshot";

type HistoricalCompany = {
  code: string;
  displayName: string;
  legalNameAr: string;
  legalNameEn: string;
  accentColor: string;
};

/**
 * Signed legal view with completed Car-Out / Car-In overlays (same rules as staff UI).
 */
export function liveContractView(
  detail: ContractDetail,
  historicalCompany?: HistoricalCompany,
): OfficialContractView | null {
  const signed = signedContractFromSnapshot(detail.snapshot, historicalCompany);
  if (!signed) return null;
  const view: OfficialContractView = {
    ...signed,
    contract: { ...signed.contract, status: detail.status },
    signatures: { ...signed.signatures },
  };

  const handover = detail.carOutHandover;
  const out =
    detail.carOut ??
    (handover.status === "COMPLETED"
      ? {
          occurredAt: handover.actualHandoverAt ?? new Date(),
          mileageOut: handover.mileageOut ?? 0,
          fuelOut: handover.fuelOut ?? "",
          damageOut: handover.damageOut,
        }
      : null);
  if (out) {
    const outSigned = handover.signature.present || Boolean(detail.carOut?.hirerSignatureAttachmentId);
    view.vehicleOut = {
      ...signed.vehicleOut,
      status: "RECORDED",
      occurredAt: out.occurredAt ?? null,
      mileage: out.mileageOut ?? null,
      fuel: out.fuelOut ?? null,
      damage: out.damageOut ?? [],
      signatureStatus: outSigned ? "SIGNED" : signed.vehicleOut.signatureStatus,
    };
    if (outSigned) {
      view.signatures.vehicleOutHirer = {
        ...signed.signatures.vehicleOutHirer,
        status: "SIGNED",
        signedAt: out.occurredAt ?? null,
        hasImage: handover.signature.present,
      };
    }
  }

  if (detail.carIn) {
    view.vehicleIn = {
      ...signed.vehicleIn,
      status: "RECORDED",
      occurredAt: detail.carIn.occurredAt,
      mileage: detail.carIn.mileageIn,
      fuel: detail.carIn.fuelIn,
    };
  }
  return view;
}
