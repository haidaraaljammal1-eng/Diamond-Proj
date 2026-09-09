export type PublicRenewalStatus =
  | "AWAITING"
  | "FORM"
  | "SIGNED"
  | "PAID"
  | "ACTIVE"
  | "RETOUT"
  | "REVIEW"
  | "CLOSED";

export interface PublicRenewalOffer {
  additionalDays: number;
  additionalAmount: number;
  previousEndAt: string;
  newEndAt: string;
  confirmed: boolean;
}

export interface PublicRenewalView {
  office: { displayName: string };
  contractNumber: string;
  status: PublicRenewalStatus;
  priceType: string;
  rentalDays: number;
  agreedAmount: number;
  currency: string;
  startAt: string | null;
  endAt: string | null;
  depositAmount: number | null;
  termsVersion: string;
  vehicle: {
    displayName: string;
    plateNumber: string | null;
    color: string | null;
    modelYear: number | null;
  };
  renewal?: PublicRenewalOffer | null;
}

export type PublicRenewalLoadStatus = "idle" | "loading" | "ready" | "error";
