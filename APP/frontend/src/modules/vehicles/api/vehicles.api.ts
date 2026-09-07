import { env } from "@/config/env";
import { apiRequest } from "@/infrastructure/api/client";
import { ApiRequestError } from "@/infrastructure/api/errors";
import type { ApiErrorResponse, ApiResponse } from "@/infrastructure/api/types";
import type {
  CreateVehiclePayload,
  UpdateVehicleRatesPayload,
  VehicleCardDto,
  VehicleDetailDto,
  VehicleImageDto,
  VehiclePublicDto,
  VehiclesListQuery,
} from "../types/vehicle.types";
import { parsePageMeta, VEHICLES_MAX_PAGE_SIZE } from "./vehicles.api.types";
import type { PageMeta } from "./vehicles.api.types";
import { buildVehiclesQuery } from "../utils/vehicle-filters";

const VEHICLES_PATH = "/vehicles";

export { VEHICLE_PHOTO_ACCEPT } from "../forms/add-vehicle/vehicle-photo-picker.utils";

async function getAccessToken(): Promise<string | undefined> {
  if (typeof window === "undefined") return undefined;
  const { getSession } = await import("next-auth/react");
  return (await getSession())?.accessToken;
}

function isApiErrorResponse(value: unknown): value is ApiErrorResponse {
  if (typeof value !== "object" || value === null || !("error" in value))
    return false;
  const error = value.error;
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    "message" in error
  );
}

async function readJson(response: Response): Promise<unknown> {
  const text = await response.text();
  if (!text) return undefined;
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return undefined;
  }
}

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

/** `POST /vehicles/:id/photos` (Backend permission: `vehicles.manage`). */
export async function uploadVehiclePhoto(
  vehicleId: number,
  file: File,
): Promise<VehicleImageDto> {
  const formData = new FormData();
  formData.append("file", file);

  const accessToken = await getAccessToken();
  const response = await fetch(
    `${env.apiUrl}${VEHICLES_PATH}/${vehicleId}/photos`,
    {
      method: "POST",
      credentials: "include",
      headers: {
        Accept: "application/json",
        ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
      },
      body: formData,
    },
  );

  const payload = await readJson(response);
  if (!response.ok) {
    if (isApiErrorResponse(payload))
      throw new ApiRequestError(payload.error, response.status);
    throw new ApiRequestError(
      {
        code: `HTTP_${response.status}`,
        message: response.statusText || "Request failed",
      },
      response.status,
    );
  }

  if (typeof payload !== "object" || payload === null || !("data" in payload)) {
    throw new ApiRequestError(
      { code: "INVALID_RESPONSE", message: "Invalid API response" },
      response.status,
    );
  }

  return (payload as ApiResponse<VehicleImageDto>).data;
}

/** `DELETE /vehicles/:id/photos/:photoId` (Backend permission: `vehicles.manage`). */
export async function deleteVehiclePhoto(
  vehicleId: number,
  photoId: string,
): Promise<void> {
  await apiRequest(`${VEHICLES_PATH}/${vehicleId}/photos/${photoId}`, {
    method: "DELETE",
  });
}

/** `PUT /vehicles/:id` — partial default-rate update (`vehicles.manage`). */
export async function updateVehicleRates(
  id: number,
  payload: UpdateVehicleRatesPayload,
): Promise<VehiclePublicDto> {
  const response = await apiRequest<VehiclePublicDto>(
    `${VEHICLES_PATH}/${id}`,
    {
      method: "PUT",
      body: payload,
    },
  );
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
