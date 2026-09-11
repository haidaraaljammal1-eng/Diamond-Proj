export type ContractPaymentPurpose =
  | "RENTAL"
  | "RENEWAL"
  | "RECONCILIATION"
  | "POST_CLOSE_RECEIVABLE";

export type ContractPaymentStatus =
  | "PENDING"
  | "PROCESSING"
  | "CONFIRMED"
  | "FAILED"
  | "CANCELLED";

export interface PaymentCheckoutDto {
  payment: {
    id?: string;
    status: ContractPaymentStatus;
    amount: number;
    currency: string;
    purpose?: ContractPaymentPurpose;
    checkoutUrl?: string | null;
    checkoutExpiresAt?: string | null;
  };
  checkoutUrl?: string | null;
  statusToken: string | null;
  providerAvailable: boolean;
  noPaymentRequired?: boolean;
}

export interface PaymentStatusDto {
  status: ContractPaymentStatus;
  contractStatus: string | null;
  purpose?: ContractPaymentPurpose;
  checkoutUrl?: string | null;
}
