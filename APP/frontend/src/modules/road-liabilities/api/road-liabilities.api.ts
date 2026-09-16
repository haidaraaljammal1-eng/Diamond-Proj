import { apiRequest } from "@/infrastructure/api/client";
import type {
  RoadLiabilitiesListQuery,
  RoadLiabilityDetailDto,
  RoadLiabilityListItemDto,
  RoadLiabilityPageMeta,
  RoadLiabilitySummaryDto,
} from "../types/road-liabilities.types";
import { ROAD_LIABILITIES_PAGE_SIZE } from "../types/road-liabilities.types";
import { buildRoadLiabilitiesQuery } from "../utils/road-liability-filters";

const ROAD_LIABILITIES_PATH = "/road-liabilities";

export function parseRoadLiabilityPageMeta(meta: unknown): RoadLiabilityPageMeta | null {
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

/** `GET /road-liabilities/summary` (Backend permission: `violations.read`). */
export async function getRoadLiabilitiesSummary(): Promise<RoadLiabilitySummaryDto> {
  const response = await apiRequest<RoadLiabilitySummaryDto>(
    `${ROAD_LIABILITIES_PATH}/summary`,
  );
  return response.data;
}

/** `GET /road-liabilities` (Backend permission: `violations.read`). */
export async function getRoadLiabilities(
  params: RoadLiabilitiesListQuery,
): Promise<{ data: RoadLiabilityListItemDto[]; meta: RoadLiabilityPageMeta | null }> {
  const query = buildRoadLiabilitiesQuery({
    ...params,
    pageSize: params.pageSize ?? ROAD_LIABILITIES_PAGE_SIZE,
  });
  const response = await apiRequest<RoadLiabilityListItemDto[]>(
    `${ROAD_LIABILITIES_PATH}?${query}`,
  );
  return { data: response.data, meta: parseRoadLiabilityPageMeta(response.meta) };
}

/** `GET /road-liabilities/:id` (Backend permission: `violations.read`). */
export async function getRoadLiability(id: string): Promise<RoadLiabilityDetailDto> {
  const response = await apiRequest<RoadLiabilityDetailDto>(
    `${ROAD_LIABILITIES_PATH}/${id}`,
  );
  return response.data;
}
