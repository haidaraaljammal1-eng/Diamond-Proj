import { WHATSAPP_PAGE_SIZE, type WhatsAppListQuery } from "../types/whatsapp.types.ts";

export function buildWhatsAppConversationQuery(params: WhatsAppListQuery): string {
  const search = new URLSearchParams();
  search.set("page", String(params.page || 1));
  search.set("pageSize", String(params.pageSize || WHATSAPP_PAGE_SIZE));
  const term = params.search?.trim();
  if (term) search.set("search", term);
  if (params.unread) search.set("unread", "true");
  return search.toString();
}

export function parseWhatsAppPageMeta(meta: unknown): {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
} | null {
  if (typeof meta !== "object" || meta === null) return null;
  const candidate = meta as Record<string, unknown>;
  const isNumber = (value: unknown): value is number =>
    typeof value === "number" && Number.isFinite(value);
  if (
    !isNumber(candidate.page) ||
    !isNumber(candidate.pageSize) ||
    !isNumber(candidate.total) ||
    !isNumber(candidate.totalPages)
  ) {
    return null;
  }
  return {
    page: candidate.page,
    pageSize: candidate.pageSize,
    total: candidate.total,
    totalPages: candidate.totalPages,
  };
}
