import type { PageMeta } from "../api/vehicles.api.types";

/** Whether Fleet pagination controls should render (more than one page). */
export function shouldShowFleetPagination(meta: PageMeta | null): boolean {
  return meta != null && meta.totalPages > 1;
}

export function isFleetPreviousDisabled(
  meta: PageMeta,
  isLoading = false,
): boolean {
  return isLoading || meta.page <= 1;
}

export function isFleetNextDisabled(meta: PageMeta, isLoading = false): boolean {
  return isLoading || meta.page >= meta.totalPages;
}

/**
 * When a mutation shrinks `totalPages` below the current page, return the last
 * valid page so the Fleet can refetch instead of showing a false empty state.
 */
export function resolveFleetPageAfterFetch(
  requestedPage: number,
  meta: PageMeta | null,
  dataLength: number,
): number | null {
  if (!meta || meta.total === 0) return null;

  if (meta.totalPages > 0 && requestedPage > meta.totalPages) {
    return meta.totalPages;
  }

  if (dataLength === 0 && requestedPage > 1 && meta.total > 0) {
    return Math.max(1, meta.totalPages);
  }

  return null;
}
