import { apiRequest } from "@/infrastructure/api/client";
import type {
  GpsListQuery,
  GpsHistoryRange,
  GpsMapPointDto,
  GpsPageMeta,
  GpsSummaryDto,
  GpsVehicleHistoryDto,
  GpsVehicleDetailDto,
  GpsVehicleListItemDto,
  GpsMileageSummaryDto,
  GpsOverspeedDto,
  GpsVehicleHealthDto,
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

/** `GET /gps/vehicles/:vehicleId/history` (Backend permission: `gps.read`). */
export async function getGpsVehicleHistory(
  vehicleId: number,
  range: GpsHistoryRange,
  signal?: AbortSignal,
): Promise<GpsVehicleHistoryDto> {
  const query = new URLSearchParams({
    from: range.from,
    to: range.to,
  });
  const response = await apiRequest<GpsVehicleHistoryDto>(
    `${GPS_PATH}/vehicles/${vehicleId}/history?${query.toString()}`,
    { signal },
  );
  return response.data;
}

export async function getGpsVehicleMileageSummary(
  vehicleId: number,
): Promise<GpsMileageSummaryDto> {
  const response = await apiRequest<GpsMileageSummaryDto>(
    `${GPS_PATH}/vehicles/${vehicleId}/mileage-summary`,
  );
  return response.data;
}

export async function getGpsVehicleOverspeed(
  vehicleId: number,
  date: string,
  thresholdKph: number,
): Promise<GpsOverspeedDto> {
  const query = new URLSearchParams({ date, thresholdKph: String(thresholdKph) });
  const response = await apiRequest<GpsOverspeedDto>(
    `${GPS_PATH}/vehicles/${vehicleId}/overspeed?${query.toString()}`,
  );
  return response.data;
}

/** `GET /gps/vehicles/:vehicleId/health` (Backend permission: `gps.read`). */
export async function getGpsVehicleHealth(vehicleId: number): Promise<GpsVehicleHealthDto> {
  const response = await apiRequest<GpsVehicleHealthDto>(
    `${GPS_PATH}/vehicles/${vehicleId}/health`,
  );
  return response.data;
}
