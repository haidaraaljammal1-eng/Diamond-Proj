import { timingSafeEqual } from "node:crypto";
import { env } from "src/config/env";

export const WHAPI_DEFAULT_API_URL = "https://gate.whapi.cloud";

export const WHAPI_TEXT_BODY_MAX = 4096;
export const WHAPI_MEDIA_CAPTION_MAX = 1024;
export const WHAPI_DOCUMENT_FILENAME_MAX = 255;
export const WHAPI_BASE64_MAX_LENGTH = 10_000_000;

export const WHAPI_MEDIA_MAX_BYTES = {
  IMAGE: 16 * 1024 * 1024,
  AUDIO: 16 * 1024 * 1024,
  VIDEO: 32 * 1024 * 1024,
  DOCUMENT: 30 * 1024 * 1024,
} as const;

export const WHAPI_GET_TIMEOUT_MS = 8_000;
export const WHAPI_SEND_TIMEOUT_MS = 30_000;
export const WHAPI_WEBHOOK_MAX_BYTES = 512_000;

const WHAPI_WEBHOOK_SECRET_HEADER = "x-diamond-whapi-secret";

export function whapiWebhookSecretHeaderName(): string {
  return "X-Diamond-Whapi-Secret";
}

export function isWhapiConfigured(
  input: { apiUrl?: string; token?: string } = {
    apiUrl: env.WHAPI_API_URL,
    token: env.WHAPI_TOKEN,
  },
): boolean {
  return (input.apiUrl ?? "").trim().length > 0 && (input.token ?? "").trim().length > 0;
}

export function whapiRuntimeConfig() {
  return {
    apiUrl: normalizeWhapiApiUrl(env.WHAPI_API_URL.trim() || WHAPI_DEFAULT_API_URL),
    token: env.WHAPI_TOKEN.trim(),
    channelId: env.WHAPI_CHANNEL_ID.trim(),
    configureWebhook: env.WHAPI_CONFIGURE_WEBHOOK,
    testRecipient: env.WHAPI_TEST_RECIPIENT.trim(),
    webhookCallbackKey: env.WHAPI_WEBHOOK_CALLBACK_KEY.trim(),
    webhookSecret: env.WHAPI_WEBHOOK_SECRET.trim(),
  };
}

export function normalizeWhapiApiUrl(url: string): string {
  const trimmed = url.trim().replace(/\/+$/, "");
  if (!trimmed) return WHAPI_DEFAULT_API_URL;
  try {
    const parsed = new URL(trimmed);
    if (parsed.protocol !== "https:") {
      throw new Error("invalid");
    }
    const host = parsed.hostname.toLowerCase();
    if (host !== "gate.whapi.cloud" && !host.endsWith(".whapi.cloud")) {
      throw new Error("invalid");
    }
    return `${parsed.protocol}//${parsed.host}`;
  } catch {
    return WHAPI_DEFAULT_API_URL;
  }
}

export function publicWebhookUrlRequired(): boolean {
  const base = env.PUBLIC_BACKEND_URL.trim();
  if (!base) return true;
  try {
    const parsed = new URL(base);
    if (parsed.protocol !== "https:") return true;
    const host = parsed.hostname.toLowerCase();
    if (host === "localhost" || host === "127.0.0.1" || host.endsWith(".local")) return true;
    if (/^(10\.|192\.168\.|172\.(1[6-9]|2\d|3[0-1])\.)/.test(host)) return true;
    return false;
  } catch {
    return true;
  }
}

export function diamondWhapiWebhookUrl(callbackKey: string): string | null {
  if (publicWebhookUrlRequired()) return null;
  const base = env.PUBLIC_BACKEND_URL.trim().replace(/\/+$/, "");
  return `${base}/whatsapp/webhooks/whapi/${encodeURIComponent(callbackKey)}`;
}

export function whapiChannelIdsMatch(
  configured: string,
  incoming: string | null | undefined,
): boolean {
  if (!incoming) return false;
  const a = configured.trim();
  const b = incoming.trim();
  return a.length > 0 && a === b;
}

export function timingSafeWhapiWebhookSecret(expected: string, incoming: string): boolean {
  const a = Buffer.from(expected);
  const b = Buffer.from(incoming);
  if (a.length === 0 || a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

export { WHAPI_WEBHOOK_SECRET_HEADER };
