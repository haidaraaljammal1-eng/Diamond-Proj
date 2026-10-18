import { WhapiClient } from "src/modules/whatsapp/providers/whapi.client";
import { WHAPI_HISTORY_GET_TIMEOUT_MS } from "src/modules/whatsapp/whapi.config";
import { whapiHistoryHttpError } from "src/modules/whatsapp/whatsapp.history-sync.provider-errors";

function asRecord(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

export interface WhapiGroupsListResult {
  items: Record<string, unknown>[];
  pageSize: number;
  hasMore: boolean;
}

export interface WhapiGroupsClient {
  listGroups(count: number, offset: number): Promise<WhapiGroupsListResult>;
  getGroupIcon(groupId: string): Promise<{ status: number; contentType: string | null; body: Buffer }>;
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

export function groupIdFromWhapiRow(row: Record<string, unknown>): string | null {
  const id =
    (typeof row.id === "string" ? row.id.trim() : null) ??
    (typeof row.chat_id === "string" ? row.chat_id.trim() : null);
  return id && id.length > 0 ? id : null;
}

export function groupNameFromWhapiRow(row: Record<string, unknown>): string | null {
  const name = typeof row.name === "string" ? row.name.trim() : "";
  return name.length > 0 ? name : null;
}

export function createWhapiGroupsClient(client: WhapiClient): WhapiGroupsClient {
  return {
    async listGroups(count, offset) {
      const path = `/groups?count=${count}&offset=${offset}`;
      const { status, json } = await client.getJson(path, WHAPI_HISTORY_GET_TIMEOUT_MS);
      if (status < 200 || status >= 300) {
        throw whapiHistoryHttpError("groups", status);
      }
      const items = extractArray(json, ["groups", "data"]).filter(
        (row): row is Record<string, unknown> => asRecord(row) !== null,
      );
      return { items, pageSize: count, hasMore: items.length >= count };
    },
    async getGroupIcon(groupId) {
      const encoded = encodeURIComponent(groupId);
      return client.getBinary(`/groups/${encoded}/icon`);
    },
  };
}
