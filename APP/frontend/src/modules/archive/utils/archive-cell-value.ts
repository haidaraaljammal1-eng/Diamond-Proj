import type { ArchiveEditableField, ArchiveRow } from "../types/archive.types";
import { archiveDateFromApi, archiveDateToApi } from "./archive-date.ts";

export function readArchiveCellDisplay(row: ArchiveRow, field: ArchiveEditableField): string {
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
): Partial<ArchiveRow>[ArchiveEditableField] | "invalid" {
  const trimmed = raw.trim();

  if (field === "deliveryDate" || field === "returnDate") {
    if (!trimmed) return null;
    const api = archiveDateToApi(trimmed);
    return api === null ? "invalid" : api;
  }

  if (field === "deliveryTime" || field === "returnTime") {
    if (!trimmed) return null;
    if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(trimmed)) return "invalid";
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
    if (!/^\d+$/.test(trimmed)) return "invalid";
    const parsed = Number.parseInt(trimmed, 10);
    if (!Number.isFinite(parsed) || parsed < 0) return "invalid";
    return parsed;
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
