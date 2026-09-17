import type { ContractStatus } from "./public-rental.types";

type SignatureStatus = "NOT_SIGNED" | "SIGNED";

/** Review PATCH text keys. Which are editable is decided by `permissions.editableFields`. */
export type OfficialContractReviewField =
  | "hirerName"
  | "nationality"
  | "passportNumber"
  | "address"
  | "telephone"
  | "additionalDriverName"
  | "additionalDriverNationality"
  | "additionalDriverLicenseNumber"
  | "sponsorName"
  | "sponsorIdNumber";

export type DamageMarkType = "SCRATCH" | "DENT" | "BROKEN" | "MISSING";

export interface DamageMark {
  zone: string;
  type: DamageMarkType;
}

export type OfficialContractReviewPatch = Partial<Record<OfficialContractReviewField, string | null>> & {
  /** Safe Stripe-derived card metadata only. Full PAN/CVV never enter Diamond forms or APIs. */
  cardNumberLast4?: string | null;
};

/** Local, unsaved review text values keyed by PATCH field. */
export type OfficialContractEdits = Partial<Record<OfficialContractReviewField, string>>;

export type OfficialContractMode = "REVIEW" | "READONLY" | "PRINT";

export type OfficialSignatureSlot =
  | "hirer"
  | "additionalDriver"
  | "sponsor"
  | "vehicleOutHirer"
  | "vehicleInHirer";

/** Backend enum values for signature slots. */
export type OfficialSignatureSlotKey =
  | "HIRER"
  | "ADDITIONAL_DRIVER"
  | "SPONSOR"
  | "VEHICLE_OUT_HIRER"
  | "VEHICLE_IN_HIRER";

export interface OfficialSignature {
  status: SignatureStatus;
  signedAt: string | null;
  hasImage: boolean;
  required: boolean;
}

interface OfficialCustody {
  status: "NOT_AVAILABLE" | "RECORDED";
  occurredAt: string | null;
  mileage: number | null;
  fuel: string | null;
  inspectionAngles: string[];
  damage: DamageMark[];
  signatureStatus: SignatureStatus;
}

/**
 * Backend `GET /contracts/rental/:token/official-contract` DTO.
 * Price policy: no rental price, rate amount or rate basis appears here.
 */
export interface OfficialContractView {
  header: { officeDisplayName: string };
  contract: {
    agreementNumber: string;
    status: ContractStatus;
    templateVersion: string;
    termsVersion: string;
  };
  vehicle: {
    plateCode: string | null;
    plateNumber: string | null;
    vehicleType: string | null;
    yearMade: number | null;
    color: string | null;
    notes: string | null;
  };
  hirer: {
    name: string | null;
    nationality: string | null;
    passportNumber: string | null;
    address: string | null;
    telephone: string | null;
    driverLicenseNumber: string | null;
    driverLicenseExpiryDate: string | null;
  };
  additionalDriver: {
    name: string | null;
    nationality: string | null;
    driverLicenseNumber: string | null;
  };
  sponsor: { name: string | null; idNumber: string | null };
  rental: {
    plannedStartAt: string | null;
    plannedEndAt: string | null;
    numberOfDays: number;
    periodConsistent: boolean | null;
    includedKmPerDay: number | null;
    extraKmRate: number | null;
  };
  card: { last4: string | null };
  vehicleOut: OfficialCustody;
  vehicleIn: OfficialCustody;
  signatures: Record<OfficialSignatureSlot, OfficialSignature>;
  identity: { identityReady: boolean };
  permissions: {
    canEdit: boolean;
    editableFields: string[];
    vehicleOut: CustodyCapabilities;
    vehicleIn: CustodyCapabilities;
    signableSlots: OfficialSignatureSlotKey[];
    canSign: boolean;
    missingRequirements: string[];
  };
  layout: { sections: string[]; infoGrid: string[][][] };
}

interface CustodyCapabilities {
  canEditDamage: boolean;
  canEditMileage: boolean;
  canEditFuel: boolean;
  canSign: boolean;
}
