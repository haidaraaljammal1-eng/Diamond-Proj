import type { VehicleCardDto } from "../types/vehicle.types";

export type FleetPrimaryIntent =
  | { type: "set-rental-price" }
  | { type: "car-out"; contractId: string }
  | { type: "generate-return-link"; contractId: string }
  | { type: "open-contract"; contractId: string }
  | { type: "reconcile"; contractId: string }
  | { type: "maintenance" }
  | { type: "no-contract" };

type FleetIntentSource = Pick<VehicleCardDto, "operationalStatus" | "currentRental">;

/**
 * Maps a fleet card primary action to the real Contracts V1 flow.
 * `currentRental.status` is Backend authority — never inferred from chips.
 */
export function resolveFleetPrimaryIntent(vehicle: FleetIntentSource): FleetPrimaryIntent {
  const rental = vehicle.currentRental;

  if (rental?.status === "paid") {
    return { type: "car-out", contractId: rental.contractId };
  }

  if (vehicle.operationalStatus === "service") {
    return { type: "maintenance" };
  }

  if (vehicle.operationalStatus === "rented") {
    if (rental?.status === "active") {
      return { type: "generate-return-link", contractId: rental.contractId };
    }
    if (rental?.status === "retout") {
      return { type: "open-contract", contractId: rental.contractId };
    }
    return { type: "no-contract" };
  }

  return { type: "set-rental-price" };
}
