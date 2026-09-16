import type { WhatsAppProviderSessionStatus } from "@prisma/client";

const RAW_TO_SESSION: Record<string, WhatsAppProviderSessionStatus> = {
  initialize: "INITIALIZING",
  initializing: "INITIALIZING",
  qr: "QR_REQUIRED",
  retrying: "RETRYING",
  loading: "LOADING",
  authenticated: "AUTHENTICATED",
  disconnected: "DISCONNECTED",
  standby: "STANDBY",
};

/** Official UltraMsg status strings → Diamond session status. Unknown stays UNKNOWN. */
export function mapUltraMsgAccountStatus(raw: string | null | undefined): WhatsAppProviderSessionStatus {
  if (!raw) return "UNKNOWN";
  return RAW_TO_SESSION[raw.trim().toLowerCase()] ?? "UNKNOWN";
}

export function extractUltraMsgAccountStatus(json: unknown): string | null {
  const record = asRecord(json);
  if (!record) return null;
  if (typeof record.status === "string") return record.status;
  const nested = asRecord(record.status);
  if (typeof nested?.status === "string") return nested.status;
  const account = asRecord(nested?.accountStatus) ?? asRecord(record.accountStatus);
  if (typeof account?.status === "string") return account.status;
  return null;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}
