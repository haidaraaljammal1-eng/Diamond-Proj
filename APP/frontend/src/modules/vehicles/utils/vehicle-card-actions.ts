import type { VehicleCardDto, VehicleOperationalStatus } from "../types/vehicle.types";

export interface VehicleCardActions {
  showSetRentalPrice: boolean;
  showReturnLink: boolean;
  showGps: boolean;
  showEditRates: boolean;
  showDelete: boolean;
  showMaintenance: boolean;
}

const NO_ACTIONS: VehicleCardActions = {
  showSetRentalPrice: false,
  showReturnLink: false,
  showGps: false,
  showEditRates: false,
  showDelete: false,
  showMaintenance: false,
};

/**
 * Central fleet card action policy — operational status + permissions are the
 * only inputs. Every card uses this helper so free-text and legacy vehicles
 * render identically.
 */
export function getVehicleCardActions(
  vehicle: Pick<VehicleCardDto, "operationalStatus" | "isActive">,
  canManage: boolean,
): VehicleCardActions {
  const isFleetActive = vehicle.isActive !== false;
  if (!isFleetActive) return NO_ACTIONS;

  switch (vehicle.operationalStatus) {
    case "available":
      return {
        showSetRentalPrice: true,
        showReturnLink: false,
        showGps: false,
        showEditRates: canManage,
        showDelete: canManage,
        showMaintenance: false,
      };
    case "rented":
      return {
        showSetRentalPrice: false,
        showReturnLink: true,
        showGps: true,
        showEditRates: false,
        showDelete: false,
        showMaintenance: false,
      };
    case "service":
      return {
        showSetRentalPrice: false,
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
