/** Manual editable Archive cell fields (24 business columns). */
export type ArchiveEditableField =
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

export interface ArchiveVehicle {
  id: number;
  displayName: string;
  plateNumber: string | null;
}

export interface ArchiveRow {
  id: number;
  vehicleId: number;
  rowOrder: number;
  kmIn: number | null;
  km: number | null;
  kmOut: number | null;
  deliveryDate: string | null;
  deliveryTime: string | null;
  returnDate: string | null;
  returnTime: string | null;
  customerName: string | null;
  customerPhone: string | null;
  description: string | null;
  days: number | null;
  dailyRate: number | null;
  rentalTotal: number | null;
  salik: number | null;
  parking: number | null;
  fuel: number | null;
  blackPoints: number | null;
  fines: number | null;
  total: number | null;
  dollar: number | null;
  cash: number | null;
  visa: number | null;
  transfer: number | null;
  remaining: number | null;
  createdAt: string;
  updatedAt: string;
}

export type ArchiveRowPatch = Partial<{
  [K in ArchiveEditableField]: ArchiveRow[K];
}>;
