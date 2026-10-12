import type { VehicleCardDto } from "../types/vehicle.types.ts";
import { getFleetPrimaryPresentation } from "./fleet-primary-presentation.ts";

export type FleetPrimaryIntent =
  | { type: "set-rental-price" }
  | { type: "car-out"; contractId: string }
  | { type: "open-contract"; contractId: string }
  | { type: "urgent-follow-up"; contractId: string }
  | { type: "urgent-follow-up-choose"; contractIds: string[] }
  | { type: "no-contract" };

type FleetIntentSource = Pick<
  VehicleCardDto,
  "operationalStatus" | "currentRental" | "prePaymentFollowUps"
>;

/**
 * Maps a fleet card primary action to the real Contracts V1 flow.
 */
export function resolveFleetPrimaryIntent(vehicle: FleetIntentSource): FleetPrimaryIntent {
  const presentation = getFleetPrimaryPresentation(vehicle);
  const rental = vehicle.currentRental;

  if (presentation.labelKey === "deliverVehicle" && rental?.status === "paid") {
    return { type: "car-out", contractId: rental.contractId };
  }

  if (presentation.labelKey === "rented") {
    if (rental?.status === "active" || rental?.status === "retout") {
      return { type: "open-contract", contractId: rental.contractId };
    }
    return { type: "no-contract" };
  }

  if (presentation.labelKey === "urgentFollowUp") {
    const offers = vehicle.prePaymentFollowUps ?? [];
    if (offers.length === 0) return { type: "no-contract" };
    if (offers.length === 1) {
      return { type: "urgent-follow-up", contractId: offers[0]!.contractId };
    }
    return {
      type: "urgent-follow-up-choose",
      contractIds: offers.map((row) => row.contractId),
    };
  }

  if (presentation.labelKey === "maintenance") {
    return { type: "no-contract" };
  }

  return { type: "set-rental-price" };
}
