export interface WhatsAppLocationPayload {
  latitude: number | null;
  longitude: number | null;
  name: string | null;
  address: string | null;
}

export interface WhatsAppContactPayload {
  formattedName: string | null;
  phones: string[];
}

export interface WhatsAppReactionPayload {
  emoji: string | null;
  referencedProviderMessageId: string | null;
}

export interface WhatsAppInteractivePayload {
  kind: string | null;
  title: string | null;
}

export interface WhatsAppDisplayPayload {
  location?: WhatsAppLocationPayload;
  contacts?: WhatsAppContactPayload[];
  reaction?: WhatsAppReactionPayload;
  interactive?: WhatsAppInteractivePayload;
  caption?: string | null;
  filename?: string | null;
  mimeType?: string | null;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function asString(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

function asNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() !== "") {
    const n = Number(value);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

export function extractInboundMediaFields(
  type: string,
  mediaObj: Record<string, unknown> | null,
): {
  providerMediaId: string | null;
  caption: string | null;
  filename: string | null;
  mimeType: string | null;
} {
  if (!mediaObj) {
    return { providerMediaId: null, caption: null, filename: null, mimeType: null };
  }
  return {
    providerMediaId: asString(mediaObj.id),
    caption: asString(mediaObj.caption),
    filename: asString(mediaObj.filename),
    mimeType: asString(mediaObj.mime_type),
  };
}

export function extractDisplayPayload(
  type: string,
  msg: Record<string, unknown>,
): WhatsAppDisplayPayload | null {
  if (type === "location") {
    const loc = asRecord(msg.location);
    if (!loc) return null;
    return {
      location: {
        latitude: asNumber(loc.latitude),
        longitude: asNumber(loc.longitude),
        name: asString(loc.name),
        address: asString(loc.address),
      },
    };
  }
  if (type === "contacts") {
    const rows = Array.isArray(msg.contacts) ? msg.contacts : [];
    const contacts: WhatsAppContactPayload[] = [];
    for (const row of rows.slice(0, 20)) {
      const item = asRecord(row);
      if (!item) continue;
      const name = asRecord(item.name);
      const phones = Array.isArray(item.phones)
        ? item.phones
            .map((phone) => asString(asRecord(phone)?.phone) ?? asString(asRecord(phone)?.wa_id))
            .filter((value): value is string => Boolean(value))
            .slice(0, 8)
        : [];
      contacts.push({
        formattedName: asString(name?.formatted_name) ?? asString(name?.first_name),
        phones,
      });
    }
    return contacts.length > 0 ? { contacts } : null;
  }
  if (type === "reaction") {
    const reaction = asRecord(msg.reaction);
    if (!reaction) return null;
    return {
      reaction: {
        emoji: asString(reaction.emoji),
        referencedProviderMessageId: asString(reaction.message_id),
      },
    };
  }
  if (type === "interactive") {
    const interactive = asRecord(msg.interactive);
    if (!interactive) return null;
    const kind = asString(interactive.type);
    const button = asRecord(interactive.button_reply);
    const list = asRecord(interactive.list_reply);
    const title =
      asString(button?.title) ?? asString(list?.title) ?? asString(asRecord(interactive.nfm_reply)?.body);
    return { interactive: { kind, title } };
  }
  return null;
}
