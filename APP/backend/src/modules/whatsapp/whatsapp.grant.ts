import type {
  WhatsAppGrantMetadata,
  WhatsAppGrantedPhone,
  WhatsAppGrantedWaba,
} from "src/modules/whatsapp/whatsapp.types";

export function emptyGrant(): WhatsAppGrantMetadata {
  return { wabas: [], phones: [] };
}

export function parseGrantMetadata(value: unknown): WhatsAppGrantMetadata | null {
  if (!value || typeof value !== "object") return null;
  const raw = value as { wabas?: unknown; phones?: unknown };
  if (!Array.isArray(raw.wabas) || !Array.isArray(raw.phones)) return null;
  const wabas: WhatsAppGrantedWaba[] = [];
  for (const item of raw.wabas) {
    if (!item || typeof item !== "object") return null;
    const wabaId = (item as { wabaId?: unknown }).wabaId;
    const businessName = (item as { businessName?: unknown }).businessName;
    if (typeof wabaId !== "string" || wabaId.length === 0) return null;
    if (businessName != null && typeof businessName !== "string") return null;
    wabas.push({ wabaId, businessName: businessName ?? null });
  }
  const phones: WhatsAppGrantedPhone[] = [];
  for (const item of raw.phones) {
    if (!item || typeof item !== "object") return null;
    const row = item as Record<string, unknown>;
    if (
      typeof row.wabaId !== "string" ||
      typeof row.phoneNumberId !== "string" ||
      typeof row.displayPhoneNumber !== "string"
    ) {
      return null;
    }
    if (row.verifiedName != null && typeof row.verifiedName !== "string") return null;
    phones.push({
      wabaId: row.wabaId,
      phoneNumberId: row.phoneNumberId,
      displayPhoneNumber: row.displayPhoneNumber,
      verifiedName: row.verifiedName ?? null,
    });
  }
  return { wabas, phones };
}

export function findGrantedPhone(
  grant: WhatsAppGrantMetadata,
  wabaId: string,
  phoneNumberId: string,
): WhatsAppGrantedPhone | null {
  const wabaKnown = grant.wabas.some((w) => w.wabaId === wabaId);
  if (!wabaKnown) return null;
  return (
    grant.phones.find((p) => p.wabaId === wabaId && p.phoneNumberId === phoneNumberId) ??
    null
  );
}

export function grantHasWaba(grant: WhatsAppGrantMetadata, wabaId: string): boolean {
  return grant.wabas.some((w) => w.wabaId === wabaId);
}
