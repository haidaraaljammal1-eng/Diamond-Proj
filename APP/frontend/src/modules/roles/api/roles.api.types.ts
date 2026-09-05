/** Backend pagination meta (`PageMetaSchema` in `lib/http/response.ts`). */
export interface PageMeta {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}

/** Backend `pageSize` cap (`MAX_PAGE_SIZE` in `lib/http/pagination.ts`). */
export const ROLES_MAX_PAGE_SIZE = 100;

export function parsePageMeta(meta: unknown): PageMeta | null {
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
