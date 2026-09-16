import { env } from "@/config/env";
import { apiRequest } from "@/infrastructure/api/client";
import { ApiRequestError } from "@/infrastructure/api/errors";
import type { ApiErrorResponse, ApiResponse } from "@/infrastructure/api/types";
import type {
  PublicPaymentAttempt,
  PublicPaymentContext,
  PublicPaymentStatus,
  PublicRentalContext,
  PublicRentalFormPayload,
} from "../types/public-rental.types";

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
  );
  return response.data;
}

export async function getPublicRentalLicense(
  token: string,
): Promise<PublicRentalContext> {
  const response = await apiRequest<PublicRentalContext>(
    `${CONTRACTS_PATH}/rental/${token}/driving-license`,
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

export async function submitPublicRentalForm(
  token: string,
  payload: PublicRentalFormPayload,
): Promise<PublicRentalContext> {
  const response = await apiRequest<PublicRentalContext>(
    `${CONTRACTS_PATH}/rental/${token}/form`,
    { method: "POST", body: payload },
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
    },
  );
  return response.data;
}

export async function getPublicRentalPayment(
  token: string,
): Promise<PublicPaymentContext> {
  const response = await apiRequest<PublicPaymentContext>(
    `${CONTRACTS_PATH}/rental/${token}/payment`,
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
    },
  );
  return response.data;
}

export async function getPublicPaymentStatus(
  statusToken: string,
): Promise<PublicPaymentStatus> {
  const response = await apiRequest<PublicPaymentStatus>(
    `${CONTRACTS_PATH}/payments/status/${statusToken}`,
  );
  return response.data;
}
