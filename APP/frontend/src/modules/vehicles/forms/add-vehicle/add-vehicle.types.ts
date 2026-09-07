import type { CreateVehiclePayload } from "../../types/vehicle.types";
import type { AddVehicleFormValues } from "./add-vehicle.schema";

function parseOptionalInt(value: string): number | undefined {
  const trimmed = value.trim();
  if (!trimmed) return undefined;
  const parsed = Number(trimmed);
  return Number.isInteger(parsed) ? parsed : undefined;
}

export function toCreateVehiclePayload(values: AddVehicleFormValues): CreateVehiclePayload {
  const modelYear = parseOptionalInt(values.modelYear);
  const dailyRate = parseOptionalInt(values.dailyRate);
  const monthlyRate = parseOptionalInt(values.monthlyRate);

  return {
    vehicleName: values.vehicleName.trim(),
    ...(modelYear !== undefined ? { modelYear } : {}),
    ...(values.plateNumber.trim() ? { plateNumber: values.plateNumber.trim() } : {}),
    ...(values.color.trim() ? { color: values.color.trim() } : {}),
    ...(dailyRate !== undefined ? { dailyRate } : {}),
    ...(monthlyRate !== undefined ? { monthlyRate } : {}),
    ...(values.vin.trim() ? { vin: values.vin.trim() } : {}),
  };
}
