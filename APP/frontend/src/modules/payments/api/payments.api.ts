import { apiRequest } from "@/infrastructure/api/client";
import type { PaymentCheckoutDto, PaymentStatusDto } from "../types/payment.types";

const CONTRACTS_PATH = "/contracts";

export async function getPublicPaymentStatus(
  statusToken: string,
): Promise<PaymentStatusDto> {
  const response = await apiRequest<PaymentStatusDto>(
    `${CONTRACTS_PATH}/payments/status/${encodeURIComponent(statusToken)}`,
  );
  return response.data;
}

export async function startReconciliationPayment(
  contractId: string,
): Promise<PaymentCheckoutDto> {
  const response = await apiRequest<PaymentCheckoutDto>(
    `${CONTRACTS_PATH}/${contractId}/reconciliation/payment`,
    { method: "POST" },
  );
  return response.data;
}

export async function startPostCloseReceivablePayment(
  contractId: string,
  receivableId: string,
): Promise<PaymentCheckoutDto> {
  const response = await apiRequest<PaymentCheckoutDto>(
    `${CONTRACTS_PATH}/${contractId}/post-close-receivables/${receivableId}/payment`,
    { method: "POST" },
  );
  return response.data;
}
