import type { ArchiveRow } from "@prisma/client";
import type { Prisma } from "@prisma/client";
import type { ArchiveChargeSnapshot } from "src/modules/archive/archive-row-total";
import type { ArchiveEditableField } from "src/modules/archive/archive-manual-cell-values.fields";
import { ARCHIVE_EDITABLE_FIELDS } from "src/modules/archive/archive-manual-cell-values.fields";

export type ArchiveManualCellValues = Partial<Record<ArchiveEditableField, string>>;

const EDITABLE_SET = new Set<string>(ARCHIVE_EDITABLE_FIELDS);
const ISO_DATE_PREFIX = /^(\d{4})-(\d{2})-(\d{2})/;
const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;
const WHOLE_NUMBER_RE = /^\d+$/;

export function emptyManualCellValues(): ArchiveManualCellValues {
  return {};
}

export function parseManualCellValues(value: unknown): ArchiveManualCellValues {
  if (value == null || typeof value !== "object" || Array.isArray(value)) {
    return emptyManualCellValues();
  }
  const out: ArchiveManualCellValues = {};
  for (const [key, raw] of Object.entries(value)) {
    if (!EDITABLE_SET.has(key) || typeof raw !== "string") continue;
    out[key as ArchiveEditableField] = raw;
  }
  return out;
}

export function serializeManualCellValues(
  values: ArchiveManualCellValues,
): Prisma.InputJsonValue {
  const out: Record<string, string> = {};
  for (const field of ARCHIVE_EDITABLE_FIELDS) {
    const raw = values[field];
    if (typeof raw === "string" && raw.length > 0) out[field] = raw;
  }
  return out;
}

export function manualCellDisplayValue(
  row: Pick<ArchiveRow, ArchiveEditableField | "manualCellValues">,
  field: ArchiveEditableField,
): string {
  const manual = parseManualCellValues(row.manualCellValues);
  if (manual[field] !== undefined) return manual[field]!;
  const typed = row[field];
  if (typed === null || typed === undefined) return "";
  if (field === "deliveryDate" || field === "returnDate") {
    if (typed instanceof Date) {
      const iso = typed.toISOString();
      const match = ISO_DATE_PREFIX.exec(iso);
      if (match) return `${match[1]}-${match[2]}-${match[3]}`;
    }
    return String(typed);
  }
  return String(typed);
}

function tryParseNonNegativeInt(raw: string): number | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  if (!WHOLE_NUMBER_RE.test(trimmed)) return null;
  const parsed = Number.parseInt(trimmed, 10);
  if (!Number.isFinite(parsed) || parsed < 0) return null;
  return parsed;
}

function tryParseApiDate(raw: string): Date | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  if (!ISO_DATE_PREFIX.test(trimmed)) return null;
  const slice = trimmed.slice(0, 10);
  const parsed = new Date(`${slice}T00:00:00.000Z`);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function tryParseTime(raw: string): string | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  return TIME_RE.test(trimmed) ? trimmed : null;
}

const INTEGER_FIELDS = new Set<ArchiveEditableField>(["kmIn", "km", "kmOut", "days"]);
const MONEY_FIELDS = new Set<ArchiveEditableField>([
  "dailyRate",
  "rentalTotal",
  "salik",
  "parking",
  "fuel",
  "blackPoints",
  "fines",
  "total",
  "dollar",
  "cash",
  "visa",
  "transfer",
  "remaining",
]);

export function effectiveNumericField(
  row: Pick<ArchiveRow, ArchiveEditableField | "manualCellValues">,
  field: ArchiveEditableField,
): number | null {
  const manual = parseManualCellValues(row.manualCellValues);
  if (manual[field] !== undefined) {
    const parsed = tryParseNonNegativeInt(manual[field]!);
    return parsed ?? 0;
  }
  const typed = row[field];
  if (typed === null || typed === undefined) return null;
  if (typeof typed === "number") return typed;
  return null;
}

export function effectiveChargeSnapshot(
  row: Pick<
    ArchiveRow,
    "fuel" | "salik" | "parking" | "blackPoints" | "fines" | "manualCellValues"
  >,
): ArchiveChargeSnapshot {
  return {
    fuel: effectiveNumericField(row, "fuel"),
    salik: effectiveNumericField(row, "salik"),
    parking: effectiveNumericField(row, "parking"),
    blackPoints: effectiveNumericField(row, "blackPoints"),
    fines: effectiveNumericField(row, "fines"),
  };
}

export type FlexibleFieldResolution = {
  typed?: unknown;
  clearTyped?: boolean;
  manualCellValue?: string | null;
  chargeComponentTouched?: boolean;
  rentalOrTotalTouched?: boolean;
};

const TOTAL_CHARGE_FIELDS = new Set<ArchiveEditableField>([
  "fuel",
  "salik",
  "parking",
  "blackPoints",
  "fines",
]);

export function resolveFlexibleFieldInput(
  field: ArchiveEditableField,
  incoming: string | number | null,
): FlexibleFieldResolution {
  if (incoming === null || (typeof incoming === "string" && !incoming.trim())) {
    return { clearTyped: true, manualCellValue: null };
  }

  if (field === "customerName" || field === "customerPhone" || field === "description") {
    const text = typeof incoming === "string" ? incoming.trim() : String(incoming);
    return { typed: text.length ? text : null, manualCellValue: null };
  }

  if (field === "deliveryDate" || field === "returnDate") {
    const text = String(incoming).trim();
    const parsed = tryParseApiDate(text);
    if (parsed) return { typed: parsed, manualCellValue: null };
    return { manualCellValue: text };
  }

  if (field === "deliveryTime" || field === "returnTime") {
    const text = String(incoming).trim();
    const parsed = tryParseTime(text);
    if (parsed) return { typed: parsed, manualCellValue: null };
    return { manualCellValue: text };
  }

  if (INTEGER_FIELDS.has(field) || MONEY_FIELDS.has(field)) {
    if (typeof incoming === "number" && Number.isInteger(incoming) && incoming >= 0) {
      return { typed: incoming, manualCellValue: null };
    }
    const text = String(incoming).trim();
    const parsed = tryParseNonNegativeInt(text);
    if (parsed !== null) {
      return {
        typed: parsed,
        manualCellValue: null,
        chargeComponentTouched: TOTAL_CHARGE_FIELDS.has(field),
        rentalOrTotalTouched: field === "rentalTotal" || field === "total",
      };
    }
    return {
      manualCellValue: text,
      chargeComponentTouched: TOTAL_CHARGE_FIELDS.has(field),
      rentalOrTotalTouched: field === "rentalTotal" || field === "total",
    };
  }

  return { manualCellValue: String(incoming) };
}

export function clearManualCellValue(
  values: ArchiveManualCellValues,
  field: ArchiveEditableField,
): ArchiveManualCellValues {
  if (values[field] === undefined) return values;
  const next = { ...values };
  delete next[field];
  return next;
}

export function applyFlexibleFieldToUpdate(
  values: ArchiveManualCellValues,
  field: ArchiveEditableField,
  resolution: FlexibleFieldResolution,
): ArchiveManualCellValues {
  if (resolution.manualCellValue === null) {
    return clearManualCellValue(values, field);
  }
  if (resolution.manualCellValue !== undefined) {
    return { ...values, [field]: resolution.manualCellValue };
  }
  return clearManualCellValue(values, field);
}

export type FlexibleArchivePatchResult = {
  data: Prisma.ArchiveRowUncheckedUpdateInput;
  chargeComponentTouched: boolean;
  rentalOrTotalTouched: boolean;
  patchedFields: ArchiveEditableField[];
};

export function buildFlexibleArchivePatch(
  existing: ArchiveRow,
  body: Partial<Record<ArchiveEditableField, string | number | null>>,
): FlexibleArchivePatchResult {
  let manualCellValues = parseManualCellValues(existing.manualCellValues);
  const data: Prisma.ArchiveRowUncheckedUpdateInput = {};
  let chargeComponentTouched = false;
  let rentalOrTotalTouched = false;
  const patchedFields: ArchiveEditableField[] = [];

  for (const field of ARCHIVE_EDITABLE_FIELDS) {
    const incoming = body[field];
    if (incoming === undefined) continue;

    patchedFields.push(field);
    const resolution = resolveFlexibleFieldInput(field, incoming);
    if (resolution.chargeComponentTouched) chargeComponentTouched = true;
    if (resolution.rentalOrTotalTouched) rentalOrTotalTouched = true;

    manualCellValues = applyFlexibleFieldToUpdate(manualCellValues, field, resolution);

    if (resolution.clearTyped) {
      (data as Record<string, unknown>)[field] = null;
    } else if (resolution.typed !== undefined) {
      (data as Record<string, unknown>)[field] = resolution.typed;
    }
  }

  data.manualCellValues = serializeManualCellValues(manualCellValues);

  return { data, chargeComponentTouched, rentalOrTotalTouched, patchedFields };
}

/** Resolves visible import cells into typed columns + `manualCellValues` without mutating a DB row. */
export function prismaDataFromImportFields(
  fields: Partial<Record<ArchiveEditableField, string | number | null>>,
): Prisma.ArchiveRowUncheckedUpdateInput {
  const synthetic = {
    id: 0,
    vehicleId: 0,
    contractId: null,
    rowOrder: 0,
    kmIn: null,
    km: null,
    kmOut: null,
    deliveryDate: null,
    deliveryTime: null,
    returnDate: null,
    returnTime: null,
    customerName: null,
    customerPhone: null,
    description: null,
    days: null,
    dailyRate: null,
    rentalTotal: null,
    salik: null,
    parking: null,
    fuel: null,
    blackPoints: null,
    fines: null,
    total: null,
    dollar: null,
    cash: null,
    visa: null,
    transfer: null,
    remaining: null,
    manualOverrides: {},
    manualCellValues: {},
    createdAt: new Date(),
    updatedAt: new Date(),
  } as ArchiveRow;
  return buildFlexibleArchivePatch(synthetic, fields).data;
}
