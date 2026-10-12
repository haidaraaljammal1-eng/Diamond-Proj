import type { VehicleCardDto } from "../types/vehicle.types";

export type FleetPrimaryLabelKey =
  | "available"
  | "deliverVehicle"
  | "rented"
  | "urgentFollowUp"
  | "maintenance";

export type FleetPrimaryPresentation = {
  labelKey: FleetPrimaryLabelKey;
  disabled: boolean;
  urgent: boolean;
  deliver: boolean;
};

type Source = Pick<
  VehicleCardDto,
  "operationalStatus" | "currentRental" | "prePaymentFollowUps" | "isActive"
>;

/**
 * Approved fleet card primary labels — blocking rental context wins over pre-payment follow-up.
 */
export function getFleetPrimaryPresentation(vehicle: Source): FleetPrimaryPresentation {
  if (vehicle.isActive === false) {
    return { labelKey: "available", disabled: true, urgent: false, deliver: false };
  }

  if (vehicle.operationalStatus === "service") {
    return { labelKey: "maintenance", disabled: true, urgent: false, deliver: false };
  }

  const rental = vehicle.currentRental;

  if (rental?.status === "paid" && vehicle.operationalStatus === "available") {
    return { labelKey: "deliverVehicle", disabled: false, urgent: false, deliver: true };
  }

  if (vehicle.operationalStatus === "rented") {
    return { labelKey: "rented", disabled: false, urgent: false, deliver: false };
  }

  if (
    vehicle.operationalStatus === "available" &&
    !rental &&
    (vehicle.prePaymentFollowUps?.length ?? 0) > 0
  ) {
    return { labelKey: "urgentFollowUp", disabled: false, urgent: true, deliver: false };
  }

  return { labelKey: "available", disabled: false, urgent: false, deliver: false };
}
