import type { ArchiveRow, ContractPayment } from "@prisma/client";
import type { Prisma } from "@prisma/client";
import { computeArchiveCashVisa } from "src/modules/archive/archive-payment-allocation";
import {
  effectiveChargeSnapshot,
  effectiveNumericField,
} from "src/modules/archive/archive-manual-cell-values";
import { archiveTotalFromCharges } from "src/modules/archive/archive-row-total";
import type { ArchiveAutoFields } from "src/modules/archive/archive-sync.recompute";

/** Fields Pull Sync may write on linked rows (from `buildSyncArchiveRowUpdate` + customer). */
export const ARCHIVE_SYNC_AUTO_FIELDS = [
  "kmOut",
  "kmIn",
  "km",
  "deliveryDate",
  "deliveryTime",
  "returnDate",
  "returnTime",
  "customerName",
  "customerPhone",
  "days",
  "dailyRate",
  "rentalTotal",
  "fuel",
  "salik",
  "blackPoints",
  "fines",
  "total",
  "cash",
  "visa",
] as const;

export type ArchiveSyncAutoField = (typeof ARCHIVE_SYNC_AUTO_FIELDS)[number];

/** @deprecated Use ARCHIVE_SYNC_AUTO_FIELDS — charge subset kept for import comparisons. */
export const ARCHIVE_CHARGE_OVERRIDE_FIELDS = [
  "fuel",
  "salik",
  "blackPoints",
  "fines",
] as const;

export type ArchiveChargeOverrideField = (typeof ARCHIVE_CHARGE_OVERRIDE_FIELDS)[number];

export type ArchiveManualOverrides = Partial<Record<ArchiveSyncAutoField, boolean>>;

const AUTO_FIELD_SET = new Set<string>(ARCHIVE_SYNC_AUTO_FIELDS);

const TOTAL_COMPONENT_FIELDS = [
  "fuel",
  "salik",
  "parking",
  "blackPoints",
  "fines",
] as const;

export function emptyManualOverrides(): ArchiveManualOverrides {
  return {};
}

export function parseManualOverrides(value: unknown): ArchiveManualOverrides {
  if (value == null || typeof value !== "object" || Array.isArray(value)) {
    return emptyManualOverrides();
  }
  const out: ArchiveManualOverrides = {};
  for (const [key, flag] of Object.entries(value)) {
    if (!AUTO_FIELD_SET.has(key) || typeof flag !== "boolean") continue;
    if (key === "parking") continue;
    out[key as ArchiveSyncAutoField] = flag;
  }
  return out;
}

export function serializeManualOverrides(overrides: ArchiveManualOverrides): Prisma.InputJsonValue {
  const out: Record<string, boolean> = {};
  for (const field of ARCHIVE_SYNC_AUTO_FIELDS) {
    if (overrides[field] === true) out[field] = true;
  }
  return out;
}

export function isManualOverride(
  overrides: ArchiveManualOverrides,
  field: ArchiveSyncAutoField,
): boolean {
  return overrides[field] === true;
}

export function setManualOverride(
  overrides: ArchiveManualOverrides,
  field: ArchiveSyncAutoField,
  enabled: boolean,
): ArchiveManualOverrides {
  if (!enabled) {
    const next = { ...overrides };
    delete next[field];
    return next;
  }
  return { ...overrides, [field]: true };
}

export function valuesEqual(a: unknown, b: unknown): boolean {
  if (a instanceof Date && b instanceof Date) return a.getTime() === b.getTime();
  return (a ?? null) === (b ?? null);
}

function pickSyncValue<K extends ArchiveSyncAutoField>(
  existing: ArchiveRow | null,
  overrides: ArchiveManualOverrides,
  field: K,
  autoValue: ArchiveRow[K],
): ArchiveRow[K] {
  if (existing && isManualOverride(overrides, field)) {
    return existing[field];
  }
  return autoValue;
}

export { effectiveChargeSnapshot } from "src/modules/archive/archive-manual-cell-values";

export function buildSyncArchiveRowUpdate(
  existing: ArchiveRow | null,
  auto: ArchiveAutoFields,
  payments: ContractPayment[] = [],
): Prisma.ArchiveRowUncheckedUpdateInput {
  const overrides = parseManualOverrides(existing?.manualOverrides);

  const merged = {
    kmOut: pickSyncValue(existing, overrides, "kmOut", auto.kmOut),
    kmIn: pickSyncValue(existing, overrides, "kmIn", auto.kmIn),
    km: pickSyncValue(existing, overrides, "km", auto.km),
    deliveryDate: pickSyncValue(existing, overrides, "deliveryDate", auto.deliveryDate),
    deliveryTime: pickSyncValue(existing, overrides, "deliveryTime", auto.deliveryTime),
    returnDate: pickSyncValue(existing, overrides, "returnDate", auto.returnDate),
    returnTime: pickSyncValue(existing, overrides, "returnTime", auto.returnTime),
    customerName: pickSyncValue(existing, overrides, "customerName", auto.customerName),
    customerPhone: pickSyncValue(existing, overrides, "customerPhone", auto.customerPhone),
    days: pickSyncValue(existing, overrides, "days", auto.days),
    dailyRate: pickSyncValue(existing, overrides, "dailyRate", auto.dailyRate),
    rentalTotal: pickSyncValue(existing, overrides, "rentalTotal", auto.rentalTotal),
    cash: pickSyncValue(existing, overrides, "cash", auto.cash),
    visa: pickSyncValue(existing, overrides, "visa", auto.visa),
    fuel: pickSyncValue(existing, overrides, "fuel", auto.fuel),
    salik: pickSyncValue(existing, overrides, "salik", auto.salik),
    blackPoints: pickSyncValue(existing, overrides, "blackPoints", auto.blackPoints),
    fines: pickSyncValue(existing, overrides, "fines", auto.fines),
    parking: existing?.parking ?? null,
  };

  const chargeRow = {
    ...(existing ?? {}),
    ...merged,
    manualCellValues: existing?.manualCellValues ?? {},
  } as ArchiveRow;
  const computedTotal = archiveTotalFromCharges(effectiveChargeSnapshot(chargeRow));

  const total = isManualOverride(overrides, "total")
    ? (existing?.total ?? computedTotal)
    : computedTotal;

  let cash = merged.cash as number | null;
  let visa = merged.visa as number | null;
  if (payments.length > 0) {
    const ledger = computeArchiveCashVisa(payments, {
      effectiveRentalTotal: effectiveNumericField(chargeRow, "rentalTotal"),
      extrasTotal: total,
    });
    if (!isManualOverride(overrides, "cash")) cash = ledger.cash;
    if (!isManualOverride(overrides, "visa")) visa = ledger.visa;
  }

  const base: Prisma.ArchiveRowUncheckedUpdateInput = {
    ...merged,
    total,
    cash,
    visa,
  };

  if (existing) {
    return base;
  }

  return {
    ...base,
    manualOverrides: serializeManualOverrides(emptyManualOverrides()),
  };
}

function sameCalendarDay(a: Date, b: Date): boolean {
  return (
    a.getUTCFullYear() === b.getUTCFullYear() &&
    a.getUTCMonth() === b.getUTCMonth() &&
    a.getUTCDate() === b.getUTCDate()
  );
}

export function syncPayloadChanged(
  existing: ArchiveRow,
  next: Prisma.ArchiveRowUncheckedUpdateInput,
): boolean {
  const keys = [...ARCHIVE_SYNC_AUTO_FIELDS, "parking"] as const;

  for (const key of keys) {
    const a = existing[key];
    const b = next[key];
    if ((a == null && b == null) || a === b) continue;
    if (a instanceof Date && b instanceof Date) {
      // deliveryDate/returnDate are PostgreSQL DATE. Writes use UTC noon so a
      // timezone cannot roll the day; reads come back at UTC midnight.
      if (key === "deliveryDate" || key === "returnDate") {
        if (!sameCalendarDay(a, b)) return true;
        continue;
      }
      if (a.getTime() !== b.getTime()) return true;
      continue;
    }
    if (a !== b) return true;
  }
  return false;
}

export function mergeImportManualOverrides(
  contractId: string | null,
  prev: ArchiveRow | null,
  imported: Pick<ArchiveRow, ArchiveSyncAutoField>,
  metaOverrides: ArchiveManualOverrides | undefined,
): ArchiveManualOverrides {
  let overrides =
    metaOverrides !== undefined
      ? parseManualOverrides(metaOverrides)
      : parseManualOverrides(prev?.manualOverrides);

  if (!contractId || !prev || prev.contractId !== contractId) {
    return overrides;
  }

  for (const field of ARCHIVE_SYNC_AUTO_FIELDS) {
    if (!valuesEqual(prev[field], imported[field])) {
      overrides = setManualOverride(overrides, field, true);
    }
  }
  return overrides;
}

export function applyPatchManualOverrides(
  existing: ArchiveRow,
  body: Partial<Record<ArchiveSyncAutoField, unknown>>,
): ArchiveManualOverrides {
  let overrides = parseManualOverrides(existing.manualOverrides);
  for (const field of ARCHIVE_SYNC_AUTO_FIELDS) {
    if (body[field] !== undefined) {
      overrides = setManualOverride(overrides, field, true);
    }
  }
  return overrides;
}

export function shouldRecalculateTotalAfterPatch(
  overrides: ArchiveManualOverrides,
  body: Partial<ArchiveRow>,
  chargeComponentTouched = false,
): boolean {
  if (isManualOverride(overrides, "total")) return false;
  if (chargeComponentTouched) return true;
  return TOTAL_COMPONENT_FIELDS.some((field) => body[field] !== undefined);
}

export function shouldRecalculatePaymentLedgerAfterPatch(
  overrides: ArchiveManualOverrides,
  body: Partial<ArchiveRow>,
  flags: { chargeComponentTouched?: boolean; rentalOrTotalTouched?: boolean } = {},
): boolean {
  if (shouldRecalculateTotalAfterPatch(overrides, body, flags.chargeComponentTouched)) {
    return true;
  }
  if (flags.rentalOrTotalTouched) return true;
  if (body.total !== undefined && !isManualOverride(overrides, "total")) return true;
  return false;
}

export function totalAfterPatch(
  existing: ArchiveRow,
  data: Prisma.ArchiveRowUncheckedUpdateInput,
): number | null {
  const row = { ...existing, ...data } as ArchiveRow;
  return archiveTotalFromCharges(effectiveChargeSnapshot(row));
}

export function paymentLedgerAfterPatch(
  existing: ArchiveRow,
  data: Prisma.ArchiveRowUncheckedUpdateInput,
  payments: ContractPayment[],
): { cash: number | null; visa: number | null } {
  const row = { ...existing, ...data } as ArchiveRow;
  const extrasTotal =
    data.total !== undefined && typeof data.total === "number"
      ? data.total
      : archiveTotalFromCharges(effectiveChargeSnapshot(row));
  return computeArchiveCashVisa(payments, {
    effectiveRentalTotal: effectiveNumericField(row, "rentalTotal"),
    extrasTotal,
  });
}
