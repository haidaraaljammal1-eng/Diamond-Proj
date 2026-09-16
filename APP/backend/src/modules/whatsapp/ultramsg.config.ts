import { env } from "src/config/env";

export const ULTRAMSG_INSTANCE_ID = "";
export const ULTRAMSG_DEFAULT_API_URL = "";

export const ULTRAMSG_TEXT_BODY_MAX = 4096;
export const ULTRAMSG_MEDIA_CAPTION_MAX = 1024;
export const ULTRAMSG_DOCUMENT_FILENAME_MAX = 255;
export const ULTRAMSG_BASE64_MAX_LENGTH = 10_000_000;

/** Official UltraMsg media size limits (bytes). */
export const ULTRAMSG_MEDIA_MAX_BYTES = {
  IMAGE: 16 * 1024 * 1024,
  AUDIO: 16 * 1024 * 1024,
  VIDEO: 32 * 1024 * 1024,
  DOCUMENT: 30 * 1024 * 1024,
} as const;

export const ULTRAMSG_GET_TIMEOUT_MS = 8_000;
export const ULTRAMSG_SEND_TIMEOUT_MS = 30_000;

const FORBIDDEN_PATH = /instance\/(?:clear|logout|restart)|chats\/(?:clear|delete)|messages\/delete/i;

export function isUltraMsgConfigured(
  input: { instanceId?: string; apiUrl?: string; token?: string } = {
    instanceId: env.ULTRAMSG_INSTANCE_ID,
    apiUrl: env.ULTRAMSG_API_URL,
    token: env.ULTRAMSG_TOKEN,
  },
): boolean {
  return (
    (input.instanceId ?? "").trim().length > 0 &&
    (input.apiUrl ?? "").trim().length > 0 &&
    (input.token ?? "").trim().length > 0
  );
}

export function ultramsgRuntimeConfig() {
  return {
    instanceId: env.ULTRAMSG_INSTANCE_ID.trim() || ULTRAMSG_INSTANCE_ID,
    apiUrl: normalizeUltraMsgApiUrl(env.ULTRAMSG_API_URL.trim() || ULTRAMSG_DEFAULT_API_URL),
    token: env.ULTRAMSG_TOKEN.trim(),
    configureWebhook: env.ULTRAMSG_CONFIGURE_WEBHOOK,
    testRecipient: env.ULTRAMSG_TEST_RECIPIENT.trim(),
    webhookCallbackKey: env.ULTRAMSG_WEBHOOK_CALLBACK_KEY.trim(),
  };
}

export function normalizeUltraMsgApiUrl(url: string): string {
  return url.replace(/\/+$/, "");
}

export function isForbiddenUltraMsgPath(path: string): boolean {
  return FORBIDDEN_PATH.test(path);
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

export function diamondUltraMsgWebhookUrl(callbackKey: string): string | null {
  if (publicWebhookUrlRequired()) return null;
  const base = env.PUBLIC_BACKEND_URL.trim().replace(/\/+$/, "");
  return `${base}/whatsapp/webhooks/ultramsg/${encodeURIComponent(callbackKey)}`;
}

/** Compare configured instance id with webhook `instanceId` without inventing aliases. */
export function ultramsgInstanceIdsMatch(
  configured: string,
  incoming: string | null | undefined,
): boolean {
  if (!incoming) return false;
  const normalize = (value: string) => value.trim().toLowerCase().replace(/^instance/, "");
  const a = normalize(configured);
  const b = normalize(incoming);
  return a.length > 0 && a === b;
}

export const ULTRAMSG_WEBHOOK_MAX_BYTES = 512_000;
