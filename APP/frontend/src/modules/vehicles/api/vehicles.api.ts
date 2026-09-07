import { apiRequest } from "@/infrastructure/api/client";
import type {
  CreateVehiclePayload,
  UpdateVehicleRatesPayload,
  VehicleCardDto,
  VehicleDetailDto,
  VehiclePublicDto,
  VehiclesListQuery,
} from "../types/vehicle.types";
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

/** `POST /vehicles` (Backend permission: `vehicles.manage`). */
export async function createVehicle(
  payload: CreateVehiclePayload,
): Promise<VehiclePublicDto> {
  const response = await apiRequest<VehiclePublicDto>(VEHICLES_PATH, {
    method: "POST",
    body: payload,
  });
  return response.data;
}

/** `PUT /vehicles/:id` — partial default-rate update (`vehicles.manage`). */
export async function updateVehicleRates(
  id: number,
  payload: UpdateVehicleRatesPayload,
): Promise<VehiclePublicDto> {
  const response = await apiRequest<VehiclePublicDto>(`${VEHICLES_PATH}/${id}`, {
    method: "PUT",
    body: payload,
  });
  return response.data;
}

/** `POST /vehicles/:id/deactivate` — fleet delete (`vehicles.manage`). */
export async function deactivateVehicle(id: number): Promise<VehiclePublicDto> {
  const response = await apiRequest<VehiclePublicDto>(
    `${VEHICLES_PATH}/${id}/deactivate`,
    { method: "POST" },
  );
  return response.data;
}
