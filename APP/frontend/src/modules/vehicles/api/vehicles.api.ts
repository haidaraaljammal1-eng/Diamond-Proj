import { apiRequest } from "@/infrastructure/api/client";
import type { VehicleCardDto, VehicleDetailDto, VehiclesListQuery } from "../types/vehicle.types";
import { parsePageMeta, VEHICLES_MAX_PAGE_SIZE } from "./vehicles.api.types";
import type { PageMeta } from "./vehicles.api.types";

const VEHICLES_PATH = "/vehicles";

function buildQuery(params: VehiclesListQuery): string {
  const search = new URLSearchParams();
  search.set("page", String(params.page ?? 1));
  search.set("pageSize", String(params.pageSize ?? VEHICLES_MAX_PAGE_SIZE));
  if (params.status && params.status !== "all") {
    search.set("status", params.status);
  }
  return search.toString();
}

/** `GET /vehicles` (Backend permission: `vehicles.read`). */
export async function getVehicles(
  params: VehiclesListQuery = {},
): Promise<{ data: VehicleCardDto[]; meta: PageMeta | null }> {
  const response = await apiRequest<VehicleCardDto[]>(
    `${VEHICLES_PATH}?${buildQuery(params)}`,
  );
  return { data: response.data, meta: parsePageMeta(response.meta) };
}

/** `GET /vehicles/:id` (Backend permission: `vehicles.read`). */
export async function getVehicle(id: number): Promise<VehicleDetailDto> {
  const response = await apiRequest<VehicleDetailDto>(`${VEHICLES_PATH}/${id}`);
  return response.data;
}
