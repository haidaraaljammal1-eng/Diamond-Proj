import { env } from "@/config/env";
import { apiRequest } from "@/infrastructure/api/client";
import { ApiRequestError } from "@/infrastructure/api/errors";
import type { ApiErrorResponse, ApiResponse } from "@/infrastructure/api/types";
import type {
  PublicIdentityDraft,
  PublicPaymentAttempt,
  PublicPaymentContext,
  PublicPaymentStatus,
  PublicRentalContext,
  PublicRentalFormPayload,
} from "../types/public-rental.types";
import type {
  OfficialContractReviewPatch,
  OfficialContractView,
} from "../types/official-contract.types";

const CONTRACTS_PATH = "/contracts";

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

/** Public rental calls never persist the token. Callers pass it from the route. */
export async function getPublicRental(
  token: string,
): Promise<PublicRentalContext> {
  const response = await apiRequest<PublicRentalContext>(
    `${CONTRACTS_PATH}/rental/${token}`,
    { publicRequest: true },
  );
  return response.data;
}

export async function getPublicRentalLicense(
  token: string,
): Promise<PublicRentalContext> {
  const response = await apiRequest<PublicRentalContext>(
    `${CONTRACTS_PATH}/rental/${token}/driving-license`,
    { publicRequest: true },
  );
  return response.data;
}

export async function uploadPublicRentalLicense(
  token: string,
  file: File,
): Promise<PublicRentalContext> {
  const formData = new FormData();
  formData.append("file", file);

  const response = await fetch(
    `${env.apiUrl}${CONTRACTS_PATH}/rental/${token}/driving-license`,
    {
      method: "POST",
      credentials: "include",
      headers: { Accept: "application/json" },
      body: formData,
    },
  );

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

  return (payload as ApiResponse<PublicRentalContext>).data;
}

function parseUploadResponse(status: number, statusText: string, text: string): PublicRentalContext {
  let payload: unknown;
  try {
    payload = text ? (JSON.parse(text) as unknown) : undefined;
  } catch {
    payload = undefined;
  }
  if (status < 200 || status >= 300) {
    if (isApiErrorResponse(payload)) throw new ApiRequestError(payload.error, status);
    throw new ApiRequestError(
      { code: status === 0 ? "NETWORK_ERROR" : `HTTP_${status}`, message: statusText || "Request failed" },
      status,
    );
  }
  if (typeof payload !== "object" || payload === null || !("data" in payload)) {
    throw new ApiRequestError({ code: "INVALID_RESPONSE", message: "Invalid API response" }, status);
  }
  return (payload as ApiResponse<PublicRentalContext>).data;
}

/**
 * Passport information-page upload. The server validates the token, the
 * license gate, and the file, then runs OCR server-side. `onUploaded` fires
 * once the bytes are sent so the UI can switch from "uploading" to "processing".
 * Returns normalized identity state only — never a raw OCR payload.
 */
export function uploadPublicRentalPassport(
  token: string,
  file: File,
  onUploaded?: () => void,
): Promise<PublicRentalContext> {
  const formData = new FormData();
  formData.append("file", file);

  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", `${env.apiUrl}${CONTRACTS_PATH}/rental/${token}/passport`);
    xhr.withCredentials = true;
    xhr.setRequestHeader("Accept", "application/json");
    xhr.upload.onload = () => onUploaded?.();
    xhr.onload = () => {
      try {
        resolve(parseUploadResponse(xhr.status, xhr.statusText, xhr.responseText));
      } catch (error) {
        reject(error);
      }
    };
    xhr.onerror = () =>
      reject(new ApiRequestError({ code: "NETWORK_ERROR", message: "Network error" }, 0));
    xhr.send(formData);
  });
}

export async function getPublicRentalIdentity(
  token: string,
): Promise<PublicIdentityDraft> {
  const response = await apiRequest<PublicIdentityDraft>(
    `${CONTRACTS_PATH}/rental/${token}/identity`,
    { publicRequest: true },
  );
  return response.data;
}

/** The one authoritative official agreement for the rental token. */
export async function getPublicOfficialContract(
  token: string,
): Promise<OfficialContractView> {
  const response = await apiRequest<OfficialContractView>(
    `${CONTRACTS_PATH}/rental/${token}/official-contract`,
    { publicRequest: true },
  );
  return response.data;
}

/** Saves customer review corrections; returns the reconciled official agreement. */
export async function reviewPublicOfficialContract(
  token: string,
  patch: OfficialContractReviewPatch,
): Promise<OfficialContractView> {
  const response = await apiRequest<OfficialContractView>(
    `${CONTRACTS_PATH}/rental/${token}/official-contract`,
    { method: "PATCH", body: patch, publicRequest: true },
  );
  return response.data;
}

/** Captures (or replaces) one official-contract signature as a PNG. */
export async function savePublicOfficialSignature(
  token: string,
  slotPath: string,
  image: Blob,
): Promise<OfficialContractView> {
  const formData = new FormData();
  formData.append("file", image, `${slotPath}.png`);
  const response = await fetch(
    `${env.apiUrl}${CONTRACTS_PATH}/rental/${token}/official-contract/signatures/${slotPath}`,
    {
      method: "PUT",
      credentials: "include",
      headers: { Accept: "application/json" },
      body: formData,
    },
  );
  const payload = await readJson(response);
  if (!response.ok) {
    if (isApiErrorResponse(payload)) throw new ApiRequestError(payload.error, response.status);
    throw new ApiRequestError(
      { code: `HTTP_${response.status}`, message: response.statusText || "Request failed" },
      response.status,
    );
  }
  if (typeof payload !== "object" || payload === null || !("data" in payload)) {
    throw new ApiRequestError({ code: "INVALID_RESPONSE", message: "Invalid API response" }, response.status);
  }
  return (payload as ApiResponse<OfficialContractView>).data;
}

export async function clearPublicOfficialSignature(
  token: string,
  slotPath: string,
): Promise<OfficialContractView> {
  const response = await apiRequest<OfficialContractView>(
    `${CONTRACTS_PATH}/rental/${token}/official-contract/signatures/${slotPath}`,
    { method: "DELETE", publicRequest: true },
  );
  return response.data;
}

/** Token-scoped image URL for a stored signature (no storage details). */
export function publicOfficialSignatureUrl(token: string, slotPath: string, version: string): string {
  return `${env.apiUrl}${CONTRACTS_PATH}/rental/${token}/official-contract/signatures/${slotPath}?v=${encodeURIComponent(version)}`;
}

/** Signs the official contract. The Backend validates identity, fields and signatures. */
export async function signPublicOfficialContract(
  token: string,
  termsVersion?: string,
): Promise<OfficialContractView> {
  const response = await apiRequest<OfficialContractView>(
    `${CONTRACTS_PATH}/rental/${token}/official-contract/sign`,
    { method: "POST", body: termsVersion ? { termsVersion } : {}, publicRequest: true },
  );
  return response.data;
}

export async function submitPublicRentalForm(
  token: string,
  payload: PublicRentalFormPayload,
): Promise<PublicRentalContext> {
  const response = await apiRequest<PublicRentalContext>(
    `${CONTRACTS_PATH}/rental/${token}/form`,
    { method: "POST", body: payload, publicRequest: true },
  );
  return response.data;
}

export async function acceptPublicRental(
  token: string,
  termsVersion?: string,
): Promise<PublicRentalContext> {
  const response = await apiRequest<PublicRentalContext>(
    `${CONTRACTS_PATH}/rental/${token}/accept`,
    {
      method: "POST",
      body: termsVersion ? { termsVersion } : {},
      publicRequest: true,
    },
  );
  return response.data;
}

export async function getPublicRentalPayment(
  token: string,
): Promise<PublicPaymentContext> {
  const response = await apiRequest<PublicPaymentContext>(
    `${CONTRACTS_PATH}/rental/${token}/payment`,
    { publicRequest: true },
  );
  return response.data;
}

export async function startPublicRentalPayment(
  token: string,
  idempotencyKey: string,
): Promise<PublicPaymentAttempt> {
  const response = await apiRequest<PublicPaymentAttempt>(
    `${CONTRACTS_PATH}/rental/${token}/payment`,
    {
      method: "POST",
      headers: { "Idempotency-Key": idempotencyKey },
      publicRequest: true,
    },
  );
  return response.data;
}

export async function getPublicPaymentStatus(
  statusToken: string,
): Promise<PublicPaymentStatus> {
  const response = await apiRequest<PublicPaymentStatus>(
    `${CONTRACTS_PATH}/payments/status/${statusToken}`,
    { publicRequest: true },
  );
  return response.data;
}
