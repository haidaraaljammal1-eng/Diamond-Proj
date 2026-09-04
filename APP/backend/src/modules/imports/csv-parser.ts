/**
 * Minimal, dependency-free RFC 4180 CSV parser. Kept pure (no I/O, no Fastify)
 * so it is trivially unit-testable and safe to run on already content-validated
 * bytes. Handles quoted fields, escaped quotes (""), embedded commas/newlines,
 * and both LF and CRLF line endings. A leading UTF-8 BOM is stripped.
 *
 * XLSX is intentionally NOT handled here: adding a spreadsheet dependency to the
 * generic starter is a deliberate decision deferred to a follow-up (see BE-1C
 * report). The import service abstracts the parser behind {@link ParsedTable} so
 * an XLSX adapter can be slotted in later without touching validation/matching.
 */

export interface ParsedTable {
  /** Header cells, in file order (trimmed). */
  headers: string[];
  /** Data rows; each is an array aligned to `headers` length (missing cells → ""). */
  rows: string[][];
}

/** Thrown when the input is structurally unparseable (never for empty rows). */
export class CsvParseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CsvParseError";
  }
}

/** Tokenize CSV text into a matrix of raw string cells. */
function tokenize(input: string): string[][] {
  const text = input.charCodeAt(0) === 0xfeff ? input.slice(1) : input; // strip BOM
  const rows: string[][] = [];
  let field = "";
  let row: string[] = [];
  let inQuotes = false;
  let i = 0;
  const n = text.length;

  const endField = () => {
    row.push(field);
    field = "";
  };
  const endRow = () => {
    endField();
    rows.push(row);
    row = [];
  };

  while (i < n) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i += 2;
          continue;
        }
        inQuotes = false;
        i += 1;
        continue;
      }
      field += ch;
      i += 1;
      continue;
    }
    if (ch === '"') {
      inQuotes = true;
      i += 1;
      continue;
    }
    if (ch === ",") {
      endField();
      i += 1;
      continue;
    }
    if (ch === "\r") {
      // CRLF or lone CR both terminate a row.
      endRow();
      if (text[i + 1] === "\n") i += 2;
      else i += 1;
      continue;
    }
    if (ch === "\n") {
      endRow();
      i += 1;
      continue;
    }
    field += ch;
    i += 1;
  }
  if (inQuotes) throw new CsvParseError("Unterminated quoted field");
  // Flush the final field/row unless the file ended exactly on a newline.
  if (field !== "" || row.length > 0) endRow();
  return rows;
}

/**
 * Parse CSV text into a header + data-row table. The first non-empty line is the
 * header. Fully blank rows (common trailing artifact) are dropped. Data rows are
 * normalized to the header width so downstream mapping is index-stable.
 */
export function parseCsv(input: string): ParsedTable {
  const matrix = tokenize(input).filter(
    (r) => !(r.length === 1 && (r[0] ?? "").trim() === ""),
  );
  const headerRow = matrix[0];
  if (!headerRow) throw new CsvParseError("File contains no rows");

  const headers = headerRow.map((h) => h.trim());
  if (headers.length === 0 || headers.every((h) => h === "")) {
    throw new CsvParseError("File has no header row");
  }
  const width = headers.length;
  const rows = matrix.slice(1).map((r) => {
    const cells = r.slice(0, width);
    while (cells.length < width) cells.push("");
    return cells;
  });
  return { headers, rows };
}
