import { sanitizeForAudit } from "src/lib/security/redact";
import {
  isForbiddenUltraMsgPath,
  normalizeUltraMsgApiUrl,
  ULTRAMSG_GET_TIMEOUT_MS,
  ULTRAMSG_SEND_TIMEOUT_MS,
} from "src/modules/whatsapp/ultramsg.config";
import type { WhatsAppProviderFailureCode } from "src/modules/whatsapp/whatsapp.types";

export class UltraMsgHttpError extends Error {
  constructor(
    readonly code: WhatsAppProviderFailureCode,
    readonly httpStatus: number | null,
  ) {
    super("ultramsg_http_error");
    this.name = "UltraMsgHttpError";
  }
}

export interface UltraMsgClientOptions {
  apiUrl: string;
  instanceId: string;
  token: string;
  fetchImpl?: typeof fetch;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function safeJson(text: string): unknown {
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return null;
  }
}

export class UltraMsgClient {
  private readonly baseUrl: string;
  private readonly token: string;
  private readonly fetchImpl: typeof fetch;

  constructor(options: UltraMsgClientOptions) {
    this.baseUrl = normalizeUltraMsgApiUrl(options.apiUrl);
    this.token = options.token;
    this.fetchImpl = options.fetchImpl ?? fetch;
  }

  async getJson(path: string, timeoutMs = ULTRAMSG_GET_TIMEOUT_MS): Promise<{ status: number; json: unknown }> {
    return this.request("GET", path, undefined, timeoutMs);
  }

  async getBinary(path: string, timeoutMs = ULTRAMSG_GET_TIMEOUT_MS): Promise<{
    status: number;
    contentType: string | null;
    body: Buffer;
  }> {
    if (isForbiddenUltraMsgPath(path)) {
      throw new UltraMsgHttpError("VALIDATION_FAILED", null);
    }
    const url = this.buildUrl(path, true);
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await this.fetchImpl(url, { method: "GET", signal: controller.signal, redirect: "error" });
      const buffer = Buffer.from(await response.arrayBuffer());
      return {
        status: response.status,
        contentType: response.headers.get("content-type"),
        body: buffer,
      };
    } catch (error) {
      if (error instanceof UltraMsgHttpError) throw error;
      throw new UltraMsgHttpError("SEND_UNKNOWN", null);
    } finally {
      clearTimeout(timer);
    }
  }

  async postForm(
    path: string,
    fields: Record<string, string>,
    timeoutMs = ULTRAMSG_SEND_TIMEOUT_MS,
  ): Promise<{ status: number; json: unknown }> {
    const body = new URLSearchParams({ ...fields, token: this.token });
    return this.request("POST", path, body, timeoutMs);
  }

  private async request(
    method: "GET" | "POST",
    path: string,
    body: URLSearchParams | undefined,
    timeoutMs: number,
  ): Promise<{ status: number; json: unknown }> {
    if (isForbiddenUltraMsgPath(path)) {
      throw new UltraMsgHttpError("VALIDATION_FAILED", null);
    }
    const url = this.buildUrl(path, method === "GET");
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await this.fetchImpl(url, {
        method,
        headers:
          method === "POST"
            ? { "content-type": "application/x-www-form-urlencoded" }
            : undefined,
        body: method === "POST" ? body : undefined,
        signal: controller.signal,
        redirect: "error",
      });
      const text = await response.text();
      return { status: response.status, json: safeJson(text) };
    } catch (error) {
      if (error instanceof UltraMsgHttpError) throw error;
      if (error instanceof Error && error.name === "AbortError") {
        throw new UltraMsgHttpError("SEND_UNKNOWN", null);
      }
      throw new UltraMsgHttpError("SEND_UNKNOWN", null);
    } finally {
      clearTimeout(timer);
    }
  }

  private buildUrl(path: string, includeTokenQuery: boolean): string {
    const normalized = path.startsWith("/") ? path : `/${path}`;
    const url = new URL(`${this.baseUrl}${normalized}`);
    if (url.origin !== new URL(this.baseUrl).origin) {
      throw new UltraMsgHttpError("VALIDATION_FAILED", null);
    }
    if (includeTokenQuery) url.searchParams.set("token", this.token);
    return url.toString();
  }
}

/** Never log tokens, full UltraMsg URLs, or request bodies. */
export function sanitizeUltraMsgLog(input: unknown): unknown {
  return sanitizeForAudit(input);
}

export function mapUltraMsgHttpFailure(
  status: number,
  json: unknown,
): WhatsAppProviderFailureCode {
  if (status === 401 || status === 403) return "SEND_AUTH_FAILED";
  if (status === 429) return "SEND_RATE_LIMITED";
  if (status >= 500) return "SEND_UNKNOWN";
  const record = asRecord(json);
  if (typeof record?.error === "string" && record.error.trim()) return "SEND_REJECTED";
  if (status < 200 || status >= 300) return "SEND_REJECTED";
  return "INVALID_RESPONSE";
}
