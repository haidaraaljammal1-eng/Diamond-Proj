import { apiRequest } from "@/infrastructure/api/client";
import type { VehicleCardDto, VehicleDetailDto, VehiclesListQuery } from "../types/vehicle.types";
import { parsePageMeta, VEHICLES_MAX_PAGE_SIZE } from "./vehicles.api.types";
import type { PageMeta } from "./vehicles.api.types";
import { buildVehiclesQuery } from "../utils/vehicle-filters";

const VEHICLES_PATH = "/vehicles";

/** `GET /vehicles` (Backend permission: `vehicles.read`). */
export async function getVehicles(
  params: VehiclesListQuery = {},
): Promise<{ data: VehicleCardDto[]; meta: PageMeta | null }> {
  const query = buildVehiclesQuery({
    ...params,
    pageSize: params.pageSize ?? VEHICLES_MAX_PAGE_SIZE,
  });
  const response = await apiRequest<VehicleCardDto[]>(
    `${VEHICLES_PATH}?${query}`,
  );
  return { data: response.data, meta: parsePageMeta(response.meta) };
}

/** `GET /vehicles/:id` (Backend permission: `vehicles.read`). */
export async function getVehicle(id: number): Promise<VehicleDetailDto> {
  const response = await apiRequest<VehicleDetailDto>(`${VEHICLES_PATH}/${id}`);
  return response.data;
}
