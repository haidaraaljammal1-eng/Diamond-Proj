import { GPS_PAGE_SIZE, type GpsListQuery } from "../types/gps.types.ts";

export function buildGpsListQuery(params: GpsListQuery): string {
  const search = new URLSearchParams();
  search.set("page", String(params.page || 1));
  search.set("pageSize", String(params.pageSize || GPS_PAGE_SIZE));

  const term = params.search?.trim();
  if (term) search.set("search", term);

  if (params.status && params.status !== "all") {
    search.set("status", params.status);
  }

  if (params.trackingStatus && params.trackingStatus !== "all") {
    search.set("trackingStatus", params.trackingStatus);
  }

  return search.toString();
}

export function countGpsActiveFilters(query: Pick<GpsListQuery, "search" | "status" | "trackingStatus">): number {
  let count = 0;
  if (query.search.trim()) count += 1;
  if (query.status !== "all") count += 1;
  if (query.trackingStatus !== "all") count += 1;
  return count;
}
