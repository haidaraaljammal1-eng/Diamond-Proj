/** Backend pagination meta (`PageMetaSchema`). */
export interface PageMeta {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}

export const MAINTENANCE_PAGE_SIZE = 20;
export const MAINTENANCE_HISTORY_PAGE_SIZE = 50;

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
