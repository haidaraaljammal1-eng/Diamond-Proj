import { env } from "@/config/env";
import { apiRequest } from "@/infrastructure/api/client";
import { ApiRequestError } from "@/infrastructure/api/errors";
import type { ApiErrorResponse, ApiResponse } from "@/infrastructure/api/types";
import type {
  CarOutPayload,
  ConfirmContractPaymentPayload,
  ContractDetailDto,
  ContractLinkIssuedDto,
  ContractListItemDto,
  CreateContractOfferPayload,
  ReconcilePayload,
  RenewPayload,
} from "../types/contract.types";
import type { ContractsListQuery } from "../types/contract.types";
import { parsePageMeta } from "./contracts.api.types";
import type { PageMeta } from "./contracts.api.types";
import { buildContractsQuery } from "../utils/contract-filters";

const CONTRACTS_PATH = "/contracts";

export interface AttachmentDto {
  id: string;
  originalName: string;
  mimeType: string;
  size: number;
}

async function getAccessToken(): Promise<string | undefined> {
  if (typeof window === "undefined") return undefined;
  const { getSession } = await import("next-auth/react");
  return (await getSession())?.accessToken;
}

function isApiErrorResponse(value: unknown): value is ApiErrorResponse {
  if (typeof value !== "object" || value === null || !("error" in value))
    return false;
  const error = value.error;
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    "message" in error
  );
}

async function readJson(response: Response): Promise<unknown> {
  const text = await response.text();
  if (!text) return undefined;
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return undefined;
  }
}

function withIdempotency(
  idempotencyKey?: string,
): Record<string, string> | undefined {
  if (!idempotencyKey) return undefined;
  return { "Idempotency-Key": idempotencyKey };
}

/** `GET /contracts` (`contracts.read`). */
export async function getContracts(
  params: ContractsListQuery = {},
): Promise<{ data: ContractListItemDto[]; meta: PageMeta | null }> {
  const query = buildContractsQuery(params);
  const response = await apiRequest<ContractListItemDto[]>(
    `${CONTRACTS_PATH}?${query}`,
  );
  return { data: response.data, meta: parsePageMeta(response.meta) };
}

/** `GET /contracts/:id` (`contracts.read`). */
export async function getContract(id: string): Promise<ContractDetailDto> {
  const response = await apiRequest<ContractDetailDto>(`${CONTRACTS_PATH}/${id}`);
  return response.data;
}

/** `POST /contracts/offers` (`contracts.manage`). */
export async function createContractOffer(
  payload: CreateContractOfferPayload,
): Promise<ContractDetailDto> {
  const response = await apiRequest<ContractDetailDto>(
    `${CONTRACTS_PATH}/offers`,
    { method: "POST", body: payload },
  );
  return response.data;
}

/** `POST /contracts/:id/rental-link` (`contracts.manage`). */
export async function generateRentalLink(
  id: string,
): Promise<ContractLinkIssuedDto> {
  const response = await apiRequest<ContractLinkIssuedDto>(
    `${CONTRACTS_PATH}/${id}/rental-link`,
    { method: "POST" },
  );
  return response.data;
}

/** `POST /contracts/:id/payment/confirm` (`contracts.manage`). */
export async function confirmContractPayment(
  id: string,
  payload: ConfirmContractPaymentPayload,
  idempotencyKey?: string,
): Promise<ContractDetailDto> {
  const response = await apiRequest<ContractDetailDto>(
    `${CONTRACTS_PATH}/${id}/payment/confirm`,
    {
      method: "POST",
      body: payload,
      headers: withIdempotency(idempotencyKey),
    },
  );
  return response.data;
}

/** `POST /contracts/:id/car-out` (`contracts.car_out` + `contracts.activate`). */
export async function submitCarOut(
  id: string,
  payload: CarOutPayload,
  idempotencyKey?: string,
): Promise<ContractDetailDto> {
  const response = await apiRequest<ContractDetailDto>(
    `${CONTRACTS_PATH}/${id}/car-out`,
    {
      method: "POST",
      body: payload,
      headers: withIdempotency(idempotencyKey),
    },
  );
  return response.data;
}

/** `POST /contracts/:id/return-link` (`contracts.return`). */
export async function generateReturnLink(
  id: string,
): Promise<ContractLinkIssuedDto> {
  const response = await apiRequest<ContractLinkIssuedDto>(
    `${CONTRACTS_PATH}/${id}/return-link`,
    { method: "POST" },
  );
  return response.data;
}

/** `POST /contracts/:id/renewal-link` (`contracts.renew`). */
export async function generateRenewalLink(
  id: string,
): Promise<ContractLinkIssuedDto> {
  const response = await apiRequest<ContractLinkIssuedDto>(
    `${CONTRACTS_PATH}/${id}/renewal-link`,
    { method: "POST" },
  );
  return response.data;
}

/** `POST /contracts/:id/renew` (`contracts.renew`). */
export async function renewContract(
  id: string,
  payload: RenewPayload,
  idempotencyKey?: string,
): Promise<ContractDetailDto> {
  const response = await apiRequest<ContractDetailDto>(
    `${CONTRACTS_PATH}/${id}/renew`,
    {
      method: "POST",
      body: payload,
      headers: withIdempotency(idempotencyKey),
    },
  );
  return response.data;
}

/** `POST /contracts/:id/reconcile` (`contracts.reconcile`). */
export async function reconcileContract(
  id: string,
  payload: ReconcilePayload,
): Promise<ContractDetailDto> {
  const response = await apiRequest<ContractDetailDto>(
    `${CONTRACTS_PATH}/${id}/reconcile`,
    { method: "POST", body: payload },
  );
  return response.data;
}

/** `POST /contracts/:id/close` (`contracts.close`). */
export async function closeContract(
  id: string,
  idempotencyKey?: string,
): Promise<ContractDetailDto> {
  const response = await apiRequest<ContractDetailDto>(
    `${CONTRACTS_PATH}/${id}/close`,
    {
      method: "POST",
      headers: withIdempotency(idempotencyKey),
    },
  );
  return response.data;
}

/**
 * `POST /files` — generic attachment used as Car-Out photo input.
 * Not the Vehicle gallery endpoint.
 */
export async function uploadContractAttachment(file: File): Promise<AttachmentDto> {
  const formData = new FormData();
  formData.append("file", file);

  const accessToken = await getAccessToken();
  const response = await fetch(`${env.apiUrl}/files`, {
    method: "POST",
    credentials: "include",
    headers: {
      Accept: "application/json",
      ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
    },
    body: formData,
  });

  const payload = await readJson(response);
  if (!response.ok) {
    if (isApiErrorResponse(payload))
      throw new ApiRequestError(payload.error, response.status);
    throw new ApiRequestError(
      {
        code: `HTTP_${response.status}`,
        message: response.statusText || "Request failed",
      },
      response.status,
    );
  }

  if (typeof payload !== "object" || payload === null || !("data" in payload)) {
    throw new ApiRequestError(
      { code: "INVALID_RESPONSE", message: "Invalid API response" },
      response.status,
    );
  }

  return (payload as ApiResponse<AttachmentDto>).data;
}
