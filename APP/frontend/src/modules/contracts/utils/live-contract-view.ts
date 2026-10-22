import type { OfficialContractView } from "@/modules/public-rental/types/official-contract.types";
import type { ContractDetailDto } from "../types/contract.types";
import { signedContractFromSnapshot } from "./signed-contract-snapshot.ts";
import type { OperatingCompanyDto } from "@/modules/operating-companies";

/**
 * The signed legal view with every custody event recorded since signing laid
 * over it: Car-Out (mileage, fuel, damage marks, hirer OUT signature) and
 * Car-In (mileage, fuel, damage marks, hirer IN signature). Only completed events are
 * applied; a Car-Out draft is not part of the contract until the handover is completed.
 */
export function liveContractView(
  detail: ContractDetailDto,
  historicalCompany?: OperatingCompanyDto,
): OfficialContractView | null {
  const signed = signedContractFromSnapshot(detail.snapshot, historicalCompany);
  if (!signed) return null;
  const view: OfficialContractView = {
    ...signed,
    contract: { ...signed.contract, status: detail.status },
    signatures: { ...signed.signatures },
  };

  const handover = detail.carOutHandover;
  const out = detail.carOut ?? (handover.status === "COMPLETED" ? {
    occurredAt: handover.actualHandoverAt,
    mileageOut: handover.mileageOut,
    fuelOut: handover.fuelOut,
    damageOut: handover.damageOut,
  } : null);
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
    const inHandover = detail.carInHandover;
    const inSigned = inHandover.signature.present;
    view.vehicleIn = {
      ...signed.vehicleIn,
      status: "RECORDED",
      occurredAt: detail.carIn.occurredAt,
      mileage: detail.carIn.mileageIn,
      fuel: detail.carIn.fuelIn,
      damage: inHandover.damageIn ?? [],
      signatureStatus: inSigned ? "SIGNED" : signed.vehicleIn.signatureStatus,
    };
    if (inSigned) {
      view.signatures.vehicleInHirer = {
        ...signed.signatures.vehicleInHirer,
        status: "SIGNED",
        signedAt: detail.carIn.occurredAt ?? null,
        hasImage: true,
        required: signed.signatures.vehicleInHirer.required,
      };
    }
  }
  return view;
}

/** True when the live view carries anything recorded after signing. */
export function hasPostSigningRecords(detail: ContractDetailDto): boolean {
  return Boolean(detail.carOut || detail.carIn || detail.carOutHandover.status === "COMPLETED");
}
