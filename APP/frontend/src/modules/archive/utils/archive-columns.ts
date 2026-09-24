import type { ArchiveEditableField } from "../types/archive.types";

export type ArchiveColumnKind = "mileage" | "date" | "time" | "text" | "phone" | "description" | "integer" | "money";

export interface ArchiveColumnDefinition {
  field: ArchiveEditableField;
  /** Stable i18n key under `Archive.columns.*` */
  labelKey: ArchiveEditableField;
  kind: ArchiveColumnKind;
  widthClass: "narrow" | "medium" | "wide" | "description";
}

/** Exact business column order — must match backend ArchiveRow and client Excel reference. */
export const ARCHIVE_COLUMNS: readonly ArchiveColumnDefinition[] = [
  { field: "kmOut", labelKey: "kmOut", kind: "mileage", widthClass: "narrow" },
  { field: "kmIn", labelKey: "kmIn", kind: "mileage", widthClass: "narrow" },
  { field: "km", labelKey: "km", kind: "mileage", widthClass: "narrow" },
  { field: "deliveryDate", labelKey: "deliveryDate", kind: "date", widthClass: "medium" },
  { field: "deliveryTime", labelKey: "deliveryTime", kind: "time", widthClass: "medium" },
  { field: "returnDate", labelKey: "returnDate", kind: "date", widthClass: "medium" },
  { field: "returnTime", labelKey: "returnTime", kind: "time", widthClass: "medium" },
  { field: "customerName", labelKey: "customerName", kind: "text", widthClass: "wide" },
  { field: "customerPhone", labelKey: "customerPhone", kind: "phone", widthClass: "wide" },
  { field: "description", labelKey: "description", kind: "description", widthClass: "description" },
  { field: "days", labelKey: "days", kind: "integer", widthClass: "narrow" },
  { field: "dailyRate", labelKey: "dailyRate", kind: "money", widthClass: "medium" },
  { field: "rentalTotal", labelKey: "rentalTotal", kind: "money", widthClass: "medium" },
  { field: "salik", labelKey: "salik", kind: "money", widthClass: "medium" },
  { field: "parking", labelKey: "parking", kind: "money", widthClass: "medium" },
  { field: "fuel", labelKey: "fuel", kind: "money", widthClass: "medium" },
  { field: "blackPoints", labelKey: "blackPoints", kind: "integer", widthClass: "narrow" },
  { field: "fines", labelKey: "fines", kind: "money", widthClass: "medium" },
  { field: "total", labelKey: "total", kind: "money", widthClass: "medium" },
  { field: "dollar", labelKey: "dollar", kind: "money", widthClass: "medium" },
  { field: "cash", labelKey: "cash", kind: "money", widthClass: "medium" },
  { field: "visa", labelKey: "visa", kind: "money", widthClass: "medium" },
  { field: "transfer", labelKey: "transfer", kind: "money", widthClass: "medium" },
  { field: "remaining", labelKey: "remaining", kind: "money", widthClass: "medium" },
] as const;

export const ARCHIVE_EDITABLE_FIELDS = ARCHIVE_COLUMNS.map((column) => column.field);
