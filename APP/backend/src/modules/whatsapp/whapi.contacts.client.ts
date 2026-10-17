import { WhapiClient } from "src/modules/whatsapp/providers/whapi.client";

function asRecord(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

export interface WhapiContactsListResult {
  items: Record<string, unknown>[];
  pageSize: number;
  hasMore: boolean;
}

export interface WhapiContactsClient {
  listContacts(count: number, offset: number): Promise<WhapiContactsListResult>;
  getProfilePicture(contactId: string): Promise<{ status: number; contentType: string | null; body: Buffer }>;
}

function extractArray(json: unknown, keys: string[]): unknown[] {
  const root = asRecord(json);
  if (!root) return [];
  for (const key of keys) {
    const value = root[key];
    if (Array.isArray(value)) return value;
  }
  if (Array.isArray(json)) return json;
  return [];
}

export function createWhapiContactsClient(client: WhapiClient): WhapiContactsClient {
  return {
    async listContacts(count, offset) {
      const path = `/contacts?count=${count}&offset=${offset}`;
      const { status, json } = await client.getJson(path);
      if (status < 200 || status >= 300) {
        throw new Error(`whapi_contacts_http_${status}`);
      }
      const items = extractArray(json, ["contacts", "data"]).filter(
        (row): row is Record<string, unknown> => asRecord(row) !== null,
      );
      return { items, pageSize: count, hasMore: items.length >= count };
    },
    async getProfilePicture(contactId) {
      const encoded = encodeURIComponent(contactId);
      return client.getBinary(`/contacts/${encoded}/profile-picture`);
    },
  };
}
