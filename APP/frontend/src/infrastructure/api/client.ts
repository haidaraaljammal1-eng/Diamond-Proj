import { env } from "@/config/env";
import { ApiRequestError } from "./errors";
import { shouldRedirectToLogin } from "./session-redirect";
import type { ApiErrorResponse, ApiResponse } from "./types";

async function getAccessToken(): Promise<string | undefined> {
  if (typeof window === "undefined") return undefined;
  const { getSession } = await import("next-auth/react");
  return (await getSession())?.accessToken;
}

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
  // `publicRequest` is a client flag, not a fetch option.
  const init: ApiRequestOptions = { ...options };
  delete init.publicRequest;
  return fetch(`${env.apiUrl}${path}`, {
    ...init,
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
  /**
   * Public customer endpoint scoped by an opaque link token, not a staff
   * session: no session token is attached, no refresh is attempted, and auth
   * error codes never redirect to the staff `/login` page.
   */
  publicRequest?: boolean;
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
  const publicRequest = options.publicRequest === true;
  const accessToken = publicRequest ? undefined : await getAccessToken();
  let response = await requestWithToken(path, options, accessToken);
  if (!publicRequest && response.status === 401 && typeof window !== "undefined") {
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
    if (shouldRedirectToLogin(apiError.code, { publicRequest })) redirectToLogin();
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
