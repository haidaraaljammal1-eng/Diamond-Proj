import type { ContractStatus } from "@prisma/client";

/** Physical custody — Car-Out until Car-In. PAID is reserved, not yet rented. */
export const ACTIVE_RENTAL_STATUSES: readonly ContractStatus[] = ["ACTIVE", "RETOUT"];

/** Customer rental flow still incomplete. */
export const PENDING_LINK_STATUSES: readonly ContractStatus[] = ["AWAITING", "FORM"];

/**
 * Today's deliveries are pending hand-overs: scheduled pickup today, Car-Out
 * not yet completed. ACTIVE / RETOUT / REVIEW / CLOSED are excluded.
 */
export const TODAY_DELIVERY_STATUSES: readonly ContractStatus[] = [
  "AWAITING",
  "FORM",
  "SIGNED",
  "PAID",
];

export const READY_FOR_DELIVERY_STATUS: ContractStatus = "PAID";

/** Consecutive calendar days in the business timezone, including weekends. */
export const DASHBOARD_WEEK_DAYS = 7;
export const DASHBOARD_RECENT_CONTRACTS_LIMIT = 5;
