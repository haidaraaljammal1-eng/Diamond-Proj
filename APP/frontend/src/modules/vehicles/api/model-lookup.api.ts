import { apiRequest } from "@/infrastructure/api/client";

const MODEL_LOOKUP_PATH = "/lookups/vehicle-models";

/** Backend cap for every lookup endpoint (`LookupBaseQuery.limit.max`). */
export const MODEL_LOOKUP_MAX_LIMIT = 50;

/** `GET /lookups/vehicle-models` item — id + label + machine key. */
export interface VehicleModelLookupItem {
  id: number;
  label: string;
  code: string;
  modelYear: number | null;
}

/**
 * Vehicle models for the fleet filter bar.
 *
 * `GET /lookups/vehicle-models` (Backend permissions, any-of:
 * `reference_data.lookup`, `vehicle_models.read`) — the lookup-shaped endpoint,
 * so a dropdown never pulls the full master-data payload.
 */
export async function lookupVehicleModels(
  search?: string,
): Promise<VehicleModelLookupItem[]> {
  const query = new URLSearchParams({ limit: String(MODEL_LOOKUP_MAX_LIMIT) });
  if (search) query.set("search", search);

  const response = await apiRequest<VehicleModelLookupItem[]>(
    `${MODEL_LOOKUP_PATH}?${query.toString()}`,
  );
  return response.data;
}
