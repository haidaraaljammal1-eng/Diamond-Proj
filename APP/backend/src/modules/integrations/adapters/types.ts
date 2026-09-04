export type IntegrationErrorCode =
  | "AUTH_FAILED" | "CONNECTION_FAILED" | "INVALID_CONFIG"
  | "TIMEOUT" | "PROVIDER_ERROR" | "NOT_CONFIGURED"
  /** Non-production only: recipient blocked by EMAIL_RECIPIENT_ALLOWLIST. Nothing was sent. */
  | "RECIPIENT_NOT_ALLOWLISTED";

export interface ResolvedConfig {
  config: Record<string, string>;
  secrets: Record<string, string>;
}
export interface TestResult { ok: boolean; code?: IntegrationErrorCode; detail?: string }
export interface SendTarget { to: string; message?: string }

/** A real outbound message (campaign delivery, not a connectivity probe). */
export interface OutboundMessage {
  to: string;
  /** Plain-text body, already rendered and link-folded by the caller. */
  text: string;
  /** Provider-side pre-approved template name (e.g. a WhatsApp HSM), when set. */
  providerTemplateName?: string | null;
  providerLanguageCode?: string | null;
}

/** Outcome of a real send. `providerMessageId` is the ONLY provider payload that
 *  ever escapes an adapter — never the full response body, never credentials. */
export interface SendResult {
  ok: boolean;
  code?: IntegrationErrorCode;
  providerMessageId?: string;
  detail?: string;
}

export interface IntegrationAdapter {
  testConnection(cfg: ResolvedConfig): Promise<TestResult>;
  sendTest?(cfg: ResolvedConfig, target: SendTarget): Promise<TestResult>;
  /**
   * Real outbound send used by campaign distribution. Adapters implement this on
   * the SAME wire path as `sendTest`, so a green "send test" in the admin UI and a
   * campaign send cannot diverge: if the test succeeds the campaign will send too.
   */
  send?(cfg: ResolvedConfig, msg: OutboundMessage): Promise<SendResult>;
  /**
   * Pure, no-I/O check that the stored config + secrets are complete enough to
   * attempt a send. Drives channel readiness (CONFIGURED vs NOT_CONFIGURED) so
   * readiness never claims a channel that would immediately fail.
   */
  isConfigured?(cfg: ResolvedConfig): boolean;
}

/** Read a provider message id out of a JSON response without letting any other
 *  field (or a parse error) escape. Returns undefined when nothing usable exists. */
export async function readProviderMessageId(res: Response): Promise<string | undefined> {
  let body: unknown;
  try {
    body = await res.json();
  } catch {
    return undefined; // non-JSON / empty body is fine — the send still succeeded
  }
  if (body == null || typeof body !== "object") return undefined;
  const o = body as Record<string, unknown>;
  const messages = o.messages;
  if (Array.isArray(messages)) {
    const first = messages[0];
    if (first != null && typeof first === "object") {
      const id = (first as Record<string, unknown>).id;
      if (typeof id === "string" && id !== "") return id;
    }
  }
  for (const key of ["messageId", "message_id", "id", "sid", "reference"]) {
    const v = o[key];
    if (typeof v === "string" && v !== "") return v;
    if (typeof v === "number") return String(v);
  }
  return undefined;
}

export const ok = (): TestResult => ({ ok: true });
export const fail = (code: IntegrationErrorCode, detail?: string): TestResult =>
  detail ? { ok: false, code, detail } : { ok: false, code };

export function mapHttpStatus(status: number): IntegrationErrorCode {
  if (status === 401 || status === 403) return "AUTH_FAILED";
  if (status === 400 || status === 404 || status === 422) return "INVALID_CONFIG";
  return "PROVIDER_ERROR";
}

/** Node fetch with an abort timeout. Network failure -> CONNECTION_FAILED, abort -> TIMEOUT.
 *  Callers catch and translate via classifyNetworkError. */
export async function fetchWithTimeout(url: string, init: RequestInit = {}, ms = 10_000): Promise<Response> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), ms);
  try {
    return await fetch(url, { ...init, signal: ctrl.signal });
  } finally {
    clearTimeout(t);
  }
}

export function classifyNetworkError(err: unknown): TestResult {
  const name = (err as { name?: string })?.name;
  if (name === "AbortError") return fail("TIMEOUT", "request timed out");
  return fail("CONNECTION_FAILED", "could not reach the provider");
}
