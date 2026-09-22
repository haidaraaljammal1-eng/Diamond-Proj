/**
 * TARS integration constants. Operation types are Diamond capability names
 * aligned with official RTA/TARS documentation.
 */

/** Official rental lifecycle capabilities (current writes). */
export const TARS_OFFICIAL_OPERATION_TYPES = [
  "CREATE_RENTAL",
  "UPDATE_RENTAL",
  "RETURN_RENTAL",
  "SETTLE_RENTAL",
] as const;
export type TarsOfficialOperationTypeKey =
  (typeof TARS_OFFICIAL_OPERATION_TYPES)[number];

/** Legacy capabilities preserved for migration-safe history reads. */
export const TARS_LEGACY_OPERATION_TYPES = [
  "REGISTER_CONTRACT",
  "CONTRACT_ACCEPTANCE",
  "HANDOVER",
  "RETURN_DOCUMENTATION",
  "COMPLETE_CONTRACT",
] as const;
export type TarsLegacyOperationTypeKey = (typeof TARS_LEGACY_OPERATION_TYPES)[number];

export const TARS_OPERATION_TYPES = [
  ...TARS_OFFICIAL_OPERATION_TYPES,
  ...TARS_LEGACY_OPERATION_TYPES,
] as const;
export type TarsOperationTypeKey = (typeof TARS_OPERATION_TYPES)[number];

/** Repeatable operations may succeed more than once when correlationSubject differs. */
export const TARS_REPEATABLE_OPERATION_TYPES: ReadonlySet<TarsOperationTypeKey> =
  new Set(["UPDATE_RENTAL"]);

/** Current async lifecycle statuses for new writes. */
export const TARS_OPERATION_STATUSES = [
  "SUBMITTING",
  "PENDING_PROVIDER",
  "SUCCEEDED",
  "FAILED",
] as const;
export type TarsOperationStatusKey = (typeof TARS_OPERATION_STATUSES)[number];

/** Legacy DB statuses — mapped in projection for staff UI. */
export const TARS_LEGACY_OPERATION_STATUSES = ["PENDING", "PROCESSING"] as const;

export const TARS_NOT_STARTED = "NOT_STARTED" as const;

export const TARS_PROJECTION_STATUSES = [
  TARS_NOT_STARTED,
  ...TARS_LEGACY_OPERATION_STATUSES,
  ...TARS_OPERATION_STATUSES,
] as const;
export type TarsProjectionStatus = (typeof TARS_PROJECTION_STATUSES)[number];

export const TARS_OPERATION_LOCK_NS = "tars_operation";

export const TARS_IDEMPOTENCY_SCOPE = "tars:operation";

/** Staff projection keys for official capabilities. */
export const TARS_OFFICIAL_PROJECTION_KEYS = {
  CREATE_RENTAL: "createRental",
  UPDATE_RENTAL: "updateRental",
  RETURN_RENTAL: "returnRental",
  SETTLE_RENTAL: "settleRental",
} as const satisfies Record<TarsOfficialOperationTypeKey, string>;

/** Legacy projection keys (historical rows / transitional staff UI). */
export const TARS_LEGACY_PROJECTION_KEYS = {
  REGISTER_CONTRACT: "registerContract",
  CONTRACT_ACCEPTANCE: "contractAcceptance",
  HANDOVER: "handover",
  RETURN_DOCUMENTATION: "returnDocumentation",
  COMPLETE_CONTRACT: "completeContract",
} as const satisfies Record<TarsLegacyOperationTypeKey, string>;

export const TARS_PROJECTION_KEYS = {
  ...TARS_OFFICIAL_PROJECTION_KEYS,
  ...TARS_LEGACY_PROJECTION_KEYS,
} as const;

export type TarsOfficialProjectionKey =
  (typeof TARS_OFFICIAL_PROJECTION_KEYS)[TarsOfficialOperationTypeKey];
export type TarsLegacyProjectionKey =
  (typeof TARS_LEGACY_PROJECTION_KEYS)[TarsLegacyOperationTypeKey];
export type TarsProjectionKey =
  TarsOfficialProjectionKey | TarsLegacyProjectionKey;

/**
 * Decision gate — CREATE_RENTAL timing vs OTP is unresolved until staging.
 * See DOCU/04-api-contracts/tars-integration.md.
 */
export const TARS_CREATE_RENTAL_CHECKPOINT_PENDING_STAGING_VERIFICATION =
  "TARS_CREATE_RENTAL_CHECKPOINT_PENDING_STAGING_VERIFICATION" as const;

/** Fallback only when the provider does not supply authoritative values. */
export const TARS_OTP_RESEND_COOLDOWN_SECONDS = 60;
export const TARS_OTP_MAX_VERIFY_ATTEMPTS = 5;

/** Diamond-owned OTP UI states exposed to the public rental frontend. */
export const TARS_OTP_UI_STATUSES = [
  "NOT_REQUIRED",
  "NOT_STARTED",
  "CODE_SENT",
  "VERIFIED",
  "FAILED",
  "EXPIRED",
  "RATE_LIMITED",
  "UNAVAILABLE",
] as const;
export type TarsOtpUiStatus = (typeof TARS_OTP_UI_STATUSES)[number];
