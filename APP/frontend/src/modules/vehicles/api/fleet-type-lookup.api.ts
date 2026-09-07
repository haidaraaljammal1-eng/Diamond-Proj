import { apiRequest } from "@/infrastructure/api/client";

export interface FleetVehicleTypeOption {
  value: string;
  label: string;
}

const FILTER_OPTIONS_PATH = "/vehicles/filter-options";

/** `GET /vehicles/filter-options` (Backend permission: `vehicles.read`). */
export async function getFleetVehicleTypeOptions(): Promise<FleetVehicleTypeOption[]> {
  const response = await apiRequest<FleetVehicleTypeOption[]>(FILTER_OPTIONS_PATH);
  return response.data;
}
