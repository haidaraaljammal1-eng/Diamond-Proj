import type { Prisma } from "@prisma/client";

export type WhatsAppGroupMessagePayload = {
  senderDisplayName?: string | null;
  senderProviderId?: string | null;
  quotedProviderMessageId?: string | null;
  quotedPreview?: string | null;
};

export type WhatsAppGroupParticipantSnapshot = {
  providerId: string;
  displayName: string | null;
};

function asRecord(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

export function mergeGroupMessagePayload(
  base: Record<string, unknown> | null | undefined,
  group: WhatsAppGroupMessagePayload,
): Prisma.InputJsonValue {
  const root = { ...(base ?? {}) };
  const existing = asRecord(root.group) ?? {};
  root.group = {
    ...existing,
    ...(group.senderDisplayName !== undefined ? { senderDisplayName: group.senderDisplayName } : {}),
    ...(group.senderProviderId !== undefined ? { senderProviderId: group.senderProviderId } : {}),
    ...(group.quotedProviderMessageId !== undefined
      ? { quotedProviderMessageId: group.quotedProviderMessageId }
      : {}),
    ...(group.quotedPreview !== undefined ? { quotedPreview: group.quotedPreview } : {}),
  };
  return root as Prisma.InputJsonValue;
}

export function readGroupMessagePayload(
  value: Prisma.JsonValue | null | undefined,
): WhatsAppGroupMessagePayload | null {
  const root = asRecord(value);
  const group = asRecord(root?.group);
  if (!group) return null;
  return {
    senderDisplayName:
      typeof group.senderDisplayName === "string" ? group.senderDisplayName : null,
    senderProviderId:
      typeof group.senderProviderId === "string" ? group.senderProviderId : null,
    quotedProviderMessageId:
      typeof group.quotedProviderMessageId === "string" ? group.quotedProviderMessageId : null,
    quotedPreview: typeof group.quotedPreview === "string" ? group.quotedPreview : null,
  };
}

export function sanitizeGroupParticipants(
  rows: unknown,
): WhatsAppGroupParticipantSnapshot[] {
  if (!Array.isArray(rows)) return [];
  const out: WhatsAppGroupParticipantSnapshot[] = [];
  for (const row of rows) {
    const record = asRecord(row);
    if (!record) continue;
    const providerId =
      (typeof record.providerId === "string" ? record.providerId : null) ??
      (typeof record.id === "string" ? record.id : null) ??
      (typeof record.wa_id === "string" ? record.wa_id : null);
    if (!providerId) continue;
    const displayName =
      typeof record.displayName === "string"
        ? record.displayName
        : typeof record.name === "string"
          ? record.name
          : typeof record.pushname === "string"
            ? record.pushname
            : null;
    out.push({ providerId, displayName });
  }
  return out;
}
