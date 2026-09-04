import { z } from "zod";
import type { PageMeta } from "src/lib/http/response";

export const DEFAULT_PAGE_SIZE = 20;
export const MAX_PAGE_SIZE = 100;

/** Reusable pagination query. `pageSize` is bounded — no unbounded lists. */
export const PaginationQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(MAX_PAGE_SIZE).default(DEFAULT_PAGE_SIZE),
});
export type PaginationQuery = z.infer<typeof PaginationQuerySchema>;

export type SortDirection = "asc" | "desc";

/**
 * Parse a `field:direction` sort string against an ALLOW-LIST. Raw client sort
 * is never passed to Prisma — unknown fields fall back to the default.
 */
export function parseSort(
  input: string | undefined,
  allowedFields: readonly string[],
  fallback: { field: string; direction: SortDirection },
): { field: string; direction: SortDirection } {
  if (!input) return fallback;
  const [rawField, rawDir] = input.split(":");
  const field = rawField && allowedFields.includes(rawField) ? rawField : fallback.field;
  const direction: SortDirection =
    rawDir === "asc" || rawDir === "desc" ? rawDir : fallback.direction;
  return { field, direction };
}

export function buildPageMeta(page: number, pageSize: number, total: number): PageMeta {
  return { page, pageSize, total, totalPages: Math.max(1, Math.ceil(total / pageSize)) };
}

/**
 * Generic paginate helper — runs count + page query in parallel and returns the
 * standard `{ data, meta }` shape. Callers own the concrete Prisma queries.
 */
export async function paginate<T>(params: {
  page: number;
  pageSize: number;
  count: () => Promise<number>;
  findMany: (skip: number, take: number) => Promise<T[]>;
}): Promise<{ data: T[]; meta: PageMeta }> {
  const { page, pageSize } = params;
  const skip = (page - 1) * pageSize;
  const [total, rows] = await Promise.all([
    params.count(),
    params.findMany(skip, pageSize),
  ]);
  return { data: rows, meta: buildPageMeta(page, pageSize, total) };
}
