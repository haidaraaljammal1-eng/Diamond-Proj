import type { ChipTone } from "@/shared/components/ui/chip";
import type { VehicleOperationalStatus } from "../types/vehicle.types";

export interface VehicleStatusPresentation {
  translationKey: "statusAvailable" | "statusRented" | "statusService";
  tone: ChipTone;
}

const STATUS_PRESENTATION: Record<VehicleOperationalStatus, VehicleStatusPresentation> = {
  available: { translationKey: "statusAvailable", tone: "ok" },
  rented: { translationKey: "statusRented", tone: "gold" },
  service: { translationKey: "statusService", tone: "warn" },
};

export function getVehicleStatusPresentation(
  status: VehicleOperationalStatus,
): VehicleStatusPresentation {
  return STATUS_PRESENTATION[status];
}
