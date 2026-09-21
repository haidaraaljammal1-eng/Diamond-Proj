import type {
  RoadLiabilitiesListQuery,
  RoadLiabilityListItemDto,
  RoadLiabilityWorkState,
} from "../types/road-liabilities.types.ts";
import {
  NEEDS_ATTENTION_WORK_STATES,
  ROAD_LIABILITIES_PAGE_SIZE,
} from "../types/road-liabilities.types.ts";
import { authorityFromType } from "./road-liability-status.ts";

export const DEFAULT_ROAD_LIABILITIES_QUERY: RoadLiabilitiesListQuery = {
  search: "",
  companyId: null,
  queue: "all",
  channel: "all",
  type: "all",
  sourceKey: "all",
  confirmationStatus: "all",
  attributionStatus: "all",
  collectionStatus: "all",
  from: "",
  to: "",
  page: 1,
  pageSize: ROAD_LIABILITIES_PAGE_SIZE,
};

/** Date input `YYYY-MM-DD` → Backend ISO instant. */
export function dateInputToIso(value: string, endOfDay = false): string {
  const trimmed = value.trim();
  if (!trimmed) return "";
  return endOfDay ? `${trimmed}T23:59:59.000Z` : `${trimmed}T00:00:00.000Z`;
}

/**
 * Builds `GET /road-liabilities` query string.
 * Applied search is the only search that is sent — never a draft.
 */
export function buildRoadLiabilitiesQuery(params: RoadLiabilitiesListQuery): string {
  const search = new URLSearchParams();
  search.set("page", String(params.page || 1));
  search.set("pageSize", String(params.pageSize || ROAD_LIABILITIES_PAGE_SIZE));

  const term = params.search?.trim();
  if (term) search.set("search", term);

  // Company scope is resolved in the Backend (Contract first, then Vehicle), so the
  // frontend sends an id and never reproduces the precedence.
  if (params.companyId != null) {
    search.set("companyId", String(params.companyId));
  }
  if (params.queue && params.queue !== "all") {
    search.set("queue", params.queue);
  }
  if (params.channel && params.channel !== "all") {
    search.set("channel", params.channel);
  }
  if (params.type && params.type !== "all") {
    search.set("type", params.type);
  }
  if (params.sourceKey && params.sourceKey !== "all") {
    search.set("sourceKey", params.sourceKey);
  }
  if (params.confirmationStatus && params.confirmationStatus !== "all") {
    search.set("confirmationStatus", params.confirmationStatus);
  }
  if (params.attributionStatus && params.attributionStatus !== "all") {
    search.set("attributionStatus", params.attributionStatus);
  }
  if (params.collectionStatus && params.collectionStatus !== "all") {
    search.set("collectionStatus", params.collectionStatus);
  }
  if (params.from?.trim()) {
    search.set("occurredFrom", dateInputToIso(params.from.trim()));
  }
  if (params.to?.trim()) {
    search.set("occurredTo", dateInputToIso(params.to.trim(), true));
  }

  return search.toString();
}

export function countRoadLiabilityAdvancedFilters(
  query: Pick<
    RoadLiabilitiesListQuery,
    "type" | "sourceKey" | "confirmationStatus" | "attributionStatus" | "collectionStatus"
  >,
): number {
  let count = 0;
  if (query.type !== "all") count += 1;
  if (query.sourceKey !== "all") count += 1;
  if (query.confirmationStatus !== "all") count += 1;
  if (query.attributionStatus !== "all") count += 1;
  if (query.collectionStatus !== "all") count += 1;
  return count;
}

function itemMatchesSource(
  item: RoadLiabilityListItemDto,
  sourceKey: RoadLiabilitiesListQuery["sourceKey"],
): boolean {
  if (sourceKey === "all") return true;
  if (sourceKey === "GPS_INFERENCE") return item.prediction.predictedByGps;
  if (item.source === sourceKey) return true;
  return false;
}

function itemMatchesQueue(
  item: RoadLiabilityListItemDto,
  queue: RoadLiabilitiesListQuery["queue"],
): boolean {
  if (queue === "all") return true;
  if (queue === "collectible") return item.workState === "collectible";
  if (queue === "settled") return item.workState === "settled";
  return (NEEDS_ATTENTION_WORK_STATES as RoadLiabilityWorkState[]).includes(item.workState);
}

function inDateRange(occurredAt: string, from: string, to: string): boolean {
  const time = Date.parse(occurredAt);
  if (!Number.isFinite(time)) return true;
  if (from.trim()) {
    const start = Date.parse(dateInputToIso(from.trim()));
    if (Number.isFinite(start) && time < start) return false;
  }
  if (to.trim()) {
    const end = Date.parse(dateInputToIso(to.trim(), true));
    if (Number.isFinite(end) && time > end) return false;
  }
  return true;
}

/** In-memory filter for Demo Simulation overlay only — never used on live pages. */
export function filterSimulatedLiabilities(
  items: RoadLiabilityListItemDto[],
  query: RoadLiabilitiesListQuery,
): RoadLiabilityListItemDto[] {
  const term = query.search.trim().toLowerCase();
  return items.filter((item) => {
    // Simulated liabilities carry no company, so a company scope excludes them
    // rather than inventing one for the overlay.
    if (query.companyId != null && item.company?.id !== query.companyId) return false;
    if (!itemMatchesQueue(item, query.queue)) return false;
    if (query.channel !== "all" && authorityFromType(item.type) !== query.channel) {
      return false;
    }
    if (query.type !== "all" && item.type !== query.type) return false;
    if (!itemMatchesSource(item, query.sourceKey)) return false;
    if (
      query.confirmationStatus !== "all" &&
      item.confirmationStatus !== query.confirmationStatus
    ) {
      return false;
    }
    if (
      query.attributionStatus !== "all" &&
      item.attributionStatus !== query.attributionStatus
    ) {
      return false;
    }
    if (
      query.collectionStatus !== "all" &&
      item.collectionStatus !== query.collectionStatus
    ) {
      return false;
    }
    if (!inDateRange(item.occurredAt, query.from, query.to)) return false;
    if (!term) return true;
    const haystack = [
      item.vehicle?.displayName,
      item.vehicle?.plateNumber,
      item.contract?.contractNumber,
      item.customer?.displayName,
      item.authoritative.externalReference,
      item.locationLabel,
      item.gate?.nameEn,
      item.gate?.nameAr,
      item.gate?.externalGateCode,
    ]
      .filter(Boolean)
      .join(" ")
      .toLowerCase();
    return haystack.includes(term);
  });
}

export function paginateItems<T>(
  items: T[],
  page: number,
  pageSize: number,
): { data: T[]; page: number; pageSize: number; total: number; totalPages: number } {
  const size = pageSize || ROAD_LIABILITIES_PAGE_SIZE;
  const total = items.length;
  const totalPages = Math.max(1, Math.ceil(total / size) || 1);
  const safePage = Math.min(Math.max(page || 1, 1), totalPages);
  const start = (safePage - 1) * size;
  return {
    data: items.slice(start, start + size),
    page: safePage,
    pageSize: size,
    total,
    totalPages,
  };
}
