import { apiRequest } from "@/infrastructure/api/client";
import type {
  GpsListQuery,
  GpsMapPointDto,
  GpsPageMeta,
  GpsSummaryDto,
  GpsVehicleDetailDto,
  GpsVehicleListItemDto,
} from "../types/gps.types";
import { GPS_PAGE_SIZE } from "../types/gps.types";
import { buildGpsListQuery } from "../utils/gps-query";

const GPS_PATH = "/gps";

export function parseGpsPageMeta(meta: unknown): GpsPageMeta | null {
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

/** `GET /gps/summary` (Backend permission: `gps.read`). */
export async function getGpsSummary(): Promise<GpsSummaryDto> {
  const response = await apiRequest<GpsSummaryDto>(`${GPS_PATH}/summary`);
  return response.data;
}

/** `GET /gps/vehicles` (Backend permission: `gps.read`). */
export async function getGpsVehicles(
  params: GpsListQuery,
): Promise<{ data: GpsVehicleListItemDto[]; meta: GpsPageMeta | null }> {
  const query = buildGpsListQuery({
    ...params,
    pageSize: params.pageSize ?? GPS_PAGE_SIZE,
  });
  const response = await apiRequest<GpsVehicleListItemDto[]>(
    `${GPS_PATH}/vehicles?${query}`,
  );
  return { data: response.data, meta: parseGpsPageMeta(response.meta) };
}

/** `GET /gps/map-points` (Backend permission: `gps.read`). */
export async function getGpsMapPoints(): Promise<GpsMapPointDto[]> {
  const response = await apiRequest<GpsMapPointDto[]>(`${GPS_PATH}/map-points`);
  return response.data;
}

/** `GET /gps/vehicles/:vehicleId` (Backend permission: `gps.read`). */
export async function getGpsVehicle(vehicleId: number): Promise<GpsVehicleDetailDto> {
  const response = await apiRequest<GpsVehicleDetailDto>(
    `${GPS_PATH}/vehicles/${vehicleId}`,
  );
  return response.data;
}
