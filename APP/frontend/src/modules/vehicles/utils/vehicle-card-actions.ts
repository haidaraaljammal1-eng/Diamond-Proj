import type {
  VehicleCardDto,
  VehicleCurrentRentalDto,
  VehicleOperationalStatus,
} from "../types/vehicle.types";

export interface VehicleCardActions {
  showSetRentalPrice: boolean;
  showCarOut: boolean;
  showReturnLink: boolean;
  showGps: boolean;
  showEditRates: boolean;
  showDelete: boolean;
  showMaintenance: boolean;
}

const NO_ACTIONS: VehicleCardActions = {
  showSetRentalPrice: false,
  showCarOut: false,
  showReturnLink: false,
  showGps: false,
  showEditRates: false,
  showDelete: false,
  showMaintenance: false,
};

type VehicleActionSource = Pick<VehicleCardDto, "operationalStatus" | "isActive"> & {
  currentRental?: VehicleCurrentRentalDto | null;
};

function isPaidReservation(vehicle: VehicleActionSource): boolean {
  return vehicle.currentRental?.status === "paid";
}

/**
 * Central fleet card action policy. Operational status, currentRental.status
 * (Backend authority), and permissions are the only inputs.
 */
export function getVehicleCardActions(
  vehicle: VehicleActionSource,
  canManage: boolean,
): VehicleCardActions {
  const isFleetActive = vehicle.isActive !== false;
  if (!isFleetActive) return NO_ACTIONS;

  if (vehicle.operationalStatus === "available" && isPaidReservation(vehicle)) {
    return {
      showSetRentalPrice: false,
      showCarOut: true,
      showReturnLink: false,
      showGps: false,
      showEditRates: false,
      showDelete: false,
      showMaintenance: false,
    };
  }

  switch (vehicle.operationalStatus) {
    case "available":
      return {
        showSetRentalPrice: true,
        showCarOut: false,
        showReturnLink: false,
        showGps: false,
        showEditRates: canManage,
        showDelete: canManage,
        showMaintenance: false,
      };
    case "rented":
      return {
        showSetRentalPrice: false,
        showCarOut: false,
        showReturnLink: true,
        showGps: true,
        showEditRates: false,
        showDelete: false,
        showMaintenance: false,
      };
    case "service":
      return {
        showSetRentalPrice: false,
        showCarOut: false,
        showReturnLink: false,
        showGps: false,
        showEditRates: false,
        showDelete: false,
        showMaintenance: true,
      };
    default:
      return NO_ACTIONS;
  }
}

/** @deprecated Use getVehicleCardActions — kept for transitional imports. */
export function shouldShowEditRates(
  canManage: boolean,
  isActive: boolean,
  operationalStatus: VehicleOperationalStatus = "available",
): boolean {
  return getVehicleCardActions(
    { operationalStatus, isActive },
    canManage,
  ).showEditRates;
}

/** @deprecated Use getVehicleCardActions — kept for transitional imports. */
export function shouldShowDelete(
  canManage: boolean,
  isActive: boolean,
  operationalStatus: VehicleOperationalStatus = "available",
): boolean {
  return getVehicleCardActions(
    { operationalStatus, isActive },
    canManage,
  ).showDelete;
}
