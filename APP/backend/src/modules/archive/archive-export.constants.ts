/** Business column headers — fixed Arabic/English mix per client template. */
export const ARCHIVE_EXPORT_HEADERS = [
  "KM OUT",
  "KM IN",
  "KM",
  "تاريخ التسليم",
  "ساعة التسليم",
  "تاريخ الارجاع",
  "ساعة الارجاع",
  "اسم الزبون",
  "رقم الزبون",
  "شرح",
  "عدد الايام",
  "سعر اليوم",
  "مجموع الايجار",
  "سالك",
  "parking",
  "بترول",
  "نقاط سوداء",
  "مخالفات",
  "المجموع",
  "دولار",
  "كاش",
  "فيزا",
  "حوالة",
  "الباقي",
] as const;

export const ARCHIVE_EXPORT_COLUMN_COUNT = ARCHIVE_EXPORT_HEADERS.length;

export type ArchiveExportField =
  | "kmIn"
  | "km"
  | "kmOut"
  | "deliveryDate"
  | "deliveryTime"
  | "returnDate"
  | "returnTime"
  | "customerName"
  | "customerPhone"
  | "description"
  | "days"
  | "dailyRate"
  | "rentalTotal"
  | "salik"
  | "parking"
  | "fuel"
  | "blackPoints"
  | "fines"
  | "total"
  | "dollar"
  | "cash"
  | "visa"
  | "transfer"
  | "remaining";

export type ArchiveExportColumnKind =
  | "integer"
  | "money"
  | "date"
  | "time"
  | "text"
  | "phone"
  | "description";

export interface ArchiveExportColumnDefinition {
  field: ArchiveExportField;
  header: string;
  kind: ArchiveExportColumnKind;
  width: number;
  alignment: "left" | "center" | "right";
}

/** Ordered 24-column export mapping — auditable single source for workbook layout. */
export const ARCHIVE_EXPORT_COLUMNS: readonly ArchiveExportColumnDefinition[] = [
  { field: "kmOut", header: "KM OUT", kind: "integer", width: 9, alignment: "right" },
  { field: "kmIn", header: "KM IN", kind: "integer", width: 9, alignment: "right" },
  { field: "km", header: "KM", kind: "integer", width: 9, alignment: "right" },
  { field: "deliveryDate", header: "تاريخ التسليم", kind: "date", width: 14, alignment: "center" },
  { field: "deliveryTime", header: "ساعة التسليم", kind: "time", width: 12, alignment: "center" },
  { field: "returnDate", header: "تاريخ الارجاع", kind: "date", width: 14, alignment: "center" },
  { field: "returnTime", header: "ساعة الارجاع", kind: "time", width: 12, alignment: "center" },
  { field: "customerName", header: "اسم الزبون", kind: "text", width: 22, alignment: "left" },
  { field: "customerPhone", header: "رقم الزبون", kind: "phone", width: 18, alignment: "left" },
  { field: "description", header: "شرح", kind: "description", width: 28, alignment: "left" },
  { field: "days", header: "عدد الايام", kind: "integer", width: 10, alignment: "right" },
  { field: "dailyRate", header: "سعر اليوم", kind: "money", width: 12, alignment: "right" },
  { field: "rentalTotal", header: "مجموع الايجار", kind: "money", width: 14, alignment: "right" },
  { field: "salik", header: "سالك", kind: "money", width: 10, alignment: "right" },
  { field: "parking", header: "parking", kind: "money", width: 10, alignment: "right" },
  { field: "fuel", header: "بترول", kind: "money", width: 10, alignment: "right" },
  { field: "blackPoints", header: "نقاط سوداء", kind: "integer", width: 11, alignment: "right" },
  { field: "fines", header: "مخالفات", kind: "money", width: 11, alignment: "right" },
  { field: "total", header: "المجموع", kind: "money", width: 12, alignment: "right" },
  { field: "dollar", header: "دولار", kind: "money", width: 10, alignment: "right" },
  { field: "cash", header: "كاش", kind: "money", width: 10, alignment: "right" },
  { field: "visa", header: "فيزا", kind: "money", width: 10, alignment: "right" },
  { field: "transfer", header: "حوالة", kind: "money", width: 10, alignment: "right" },
  { field: "remaining", header: "الباقي", kind: "money", width: 12, alignment: "right" },
];

export const ARCHIVE_EXPORT_LAST_COLUMN_LETTER = "X";

export const ARCHIVE_EXPORT_DATE_FORMAT = "dd/mm/yyyy";

export function archiveExportFilename(date: Date = new Date()): string {
  const yyyy = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, "0");
  const dd = String(date.getDate()).padStart(2, "0");
  return `Diamond_Archive_${yyyy}-${mm}-${dd}.xlsx`;
}

export function formatArchiveVehicleHeader(
  displayName: string,
  plateNumber: string | null,
): string {
  if (plateNumber?.trim()) {
    return `${displayName} — ${plateNumber}`;
  }
  return displayName;
}
