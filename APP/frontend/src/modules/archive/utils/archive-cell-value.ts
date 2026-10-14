import type { ArchiveEditableField, ArchiveRow } from "../types/archive.types";
import { archiveDateFromApi, archiveDateToApi } from "./archive-date.ts";

export function readArchiveCellDisplay(row: ArchiveRow, field: ArchiveEditableField): string {
  const manual = row.manualCellValues?.[field];
  if (manual !== undefined) return manual;

  const value = row[field];
  if (value === null || value === undefined) return "";
  if (field === "deliveryDate" || field === "returnDate") {
    return archiveDateFromApi(String(value));
  }
  return String(value);
}

export function parseArchiveCellPatch(
  field: ArchiveEditableField,
  raw: string,
): string | number | null {
  const trimmed = raw.trim();

  if (field === "deliveryDate" || field === "returnDate") {
    if (!trimmed) return null;
    const api = archiveDateToApi(trimmed);
    return api ?? trimmed;
  }

  if (field === "deliveryTime" || field === "returnTime") {
    if (!trimmed) return null;
    if (/^([01]\d|2[0-3]):[0-5]\d$/.test(trimmed)) return trimmed;
    return trimmed;
  }

  if (
    field === "kmIn" ||
    field === "km" ||
    field === "kmOut" ||
    field === "days" ||
    field === "blackPoints" ||
    field === "dailyRate" ||
    field === "rentalTotal" ||
    field === "salik" ||
    field === "parking" ||
    field === "fuel" ||
    field === "fines" ||
    field === "total" ||
    field === "dollar" ||
    field === "cash" ||
    field === "visa" ||
    field === "transfer" ||
    field === "remaining"
  ) {
    if (!trimmed) return null;
    if (/^\d+$/.test(trimmed)) {
      const parsed = Number.parseInt(trimmed, 10);
      if (Number.isFinite(parsed) && parsed >= 0) return parsed;
    }
    return trimmed;
  }

  if (!trimmed) return null;
  return trimmed;
}

export function formatArchiveVehicleLabel(
  displayName: string,
  plateNumber: string | null,
): string {
  if (plateNumber?.trim()) {
    return `${displayName} — ${plateNumber}`;
  }
  return displayName;
}
