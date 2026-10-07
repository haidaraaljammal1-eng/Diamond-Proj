import { sanitizeForAudit } from "src/lib/security/redact";
import {
  normalizeWhapiApiUrl,
  WHAPI_GET_TIMEOUT_MS,
  WHAPI_SEND_TIMEOUT_MS,
} from "src/modules/whatsapp/whapi.config";
import type { WhatsAppProviderFailureCode } from "src/modules/whatsapp/whatsapp.types";

export class WhapiHttpError extends Error {
  constructor(
    readonly code: WhatsAppProviderFailureCode,
    readonly httpStatus: number | null,
  ) {
    super("whapi_http_error");
    this.name = "WhapiHttpError";
  }
}

export interface WhapiClientOptions {
  apiUrl: string;
  token: string;
  fetchImpl?: typeof fetch;
}

function safeJson(text: string): unknown {
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return null;
  }
}

export class WhapiClient {
  private readonly baseUrl: string;
  private readonly token: string;
  private readonly fetchImpl: typeof fetch;

  constructor(options: WhapiClientOptions) {
    this.baseUrl = normalizeWhapiApiUrl(options.apiUrl);
    this.token = options.token;
    this.fetchImpl = options.fetchImpl ?? fetch;
  }

  async getJson(path: string, timeoutMs = WHAPI_GET_TIMEOUT_MS): Promise<{ status: number; json: unknown }> {
    return this.request("GET", path, undefined, timeoutMs);
  }

  async postJson(
    path: string,
    body: Record<string, unknown>,
    timeoutMs = WHAPI_SEND_TIMEOUT_MS,
  ): Promise<{ status: number; json: unknown }> {
    return this.request("POST", path, JSON.stringify(body), timeoutMs);
  }

  async putJson(
    path: string,
    body: Record<string, unknown>,
    timeoutMs = WHAPI_GET_TIMEOUT_MS,
  ): Promise<{ status: number; json: unknown }> {
    return this.request("PUT", path, JSON.stringify(body), timeoutMs);
  }

  async patchJson(
    path: string,
    body: Record<string, unknown>,
    timeoutMs = WHAPI_GET_TIMEOUT_MS,
  ): Promise<{ status: number; json: unknown }> {
    return this.request("PATCH", path, JSON.stringify(body), timeoutMs);
  }

  async getBinary(path: string, timeoutMs = WHAPI_GET_TIMEOUT_MS): Promise<{
    status: number;
    contentType: string | null;
    body: Buffer;
  }> {
    const url = `${this.baseUrl}${path.startsWith("/") ? path : `/${path}`}`;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await this.fetchImpl(url, {
        method: "GET",
        headers: { authorization: `Bearer ${this.token}` },
        signal: controller.signal,
        redirect: "error",
      });
      const buffer = Buffer.from(await response.arrayBuffer());
      return {
        status: response.status,
        contentType: response.headers.get("content-type"),
        body: buffer,
      };
    } catch (error) {
      if (error instanceof WhapiHttpError) throw error;
      throw new WhapiHttpError("SEND_UNKNOWN", null);
    } finally {
      clearTimeout(timer);
    }
  }

  private async request(
    method: "GET" | "POST" | "PUT" | "PATCH",
    path: string,
    body: string | undefined,
    timeoutMs: number,
  ): Promise<{ status: number; json: unknown }> {
    const url = `${this.baseUrl}${path.startsWith("/") ? path : `/${path}`}`;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await this.fetchImpl(url, {
        method,
        headers: {
          authorization: `Bearer ${this.token}`,
          ...(body ? { "content-type": "application/json" } : {}),
        },
        body,
        signal: controller.signal,
        redirect: "error",
      });
      const text = await response.text();
      return { status: response.status, json: safeJson(text) };
    } catch (error) {
      if (error instanceof WhapiHttpError) throw error;
      if (error instanceof Error && error.name === "AbortError") {
        throw new WhapiHttpError("SEND_UNKNOWN", null);
      }
      throw new WhapiHttpError("SEND_UNKNOWN", null);
    } finally {
      clearTimeout(timer);
    }
  }
}

export function mapWhapiHttpFailure(
  status: number,
  json: unknown,
): WhatsAppProviderFailureCode {
  const body =
    json !== null && typeof json === "object" && !Array.isArray(json)
      ? (json as Record<string, unknown>)
      : null;
  const message = typeof body?.message === "string" ? body.message : "";
  void sanitizeForAudit({ status, message });
  if (status === 401 || status === 403) return "AUTH_FAILED";
  if (status === 429) return "SEND_RATE_LIMITED";
  if (status >= 400 && status < 500) return "SEND_REJECTED";
  if (status >= 500) return "SEND_UNKNOWN";
  return "INVALID_RESPONSE";
}
