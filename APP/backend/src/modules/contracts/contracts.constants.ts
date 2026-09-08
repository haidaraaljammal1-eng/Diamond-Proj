import type { ContractStatus } from "@prisma/client";

/** Opaque public-link lifetimes (seconds), from the Diamond Demo. */
export const CONTRACT_LINK_TTL_SECONDS = {
  RENTAL: 72 * 60 * 60,
  RETURN: 24 * 60 * 60,
  RENEWAL: 48 * 60 * 60,
} as const;

export const CONTRACT_CURRENCY = "AED";
export const CONTRACT_TERMS_VERSION = "diamond-rental-terms-v1";
export const CONTRACT_NUMBER_PREFIX = "DE";

export const VEHICLE_RENTAL_LOCK_NS = "vehicle_rental";
export const CONTRACT_NUMBER_LOCK_NS = "contract_number";

/**
 * Statuses that allocate the vehicle to this contract.
 * AWAITING / FORM / SIGNED do NOT lock the vehicle (another offer may still
 * be created; the first to reach PAID wins under the advisory lock).
 * CLOSED is never blocking.
 */
export const BLOCKING_CONTRACT_STATUSES: readonly ContractStatus[] = [
  "PAID",
  "ACTIVE",
  "RETOUT",
  "REVIEW",
] as const;

/**
 * Blocking rental context shown on Vehicles as currentRental.
 * PAID is included: the vehicle stays AVAILABLE until Car-Out, but it is
 * reserved and must not look free on the fleet page.
 */
export const CURRENT_RENTAL_STATUSES: readonly ContractStatus[] = [
  "PAID",
  "ACTIVE",
  "RETOUT",
  "REVIEW",
] as const;

export const INSPECTION_ANGLES = [
  "FRONT",
  "REAR",
  "RIGHT_SIDE",
  "LEFT_SIDE",
  "FRONT_PLATE",
  "REAR_PLATE",
  "INTERIOR_ODOMETER",
  "TIRES",
] as const;

export const FUEL_LEVELS = ["F", "7/8", "3/4", "5/8", "1/2", "3/8", "1/4", "1/8", "E"] as const;

export const ALLOWED_TRANSITIONS: Record<ContractStatus, readonly ContractStatus[]> = {
  AWAITING: ["FORM"],
  FORM: ["SIGNED"],
  SIGNED: ["PAID"],
  PAID: ["ACTIVE"],
  ACTIVE: ["RETOUT"],
  RETOUT: ["REVIEW"],
  REVIEW: ["CLOSED"],
  CLOSED: [],
};
