/**
 * Canonical catalog of import target fields, grouped by the authoritative entity
 * each maps to. The client maps its file columns onto these keys (see
 * {@link ImportFieldDef}). Kept pure + data-only so the mapping UI, validation
 * and OpenAPI all derive from one source of truth.
 *
 * Primary matching is by BUSINESS NAME for the master-data a sales file carries
 * (branch, salesperson, vehicle model): the user maps human-readable names, and
 * the importer resolves/creates by normalized name (see normalizeName). The
 * technical `code` / external-id keys still exist for ERP-driven files but are
 * `hidden` (advanced) and optional. Matching is never fuzzy.
 */

export type ImportEntity = "customer" | "vehicle" | "purchaseExperience";

export interface ImportFieldDef {
  /** Canonical target field key used in the saved mapping. */
  key: string;
  entity: ImportEntity;
  label: string;
  /** Must be mapped for a job to become validatable (else missing_required_column). */
  required: boolean;
  /** A business/matching key (externalId, VIN, sale id). Display-only otherwise. */
  identity: boolean;
  /**
   * Technical/advanced field hidden from the default mapping UI (code + external
   * id keys). Still a valid mapping target for ERP files, but the business-name
   * fields are the primary, promoted path. Absent = shown.
   */
  hidden?: boolean;
}

export const IMPORT_FIELDS: readonly ImportFieldDef[] = [
  // --- Customer ---
  { key: "name", entity: "customer", label: "Customer name", required: true, identity: false },
  { key: "mobile", entity: "customer", label: "Mobile", required: false, identity: false },
  { key: "email", entity: "customer", label: "Email", required: false, identity: false },
  {
    key: "externalCustomerId",
    entity: "customer",
    label: "External customer ID",
    required: false,
    identity: true,
    hidden: true,
  },
  { key: "type", entity: "customer", label: "Customer type", required: false, identity: false },
  { key: "optOutEmail", entity: "customer", label: "Opt out: email", required: false, identity: false },
  { key: "optOutSms", entity: "customer", label: "Opt out: SMS", required: false, identity: false },
  { key: "optOutPhone", entity: "customer", label: "Opt out: phone", required: false, identity: false },
  {
    key: "optOutWhatsApp",
    entity: "customer",
    label: "Opt out: WhatsApp",
    required: false,
    identity: false,
  },

  // --- Vehicle ---
  { key: "vin", entity: "vehicle", label: "VIN", required: false, identity: true },
  {
    key: "vehicleModelName",
    entity: "vehicle",
    label: "Vehicle model",
    required: true,
    identity: false,
  },
  {
    key: "vehicleModelCode",
    entity: "vehicle",
    label: "Vehicle model code",
    // Advanced ERP key. Optional now — the model is resolved/created by name.
    required: false,
    identity: false,
    hidden: true,
  },
  { key: "modelYear", entity: "vehicle", label: "Model year", required: false, identity: false },
  { key: "vehicleColor", entity: "vehicle", label: "Vehicle color", required: false, identity: false },
  {
    key: "externalVehicleId",
    entity: "vehicle",
    label: "External vehicle ID",
    required: false,
    identity: true,
    hidden: true,
  },

  // --- PurchaseExperience ---
  {
    key: "branchName",
    entity: "purchaseExperience",
    label: "Branch",
    required: true,
    identity: false,
  },
  {
    key: "branchCode",
    entity: "purchaseExperience",
    label: "Branch code",
    // Advanced ERP key. Optional now — the branch is resolved/created by name.
    required: false,
    identity: false,
    hidden: true,
  },
  {
    key: "salespersonName",
    entity: "purchaseExperience",
    label: "Salesperson",
    required: false,
    identity: false,
  },
  {
    key: "salespersonCode",
    entity: "purchaseExperience",
    label: "Salesperson code",
    required: false,
    identity: false,
    hidden: true,
  },
  {
    key: "salespersonExternalId",
    entity: "purchaseExperience",
    label: "Salesperson external ID",
    required: false,
    identity: false,
    hidden: true,
  },
  {
    key: "purchaseDate",
    entity: "purchaseExperience",
    label: "Purchase date",
    required: false,
    identity: false,
  },
  {
    key: "deliveryDate",
    entity: "purchaseExperience",
    label: "Delivery date",
    required: false,
    identity: false,
  },
  {
    key: "externalSaleId",
    entity: "purchaseExperience",
    label: "External sale ID",
    // Advanced ERP idempotency key. Optional; hidden from the default mapping.
    required: false,
    identity: true,
    hidden: true,
  },
  {
    key: "financingType",
    entity: "purchaseExperience",
    label: "Financing type",
    required: false,
    identity: false,
  },
  {
    key: "insuranceType",
    entity: "purchaseExperience",
    label: "Insurance type",
    required: false,
    identity: false,
  },
  {
    key: "salesChannel",
    entity: "purchaseExperience",
    label: "Sales channel",
    required: false,
    identity: false,
  },
] as const;

export const IMPORT_FIELD_KEYS: readonly string[] = IMPORT_FIELDS.map((f) => f.key);

export const REQUIRED_IMPORT_FIELD_KEYS: readonly string[] = IMPORT_FIELDS.filter(
  (f) => f.required,
).map((f) => f.key);

export function isImportFieldKey(key: string): boolean {
  return IMPORT_FIELD_KEYS.includes(key);
}
