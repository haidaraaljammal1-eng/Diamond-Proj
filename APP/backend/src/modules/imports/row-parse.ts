import {
  normalizeCode,
  normalizeExternalId,
  normalizeVin,
} from "src/lib/master-data/code";
import { normalizeEmail, normalizePhone } from "src/lib/security/normalize";
import { ImportErrorReason, rowIssue, type RowIssue } from "src/modules/imports/imports.errors";

/**
 * Pure (no DB, no Fastify) parsing + normalization of one raw import row into
 * canonical values, collecting structural/format issues. Master-data resolution
 * and cross-record matching happen later in the service; this layer only turns
 * strings into typed, normalized values and rejects malformed cells.
 */

export interface ParsedCustomer {
  name: string;
  mobile: string | null;
  email: string | null;
  externalId: string | null;
  type: "INDIVIDUAL" | "COMPANY";
  optOutEmail: boolean;
  optOutSms: boolean;
  optOutPhone: boolean;
  optOutWhatsApp: boolean;
}
export interface ParsedVehicle {
  vin: string | null;
  /** Business name (verbatim, for display + create). Primary model match key. */
  vehicleModelName: string | null;
  /** Advanced ERP key (normalized). Wins over name when supplied. */
  vehicleModelCode: string | null;
  modelYear: number | null;
  color: string | null;
  externalId: string | null;
}
export interface ParsedExperience {
  /** Business name (verbatim). Primary branch match key. */
  branchName: string | null;
  /** Advanced ERP key (normalized). Wins over name when supplied. */
  branchCode: string | null;
  /** Business name (verbatim). Salesperson matched by (branch, normalized name). */
  salespersonName: string | null;
  salespersonCode: string | null;
  salespersonExternalId: string | null;
  purchaseDate: Date | null;
  deliveryDate: Date | null;
  externalSaleId: string | null;
  financingType: string | null;
  insuranceType: string | null;
  salesChannel: string | null;
}
export interface ParsedRow {
  customer: ParsedCustomer;
  vehicle: ParsedVehicle;
  experience: ParsedExperience;
}

/** A saved mapping: file header → canonical field key. */
export type ColumnMapping = Record<string, string>;

/**
 * Build a fast per-row field extractor from the file headers + saved mapping.
 * Returns a function mapping a data row (aligned to `headers`) to a field-keyed
 * record of trimmed raw values. Headers not present in the mapping are ignored.
 */
export function buildFieldExtractor(
  headers: string[],
  mapping: ColumnMapping,
): (row: string[]) => Record<string, string> {
  const plan: Array<{ index: number; fieldKey: string }> = [];
  headers.forEach((header, index) => {
    const fieldKey = mapping[header];
    if (fieldKey) plan.push({ index, fieldKey });
  });
  return (row: string[]) => {
    const out: Record<string, string> = {};
    for (const { index, fieldKey } of plan) {
      const raw = row[index];
      out[fieldKey] = raw === undefined ? "" : raw.trim();
    }
    return out;
  };
}

function present(v: string | undefined): string | null {
  if (v === undefined) return null;
  const t = v.trim();
  return t === "" ? null : t;
}

const TRUE_SET = new Set(["true", "1", "yes", "y"]);
const FALSE_SET = new Set(["false", "0", "no", "n", ""]);

/** Parse a lenient boolean cell; unknown tokens surface an issue via `onError`. */
function parseBool(raw: string | undefined, field: string, issues: RowIssue[]): boolean {
  const v = (raw ?? "").trim().toLowerCase();
  if (TRUE_SET.has(v)) return true;
  if (FALSE_SET.has(v)) return false;
  issues.push(
    rowIssue(field, "invalid_value", ImportErrorReason.INVALID_ROW, `${field} must be true or false`),
  );
  return false;
}

function parseYear(raw: string | null, issues: RowIssue[]): number | null {
  if (raw === null) return null;
  const n = Number(raw);
  if (!Number.isInteger(n) || n < 1900 || n > 2100) {
    issues.push(
      rowIssue("modelYear", "invalid_value", ImportErrorReason.INVALID_ROW, "modelYear must be a year between 1900 and 2100"),
    );
    return null;
  }
  return n;
}

function parseDate(raw: string | null, field: string, issues: RowIssue[]): Date | null {
  if (raw === null) return null;
  // Accept a plain calendar date (interpreted as UTC midnight) or a full ISO stamp.
  const iso = /^\d{4}-\d{2}-\d{2}$/.test(raw) ? `${raw}T00:00:00.000Z` : raw;
  const ms = Date.parse(iso);
  if (Number.isNaN(ms)) {
    issues.push(
      rowIssue(field, "invalid_value", ImportErrorReason.INVALID_ROW, `${field} is not a valid date`),
    );
    return null;
  }
  return new Date(ms);
}

function parseType(raw: string | null, issues: RowIssue[]): "INDIVIDUAL" | "COMPANY" {
  if (raw === null) return "INDIVIDUAL";
  const v = raw.toUpperCase();
  if (v === "INDIVIDUAL" || v === "COMPANY") return v;
  issues.push(
    rowIssue("type", "invalid_value", ImportErrorReason.INVALID_ROW, "type must be INDIVIDUAL or COMPANY"),
  );
  return "INDIVIDUAL";
}

/**
 * Parse + normalize one extracted field-record. Returns the typed row plus any
 * structural issues (required missing, bad format). Never touches the DB.
 */
export function parseRow(fields: Record<string, string>): { row: ParsedRow; issues: RowIssue[] } {
  const issues: RowIssue[] = [];

  const name = present(fields.name);
  if (name === null) {
    issues.push(rowIssue("name", "required", ImportErrorReason.INVALID_ROW, "Customer name is required"));
  }
  // Master data is matched by business name; the ERP `code` is an optional
  // override. A row needs at least one of (name, code) for branch + vehicle model.
  const vehicleModelNameRaw = present(fields.vehicleModelName);
  const vehicleModelCodeRaw = present(fields.vehicleModelCode);
  if (vehicleModelNameRaw === null && vehicleModelCodeRaw === null) {
    issues.push(
      rowIssue("vehicleModelName", "required", ImportErrorReason.INVALID_ROW, "Vehicle model is required"),
    );
  }
  const branchNameRaw = present(fields.branchName);
  const branchCodeRaw = present(fields.branchCode);
  if (branchNameRaw === null && branchCodeRaw === null) {
    issues.push(rowIssue("branchName", "required", ImportErrorReason.INVALID_ROW, "Branch is required"));
  }

  const mobileRaw = present(fields.mobile);
  const emailRaw = present(fields.email);
  const externalCustomerId = present(fields.externalCustomerId);
  const vinRaw = present(fields.vin);
  const externalVehicleId = present(fields.externalVehicleId);
  const salespersonName = present(fields.salespersonName);
  const salespersonCode = present(fields.salespersonCode);
  const salespersonExternalId = present(fields.salespersonExternalId);
  const externalSaleId = present(fields.externalSaleId);

  const row: ParsedRow = {
    customer: {
      name: name ?? "",
      mobile: mobileRaw ? normalizePhone(mobileRaw) : null,
      email: emailRaw ? normalizeEmail(emailRaw) : null,
      externalId: externalCustomerId ? normalizeExternalId(externalCustomerId) : null,
      type: parseType(present(fields.type), issues),
      optOutEmail: parseBool(fields.optOutEmail, "optOutEmail", issues),
      optOutSms: parseBool(fields.optOutSms, "optOutSms", issues),
      optOutPhone: parseBool(fields.optOutPhone, "optOutPhone", issues),
      optOutWhatsApp: parseBool(fields.optOutWhatsApp, "optOutWhatsApp", issues),
    },
    vehicle: {
      vin: vinRaw ? normalizeVin(vinRaw) : null,
      // Name kept verbatim (display + create); normalized at match time.
      vehicleModelName: vehicleModelNameRaw,
      vehicleModelCode: vehicleModelCodeRaw ? normalizeCode(vehicleModelCodeRaw) : null,
      modelYear: parseYear(present(fields.modelYear), issues),
      // Free-text CX label — kept verbatim (trimmed by `present`), no normalization.
      color: present(fields.vehicleColor),
      externalId: externalVehicleId ? normalizeExternalId(externalVehicleId) : null,
    },
    experience: {
      branchName: branchNameRaw,
      branchCode: branchCodeRaw ? normalizeCode(branchCodeRaw) : null,
      salespersonName,
      salespersonCode: salespersonCode ? normalizeCode(salespersonCode) : null,
      salespersonExternalId: salespersonExternalId ? normalizeExternalId(salespersonExternalId) : null,
      purchaseDate: parseDate(present(fields.purchaseDate), "purchaseDate", issues),
      deliveryDate: parseDate(present(fields.deliveryDate), "deliveryDate", issues),
      externalSaleId: externalSaleId ? normalizeExternalId(externalSaleId) : null,
      // Free-text CX labels — kept verbatim (trimmed by `present`).
      financingType: present(fields.financingType),
      insuranceType: present(fields.insuranceType),
      salesChannel: present(fields.salesChannel),
    },
  };

  return { row, issues };
}
