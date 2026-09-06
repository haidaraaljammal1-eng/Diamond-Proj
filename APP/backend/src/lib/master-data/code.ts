import { z } from "zod";
import { AppError } from "src/lib/errors/app-error";
import { ErrorCode } from "src/constants/error-codes";

/**
 * Shared helpers for master-data modules (regions, cities, branches, vehicle
 * models, departments, salespeople). Keep this pure — no Prisma, no Fastify.
 */

/** Master-data `code` is stored canonical: trimmed + UPPERCASE. */
export function normalizeCode(code: string): string {
  return code.trim().toUpperCase();
}

/** Optional trimmed identifier (e.g. ERP externalId) — kept case-sensitive. */
export function normalizeExternalId(value: string): string {
  return value.trim();
}

/** VIN / chassis number — canonical: trimmed, whitespace-stripped, UPPERCASE. */
export function normalizeVin(value: string): string {
  return value.replace(/\s+/g, "").toUpperCase();
}

/** Registration plate — trimmed, collapsed whitespace, UPPERCASE (Latin plates). */
export function normalizePlateNumber(value: string): string {
  return value.trim().replace(/\s+/g, " ").toUpperCase();
}

/**
 * Canonical NAME key for logical de-duplication of master data matched by a
 * human-entered name instead of a `code` (sales import: branch, vehicle model,
 * salesperson). It must absorb the noise that makes two spellings of the *same*
 * name differ, without merging genuinely different names:
 *   - Unicode NFKC (fold compatibility / width forms)
 *   - strip Arabic tashkeel (harakat U+064B–U+0652, superscript alef U+0670) and
 *     tatweel/kashida (U+0640) — pure decoration, never meaning
 *   - collapse every whitespace run to a single space, then trim
 *   - lowercase (Latin; Arabic is caseless)
 * Deliberately conservative: it does NOT unify alef/hamza or teh-marbuta
 * variants, which can distinguish real names. This is a MATCH key only — never a
 * display value (the original `name` is always kept verbatim).
 */
export function normalizeName(value: string): string {
  return value
    .normalize("NFKC")
    .replace(/[ً-ْٰـ]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

/** Raw client `code` field. Normalized by the service before persistence. */
export const CodeSchema = z
  .string()
  .trim()
  .min(1)
  .max(50)
  .regex(
    /^[A-Za-z0-9][A-Za-z0-9_-]*$/,
    "code must be alphanumeric with optional - or _",
  );

/**
 * Tri-state boolean query param. `z.coerce.boolean()` treats "false" as true,
 * so parse an explicit enum instead. Returns boolean | undefined.
 */
export const BooleanQueryParam = z
  .enum(["true", "false"])
  .optional()
  .transform((v) => (v === undefined ? undefined : v === "true"));

/** Standard sort allow-list shared by every master-data list endpoint. */
export const MASTER_DATA_SORTABLE = ["code", "name", "createdAt", "isActive"] as const;

/**
 * Stable machine-readable `context.reason` values for master-data structured
 * errors. The frontend branches on these constants, never on message text.
 */
export const DomainErrorReason = {
  INVALID_PARENT: "invalid_parent",
  IMMUTABLE_FIELD: "immutable_field",
  /** A NEW record selected an inactive master-data record. */
  INACTIVE_REFERENCE: "inactive_reference",
  /**
   * Reserved: deactivation blocked by a REAL active operational conflict.
   * Mere historical references never trigger this — deactivation proceeds and
   * historical FKs are preserved. No active-conflict state exists yet in BE-1B.
   */
  RECORD_IN_USE: "record_in_use",
} as const;
export type DomainErrorReason =
  (typeof DomainErrorReason)[keyof typeof DomainErrorReason];

/** 409 — a record with the same normalized `code` already exists. */
export function duplicateCodeError(resource: string): AppError {
  return new AppError({
    code: ErrorCode.CONFLICT,
    message: "A record with this code already exists",
    conflicts: [
      { resource, field: "code", message: "A record with this code already exists" },
    ],
  });
}

/** 422 — a referenced parent id (regionId, cityId, branchId, userId…) is unknown. */
export function invalidParentError(field: string): AppError {
  return new AppError({
    code: ErrorCode.VALIDATION_ERROR,
    message: "Referenced record does not exist",
    context: { field, reason: DomainErrorReason.INVALID_PARENT },
  });
}

/** 422 — an immutable field (e.g. `code`) was sent with a changed value. */
export function immutableFieldError(field: string): AppError {
  return new AppError({
    code: ErrorCode.VALIDATION_ERROR,
    message: "This field cannot be changed after creation",
    context: { field, reason: DomainErrorReason.IMMUTABLE_FIELD },
  });
}

/** 422 — a NEW record selected an inactive master-data record (future selection blocked). */
export function inactiveReferenceError(field: string): AppError {
  return new AppError({
    code: ErrorCode.VALIDATION_ERROR,
    message: "Referenced record is inactive",
    context: { field, reason: DomainErrorReason.INACTIVE_REFERENCE },
  });
}

/** 409 — a unique operational field (VIN, external id) collides. `messageKey` is an i18n key. */
export function conflictError(
  resource: string,
  field: string,
  messageKey: string,
): AppError {
  return new AppError({
    code: ErrorCode.CONFLICT,
    message: messageKey,
    conflicts: [{ resource, field, message: messageKey }],
  });
}

/**
 * `code` is a stable business key — immutable after creation. Sending the same
 * (normalized) value is a no-op; sending a different value is rejected. Call at
 * the top of every master-data `update`.
 */
export function assertCodeUnchanged(current: string, incoming: string | undefined): void {
  if (incoming !== undefined && normalizeCode(incoming) !== current) {
    throw immutableFieldError("code");
  }
}

/**
 * Generic immutability guard for a non-code field (e.g. an experience's
 * `customerId`/`vehicleId`). Absent or equal → no-op; a changed value → 422.
 */
export function assertFieldUnchanged(
  field: string,
  current: unknown,
  incoming: unknown,
): void {
  if (incoming !== undefined && incoming !== current) throw immutableFieldError(field);
}

/**
 * `vin` is a stable vehicle identity — immutable after creation. Comparison is on
 * the canonical (normalized) value: omitted (undefined) or the same normalized VIN
 * is a no-op; any other value — clearing a set VIN, or setting a previously-null
 * VIN — is rejected with the structured `immutable_field` error. Call at the top
 * of the vehicle `update`.
 */
export function assertVinUnchanged(
  current: string | null,
  incoming: string | null | undefined,
): void {
  if (incoming === undefined) return;
  const next = incoming === null ? null : normalizeVin(incoming);
  if (next !== current) throw immutableFieldError("vin");
}
