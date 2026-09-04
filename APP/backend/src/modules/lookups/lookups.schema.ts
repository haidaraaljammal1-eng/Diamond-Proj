import { z } from "zod";

/**
 * Lookup APIs are intentionally lightweight: id + label + code (+ minimal meta),
 * active-only, capped, searchable. They never return the full admin payload and
 * are consumed lazily by selects/filters — not preloaded after login.
 */

const LookupBaseQuery = z.object({
  search: z.string().trim().min(1).optional(),
  limit: z.coerce.number().int().min(1).max(50).default(20),
});

/** Comma-separated positive ints (e.g. "3,7,11") → number[]. Mirrors the CSV
 *  querystring convention in reports.schema.ts. Lets a lookup resolve id→label
 *  for display through the lookup-gated endpoint instead of a read-gated GET/:id. */
const idsCsv = z
  .string()
  .optional()
  .transform((v) =>
    v ? v.split(",").map((s) => Number(s.trim())).filter((n) => Number.isInteger(n) && n > 0) : undefined,
  );

export const RegionLookupQuery = LookupBaseQuery;
export const CityLookupQuery = LookupBaseQuery.extend({
  regionId: z.coerce.number().int().positive().optional(),
});
export const BranchLookupQuery = LookupBaseQuery;
export const VehicleModelLookupQuery = LookupBaseQuery;
export const DepartmentLookupQuery = LookupBaseQuery.extend({
  // Resolve specific departments by id (for id→label display) via the same
  // lookup-gated endpoint. Combined with isActive + search in the service.
  ids: idsCsv,
});
export const SalespersonLookupQuery = LookupBaseQuery.extend({
  branchId: z.coerce.number().int().positive().optional(),
});
export const CustomerLookupQuery = LookupBaseQuery;
export const VehicleLookupQuery = LookupBaseQuery;
export const UserLookupQuery = LookupBaseQuery.extend({
  // Resolve specific users by id (for id→label display) through the same
  // lookup-gated endpoint, exactly as the department lookup does — so a screen
  // that stores a user id can show a NAME without the read-gated GET /users/:id.
  ids: idsCsv,
});
export const RoleLookupQuery = LookupBaseQuery;
export const PurchaseExperienceLookupQuery = LookupBaseQuery.extend({
  // The complaint-create flow picks a customer first, then narrows to that
  // customer's purchase experiences.
  customerId: z.coerce.number().int().positive().optional(),
});
export const CommunicationTemplateLookupQuery = LookupBaseQuery.extend({
  channel: z.enum(["EMAIL", "WHATSAPP", "SMS"]).optional(),
});

const LookupItem = z.object({
  id: z.number().int(),
  label: z.string(),
  code: z.string(),
});

export const RegionLookupItem = LookupItem;
export const BranchLookupItem = LookupItem;
export const DepartmentLookupItem = LookupItem;
// Roles carry the stable machine `key` as `code`; system roles are still
// assignable so they are included in the picker.
export const RoleLookupItem = LookupItem;
export const CityLookupItem = LookupItem.extend({ regionId: z.number().int() });
export const VehicleModelLookupItem = LookupItem.extend({
  modelYear: z.number().int().nullable(),
});
export const SalespersonLookupItem = LookupItem.extend({
  branchId: z.number().int().nullable(),
});

// Customers/vehicles have no master-data `code`; their lookups carry their own key.
export const CustomerLookupItem = z.object({
  id: z.number().int(),
  label: z.string(),
  externalId: z.string().nullable(),
});
export const VehicleLookupItem = z.object({
  id: z.number().int(),
  label: z.string(),
  vin: z.string().nullable(),
});

// A contextual picker for the complaint-create flow. Minimal id + a short human
// summary label ("<model> — <purchaseDate>", else externalSaleId, else model).
export const PurchaseExperienceLookupItem = z.object({
  id: z.number().int(),
  label: z.string(),
});

// Users have no master-data `code`; the lookup carries id + label + email.
// `label` is the display name (falling back to email when unnamed).
export const UserLookupItem = z.object({
  id: z.number().int(),
  label: z.string(),
  email: z.string(),
  /** The user's primary department name, for "Name — Department" pickers. Null
   *  when the user belongs to no department. */
  department: z.string().nullable(),
});

// Published-only reference lookups for workflow pickers (campaign builder, QR).
// Only templates with a current PUBLISHED version are selectable, so a caller can
// never bind an unpublished value.
export const CommunicationTemplateLookupItem = LookupItem.extend({
  channel: z.enum(["EMAIL", "WHATSAPP", "SMS"]),
  currentVersionId: z.number().int(),
});
