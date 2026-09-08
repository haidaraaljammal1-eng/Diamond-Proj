import type { ChipTone } from "@/shared/components/ui/chip";
import type {
  VehicleCurrentRentalStatus,
  VehicleOperationalStatus,
} from "../types/vehicle.types";

export interface VehicleStatusPresentation {
  translationKey:
    | "statusAvailable"
    | "statusRented"
    | "statusService"
    | "statusReadyForCarOut";
  tone: ChipTone;
}

const STATUS_PRESENTATION: Record<VehicleOperationalStatus, VehicleStatusPresentation> = {
  available: { translationKey: "statusAvailable", tone: "ok" },
  rented: { translationKey: "statusRented", tone: "gold" },
  service: { translationKey: "statusService", tone: "warn" },
};

const PAID_PRESENTATION: VehicleStatusPresentation = {
  translationKey: "statusReadyForCarOut",
  tone: "gold",
};

/**
 * Fleet chip copy. PAID is not a VehicleOperationalStatus — it is read from
 * Backend `currentRental.status` only.
 */
export function getVehicleStatusPresentation(
  status: VehicleOperationalStatus,
  currentRentalStatus?: VehicleCurrentRentalStatus | null,
): VehicleStatusPresentation {
  if (currentRentalStatus === "paid") return PAID_PRESENTATION;
  return STATUS_PRESENTATION[status];
}
