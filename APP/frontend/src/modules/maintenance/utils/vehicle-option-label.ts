import type { MaintenanceVehicleDto } from "../types/maintenance.types";

export interface VehicleOptionSource {
  id: number;
  displayName: string;
  plateNumber: string | null;
  modelYear: number | null;
  color: string | null;
}

export function vehicleOptionLabel(vehicle: VehicleOptionSource): string {
  const plate = vehicle.plateNumber?.trim();
  if (plate) return `${vehicle.displayName} · ${plate}`;
  return vehicle.displayName;
}

export function vehicleOptionHint(vehicle: VehicleOptionSource): string | undefined {
  const parts: string[] = [];
  if (vehicle.modelYear) parts.push(String(vehicle.modelYear));
  if (vehicle.color?.trim()) parts.push(vehicle.color.trim());
  return parts.length ? parts.join(" · ") : undefined;
}

export function plateOrFallback(
  vehicle: Pick<MaintenanceVehicleDto, "plateNumber"> | null | undefined,
  empty = "—",
): string {
  const plate = vehicle?.plateNumber?.trim();
  return plate && plate.length > 0 ? plate : empty;
}
