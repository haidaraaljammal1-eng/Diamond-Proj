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
export const OFFICE_DISPLAY_NAME_DEFAULT = "Diamond Rent Car";


export const VEHICLE_RENTAL_LOCK_NS = "vehicle_rental";
export const CONTRACT_NUMBER_LOCK_NS = "contract_number";
export const CONTRACT_PAYMENT_LOCK_NS = "contract_payment";
export const CONTRACT_LICENSE_LOCK_NS = "contract_license";
export const CONTRACT_PASSPORT_LOCK_NS = "contract_passport";
export const CONTRACT_OFFICIAL_REVIEW_LOCK_NS = "contract_official_review";
export const CONTRACT_RECONCILE_LOCK_NS = "contract_reconcile";
/** Serialises ACTIVE-phase decisions on one contract: return confirmation vs renewal. */
export const CONTRACT_LIFECYCLE_LOCK_NS = "contract_lifecycle";
export const ROAD_LIABILITY_CHARGE_LOCK_NS = "road_liability_charge";

export const PUBLIC_RENTAL_FLOW_STEPS = [
  "LICENSE_VERIFICATION",
  "CONTRACT",
  "PAYMENT",
  "READY_FOR_HANDOVER",
] as const;
export type PublicRentalFlowStep = (typeof PUBLIC_RENTAL_FLOW_STEPS)[number];

export const DRIVING_LICENSE_UPLOAD_MIME = ["image/jpeg", "image/png"] as const;
/** Passport information page: raster images only (no SVG, no PDF). */
export const PASSPORT_UPLOAD_MIME = ["image/jpeg", "image/png"] as const;

/** Overall / per-field OCR confidence must be >= this to be eligible as VALID. */
export const DRIVING_LICENSE_MIN_CONFIDENCE = 0.8;

export const PAYMENT_STATUS_TOKEN_TTL_SECONDS = 7 * 24 * 60 * 60;
export const ACTIVE_PAYMENT_STATUSES = ["PENDING", "PROCESSING"] as const;

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
] as const;

/**
 * Blocking rental context shown on Vehicles as currentRental.
 * PAID is included: the vehicle stays AVAILABLE until Car-Out, but it is
 * reserved and must not look free on the fleet page.
 * REVIEW is financial review after Car-In — not current possession.
 */
export const CURRENT_RENTAL_STATUSES: readonly ContractStatus[] = [
  "PAID",
  "ACTIVE",
  "RETOUT",
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

/// Shared walk-around vocabulary for both custody events: Car-Out (OUT) and the
/// staged Car-In (IN) draft/complete workflow. Car-In has no angle set of its
/// own — reusing these keeps the two evidence sets directly comparable.
export const CAR_OUT_REQUIRED_ANGLES = [
  "FRONT", "REAR", "FRONT_RIGHT", "REAR_RIGHT", "FRONT_LEFT", "REAR_LEFT", "ODOMETER", "DASHBOARD_FUEL",
] as const;
export const CAR_OUT_PHOTO_ANGLES = [
  ...CAR_OUT_REQUIRED_ANGLES, "LEFT", "RIGHT", "OTHER",
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
