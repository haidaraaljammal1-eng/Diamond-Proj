import { WhapiClient } from "src/modules/whatsapp/providers/whapi.client";
import { classifyWhapiMessagesListHttpStatus } from "src/modules/whatsapp/whapi.history.messages-list";
import { whapiHistoryHttpError } from "src/modules/whatsapp/whatsapp.history-sync.provider-errors";

function asRecord(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function asString(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

export interface WhapiHistoryListResult<T> {
  items: T[];
  pageSize: number;
  hasMore: boolean;
}

export interface WhapiHistoryMessagesPage extends WhapiHistoryListResult<Record<string, unknown>> {
  skipChat?: { reasonCode: string; httpStatus: number };
}

export interface WhapiHistoryClient {
  listChats(count: number, offset: number): Promise<WhapiHistoryListResult<Record<string, unknown>>>;
  listMessages(
    chatId: string,
    count: number,
    offset: number,
    sort: "asc" | "desc",
  ): Promise<WhapiHistoryMessagesPage>;
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

export function createWhapiHistoryClient(client: WhapiClient): WhapiHistoryClient {
  return {
    async listChats(count, offset) {
      const path = `/chats?count=${count}&offset=${offset}`;
      const { status, json } = await client.getJson(path);
      if (status < 200 || status >= 300) {
        throw whapiHistoryHttpError("chats", status);
      }
      const items = extractArray(json, ["chats", "data"]).filter(
        (row): row is Record<string, unknown> => asRecord(row) !== null,
      );
      const hasMore = items.length >= count;
      return { items, pageSize: count, hasMore };
    },
    async listMessages(chatId, count, offset, sort) {
      const encoded = encodeURIComponent(chatId);
      const path = `/messages/list/${encoded}?count=${count}&offset=${offset}&sort=${sort}`;
      const { status, json } = await client.getJson(path);
      const classification = classifyWhapiMessagesListHttpStatus(status, chatId);
      if (classification.kind === "auth_error") {
        throw whapiHistoryHttpError("messages", status);
      }
      if (classification.kind === "skip_chat") {
        return {
          items: [],
          pageSize: count,
          hasMore: false,
          skipChat: { reasonCode: classification.reasonCode, httpStatus: status },
        };
      }
      if (classification.kind === "provider_error") {
        throw whapiHistoryHttpError("messages", status);
      }
      if (classification.kind === "empty") {
        return { items: [], pageSize: count, hasMore: false };
      }
      const items = extractArray(json, ["messages", "data"]).filter(
        (row): row is Record<string, unknown> => asRecord(row) !== null,
      );
      const hasMore = items.length >= count;
      return { items, pageSize: count, hasMore };
    },
  };
}

export function chatIdFromWhapiChatRow(row: Record<string, unknown>): string | null {
  return (
    asString(row.id) ??
    asString(row.chat_id) ??
    asString(row.chatId) ??
    asString(asRecord(row.chat)?.id)
  );
}

export function displayNameFromWhapiChatRow(row: Record<string, unknown>): string | null {
  return (
    asString(row.name) ??
    asString(row.pushname) ??
    asString(row.subject) ??
    asString(asRecord(row.contact)?.name)
  );
}
