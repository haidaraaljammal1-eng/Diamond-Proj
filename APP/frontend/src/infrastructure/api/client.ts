import { env } from "@/config/env";
import { ApiRequestError } from "./errors";
import type { ApiErrorResponse, ApiResponse } from "./types";

async function getAccessToken(): Promise<string | undefined> {
  if (typeof window === "undefined") return undefined;
  const { getSession } = await import("next-auth/react");
  return (await getSession())?.accessToken;
}

/**
 * Codes the Backend uses for a session that cannot be recovered by refreshing.
 * `next-auth`'s own `useSession()` only learns about a dead session on its next
 * focus/interval refetch, so a page can sit on a stale "authenticated" session
 * showing a generic load error instead of being sent to `/login`. Redirecting
 * here, the moment the API itself reports one of these codes, closes that gap.
 */
const DEAD_SESSION_CODES = new Set(["TOKEN_INVALID", "TOKEN_EXPIRED", "UNAUTHORIZED"]);

let loggingOut = false;

function redirectToLogin(): void {
  if (typeof window === "undefined" || loggingOut) return;
  if (window.location.pathname.includes("/login")) return;
  loggingOut = true;
  const locale = window.location.pathname.split("/")[1] === "en" ? "en" : "ar";
  void import("next-auth/react").then(({ signOut }) =>
    signOut({ redirectTo: `/${locale}/login` }),
  );
}

async function requestWithToken(
  path: string,
  options: ApiRequestOptions,
  accessToken?: string,
): Promise<Response> {
  return fetch(`${env.apiUrl}${path}`, {
    ...options,
    credentials: options.credentials ?? "include",
    headers: {
      Accept: "application/json",
      ...(options.body === undefined
        ? {}
        : { "Content-Type": "application/json" }),
      ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
      ...options.headers,
    },
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
  });
}

export interface ApiRequestOptions extends Omit<RequestInit, "body"> {
  body?: unknown;
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

export async function apiRequest<T>(
  path: string,
  options: ApiRequestOptions = {},
): Promise<ApiResponse<T>> {
  const accessToken = await getAccessToken();
  let response = await requestWithToken(path, options, accessToken);
  if (response.status === 401 && typeof window !== "undefined") {
    const refreshedToken = await getAccessToken();
    if (refreshedToken && refreshedToken !== accessToken) {
      response = await requestWithToken(path, options, refreshedToken);
    }
  }
  const payload = await readJson(response);

  if (!response.ok) {
    const apiError = isApiErrorResponse(payload)
      ? new ApiRequestError(payload.error, response.status)
      : new ApiRequestError(
          {
            code: `HTTP_${response.status}`,
            message: response.statusText || "Request failed",
          },
          response.status,
        );
    if (DEAD_SESSION_CODES.has(apiError.code)) redirectToLogin();
    throw apiError;
  }

  if (typeof payload !== "object" || payload === null || !("data" in payload)) {
    throw new ApiRequestError(
      { code: "INVALID_RESPONSE", message: "Invalid API response" },
      response.status,
    );
  }

  return payload as ApiResponse<T>;
}
