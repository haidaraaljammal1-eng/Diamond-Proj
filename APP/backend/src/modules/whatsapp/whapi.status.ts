import type { WhatsAppProviderSessionStatus } from "@prisma/client";

function asRecord(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function asString(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

export function extractWhapiHealthStatusText(json: unknown): string | null {
  const body = asRecord(json);
  const status = asRecord(body?.status);
  return asString(status?.text) ?? asString(body?.status);
}

/** Conservative mapping from Whapi GET /health. Never invent AUTHENTICATED. */
export function mapWhapiHealthStatus(json: unknown): WhatsAppProviderSessionStatus {
  const text = (extractWhapiHealthStatusText(json) ?? "").toUpperCase();
  if (text === "AUTH" || text === "AUTHENTICATED") return "AUTHENTICATED";
  if (text === "QR" || text === "QRCODE" || text === "QR_REQUIRED") return "QR_REQUIRED";
  if (text === "INIT" || text === "INITIALIZING" || text === "INITIALIZE") return "INITIALIZING";
  if (text === "LOADING") return "LOADING";
  if (text === "RETRY" || text === "RETRYING") return "RETRYING";
  if (text === "DISCONNECTED" || text === "LOGOUT") return "DISCONNECTED";
  if (text === "STANDBY") return "STANDBY";
  return "UNKNOWN";
}
