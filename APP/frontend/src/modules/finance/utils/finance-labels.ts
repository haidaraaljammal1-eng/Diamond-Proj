import type {
  LedgerDirection,
  ManualExpenseCategory,
  OpenReceivableSourceType,
} from "../types/finance.types";

type LabelTranslator = (key: string) => string;

export function receivableSourceLabel(
  sourceType: OpenReceivableSourceType,
  t: LabelTranslator,
): string {
  return t(`receivableSource.${sourceType}`);
}

export function ledgerKindLabel(kind: string, t: LabelTranslator): string {
  const key = `ledgerKind.${kind}`;
  const translated = t(key);
  return translated === key ? kind : translated;
}

export function ledgerMovementLabel(
  direction: LedgerDirection,
  t: LabelTranslator,
): string {
  return t(`ledgerMovement.${direction}`);
}

export function expenseCategoryLabel(
  category: string,
  t: LabelTranslator,
): string {
  const key = `expenseCategory.${category}`;
  const translated = t(key);
  return translated === key ? category : translated;
}

export const MANUAL_EXPENSE_CATEGORIES: ManualExpenseCategory[] = [
  "VEHICLE_CLEANING",
  "FUEL",
  "PARKING",
  "GOVERNMENT_FEES",
  "OFFICE_ADMIN",
  "MARKETING",
  "OPERATIONS",
  "OTHER",
];

export function formatVehicleLabel(
  vehicle: {
    vehicleName: string | null;
    plateNumber: string | null;
  } | null,
): string | null {
  if (!vehicle) return null;
  const name = vehicle.vehicleName?.trim();
  const plate = vehicle.plateNumber?.trim();
  if (name && plate) return `${name} · ${plate}`;
  return name ?? plate ?? null;
}
