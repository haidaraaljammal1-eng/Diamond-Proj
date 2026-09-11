export type PublicReturnStatus =
  | "AWAITING"
  | "FORM"
  | "SIGNED"
  | "PAID"
  | "ACTIVE"
  | "RETOUT"
  | "REVIEW"
  | "CLOSED";

export interface PublicReturnView {
  office: { displayName: string };
  contractNumber: string;
  status: PublicReturnStatus;
  priceType: string;
  rentalDays: number;
  agreedAmount: number;
  currency: string;
  startAt: string | null;
  endAt: string | null;
  termsVersion: string;
  vehicle: {
    displayName: string;
    plateNumber: string | null;
    color: string | null;
    modelYear: number | null;
  };
}

export type PublicReturnLoadStatus = "idle" | "loading" | "ready" | "error";
