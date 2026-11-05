import type { ApiError } from "./types";

export class ApiRequestError extends Error {
  readonly code: string;
  readonly details: unknown;
  readonly context: Record<string, unknown> | undefined;
  readonly requestId: string | undefined;
  readonly status: number;

  constructor(error: ApiError, status: number) {
    super(
      typeof error?.message === "string" && error.message.length > 0
        ? error.message
        : "Request failed",
    );
    this.name = "ApiRequestError";
    this.code =
      typeof error?.code === "string" && error.code.length > 0 ? error.code : "UNKNOWN";
    this.details = error.details;
    this.context = error.context;
    this.requestId = error.requestId;
    this.status = status;
  }
}

export function isApiRequestError(error: unknown): error is ApiRequestError {
  return error instanceof ApiRequestError;
}

export function normalizeApiError(error: unknown, status = 0): ApiRequestError {
  if (isApiRequestError(error)) return error;

  return new ApiRequestError(
    {
      code: "NETWORK_ERROR",
      message:
        error instanceof Error ? error.message : "Network request failed",
    },
    status,
  );
}
