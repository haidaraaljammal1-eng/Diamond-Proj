import { apiRequest } from "@/infrastructure/api/client";
import type { ContractDetailDto } from "../types/contract.types";
import type {
  ConfirmReconciliationRoadLiabilityPayload,
  FullReconciliationReadDto,
  PublicReconciliationReadDto,
  ReconciliationLineInputPayload,
  ReconciliationLinkIssuedDto,
} from "../types/reconciliation.types";
import type { PaymentCheckoutDto } from "@/modules/payments/types/payment.types";
import { publicRentalRequestOptions } from "@/modules/public-rental/utils/public-request-locale";

const CONTRACTS_PATH = "/contracts";

function withIdempotency(idempotencyKey?: string): Record<string, string> | undefined {
  if (!idempotencyKey) return undefined;
  return { "Idempotency-Key": idempotencyKey };
}

/** `GET /contracts/:id/reconciliation` */
export async function getFullReconciliation(contractId: string): Promise<FullReconciliationReadDto> {
  const response = await apiRequest<FullReconciliationReadDto>(
    `${CONTRACTS_PATH}/${contractId}/reconciliation`,
  );
  return response.data;
}

/** `POST /contracts/:id/reconciliation/lines` */
export async function addReconciliationLine(
  contractId: string,
  payload: ReconciliationLineInputPayload,
): Promise<ContractDetailDto> {
  const response = await apiRequest<ContractDetailDto>(
    `${CONTRACTS_PATH}/${contractId}/reconciliation/lines`,
    { method: "POST", body: payload },
  );
  return response.data;
}

/** `PATCH /contracts/:id/reconciliation/lines/:lineId` */
export async function updateReconciliationLine(
  contractId: string,
  lineId: string,
  payload: ReconciliationLineInputPayload,
): Promise<ContractDetailDto> {
  const response = await apiRequest<ContractDetailDto>(
    `${CONTRACTS_PATH}/${contractId}/reconciliation/lines/${lineId}`,
    { method: "PATCH", body: payload },
  );
  return response.data;
}

/** `DELETE /contracts/:id/reconciliation/lines/:lineId` */
export async function deleteReconciliationLine(
  contractId: string,
  lineId: string,
): Promise<ContractDetailDto> {
  const response = await apiRequest<ContractDetailDto>(
    `${CONTRACTS_PATH}/${contractId}/reconciliation/lines/${lineId}`,
    { method: "DELETE" },
  );
  return response.data;
}

/** `POST /contracts/:id/reconciliation/finalize` */
export async function finalizeReconciliation(
  contractId: string,
  idempotencyKey?: string,
): Promise<ContractDetailDto> {
  const response = await apiRequest<ContractDetailDto>(
    `${CONTRACTS_PATH}/${contractId}/reconciliation/finalize`,
    { method: "POST", headers: withIdempotency(idempotencyKey) },
  );
  return response.data;
}

/** `POST /contracts/:id/reconciliation/cash/settle` */
export async function settleReconciliationCash(
  contractId: string,
  idempotencyKey?: string,
): Promise<ContractDetailDto> {
  const response = await apiRequest<ContractDetailDto>(
    `${CONTRACTS_PATH}/${contractId}/reconciliation/cash/settle`,
    { method: "POST", headers: withIdempotency(idempotencyKey) },
  );
  return response.data;
}

/** `POST /contracts/:id/reconciliation/link` */
export async function generateReconciliationLink(
  contractId: string,
): Promise<ReconciliationLinkIssuedDto> {
  const response = await apiRequest<ReconciliationLinkIssuedDto>(
    `${CONTRACTS_PATH}/${contractId}/reconciliation/link`,
    { method: "POST" },
  );
  return response.data;
}

/** `POST /contracts/:id/reconciliation/road-liabilities/:roadLiabilityId/confirm-charge` */
export async function confirmReconciliationRoadLiabilityCharge(
  contractId: string,
  roadLiabilityId: string,
  payload: ConfirmReconciliationRoadLiabilityPayload,
  idempotencyKey?: string,
): Promise<ContractDetailDto> {
  const response = await apiRequest<ContractDetailDto>(
    `${CONTRACTS_PATH}/${contractId}/reconciliation/road-liabilities/${roadLiabilityId}/confirm-charge`,
    { method: "POST", body: payload, headers: withIdempotency(idempotencyKey) },
  );
  return response.data;
}

/** `GET /contracts/reconciliation/:token` */
export async function getPublicReconciliation(token: string): Promise<PublicReconciliationReadDto> {
  const response = await apiRequest<PublicReconciliationReadDto>(
    `${CONTRACTS_PATH}/reconciliation/${token}`,
    publicRentalRequestOptions(),
  );
  return response.data;
}

/** `POST /contracts/reconciliation/:token/payment` */
export async function startPublicReconciliationPayment(
  token: string,
): Promise<PaymentCheckoutDto> {
  const response = await apiRequest<PaymentCheckoutDto>(
    `${CONTRACTS_PATH}/reconciliation/${token}/payment`,
    { method: "POST", body: {}, ...publicRentalRequestOptions() },
  );
  return response.data;
}
