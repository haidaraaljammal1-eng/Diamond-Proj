import { ARCHIVE_SYNC_AUTO_FIELDS, type ArchiveSyncAutoField } from "./archive-columns.ts";
import type { ArchiveEditableField, ArchiveRow } from "../types/archive.types.ts";

export function isArchiveSyncAutoField(
  field: ArchiveEditableField,
): field is ArchiveSyncAutoField {
  return (ARCHIVE_SYNC_AUTO_FIELDS as readonly string[]).includes(field);
}

/** Restore when backend has marked this sync-managed field as manually overridden. */
export function canRestoreArchiveFieldToAuto(
  row: ArchiveRow,
  field: ArchiveSyncAutoField,
): boolean {
  return row.manualOverrides?.[field] === true;
}
