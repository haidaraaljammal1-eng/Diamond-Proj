/** Editable archive columns (24 business fields). Shared by flexible cell layer. */
export const ARCHIVE_EDITABLE_FIELDS = [
  "kmIn",
  "km",
  "kmOut",
  "deliveryDate",
  "deliveryTime",
  "returnDate",
  "returnTime",
  "customerName",
  "customerPhone",
  "description",
  "days",
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
] as const;

export type ArchiveEditableField = (typeof ARCHIVE_EDITABLE_FIELDS)[number];
