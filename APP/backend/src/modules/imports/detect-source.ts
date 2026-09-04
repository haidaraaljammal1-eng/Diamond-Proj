import { CsvParseError, parseCsv, type ParsedTable } from "src/modules/imports/csv-parser";
import { parseXlsx, XlsxParseError } from "src/modules/imports/xlsx-parser";
import {
  invalidFileTypeError,
  invalidXlsxContentError,
} from "src/modules/imports/imports.errors";

/**
 * File-format detection + parsing for an import upload. Kept pure (no Fastify, no
 * Prisma, no I/O) so the type gate is unit-testable with raw buffers.
 *
 * Type is decided by content, never by the client-supplied MIME alone (it is
 * spoofable and, for `.xlsx`, frequently generic — `application/octet-stream`,
 * `application/x-zip-compressed` — or empty):
 *   - CSV  → must decode as text (no NUL bytes) and parse; MIME is only an extra guard.
 *   - XLSX → must carry the ZIP local-file signature (PK\x03\x04); MIME is ignored.
 * A text/CSV file merely renamed `.xlsx` has no ZIP signature and is rejected as an
 * invalid *type*; a real ZIP whose workbook is corrupt is rejected as invalid
 * *content* — two distinct, machine-readable reasons.
 */

export type ImportSourceType = "CSV" | "XLSX";

/** Declared content-types accepted for a CSV import (extension + content also checked). */
const CSV_MIME_ALLOW = new Set([
  "text/csv",
  "application/csv",
  "application/vnd.ms-excel",
  "text/plain",
]);

/** True when the buffer opens with the ZIP local-file-header signature (PK\x03\x04). */
function hasZipSignature(buffer: Buffer): boolean {
  return (
    buffer.length >= 4 &&
    buffer[0] === 0x50 &&
    buffer[1] === 0x4b &&
    buffer[2] === 0x03 &&
    buffer[3] === 0x04
  );
}

export interface DetectedImportSource {
  sourceType: ImportSourceType;
  table: ParsedTable;
}

export async function detectAndParseImport(
  filename: string,
  mimetype: string,
  buffer: Buffer,
): Promise<DetectedImportSource> {
  const ext = filename.split(".").pop()?.toLowerCase() ?? "";

  if (ext === "csv") {
    if (!CSV_MIME_ALLOW.has(mimetype)) {
      throw invalidFileTypeError("File content-type is not an accepted CSV type");
    }
    // Content gate: reject binary (NUL bytes) — never parse unvalidated binary as text.
    if (buffer.subarray(0, 8192).includes(0)) {
      throw invalidFileTypeError("File does not look like text/CSV");
    }
    try {
      return { sourceType: "CSV", table: parseCsv(buffer.toString("utf8")) };
    } catch (err) {
      if (err instanceof CsvParseError) {
        throw invalidFileTypeError("Import file could not be parsed as CSV");
      }
      throw err;
    }
  }

  if (ext === "xlsx") {
    // XLSX is a ZIP container — the magic bytes are the authority, not the MIME.
    // This accepts a valid workbook whatever content-type the client sent, while a
    // renamed text file (no ZIP signature) is rejected as the wrong type.
    if (!hasZipSignature(buffer)) {
      throw invalidFileTypeError("File does not look like an XLSX workbook");
    }
    try {
      return { sourceType: "XLSX", table: await parseXlsx(buffer) };
    } catch (err) {
      // Right container, unreadable workbook → a content problem, not a type problem.
      if (err instanceof XlsxParseError) throw invalidXlsxContentError();
      throw err;
    }
  }

  throw invalidFileTypeError("Only CSV and XLSX files are supported");
}
