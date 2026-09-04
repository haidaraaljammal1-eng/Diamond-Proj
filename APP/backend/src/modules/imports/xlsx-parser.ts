import ExcelJS from "exceljs";
import JSZip from "jszip";
import type { ParsedTable } from "src/modules/imports/csv-parser";

/**
 * XLSX adapter producing the same {@link ParsedTable} shape as the CSV parser, so
 * mapping / validation / preview / confirm are format-agnostic. Uses `exceljs`
 * (maintained, pure-JS, no native deps). Only the first worksheet is read; every
 * cell is coerced to a trimmed string. Malformed/corrupt workbooks throw
 * {@link XlsxParseError}, which the service maps to a structured invalid-content error.
 *
 * exceljs matches OOXML on the *unprefixed* local element name, so it fails on
 * otherwise-valid workbooks that bind the spreadsheetml namespace to an explicit
 * prefix (e.g. `<x:workbook>` / `<x:sheet>` — the dialect the .NET OpenXML SDK and
 * ClosedXML emit). {@link loadWorkbook} recovers those by normalizing the prefix and
 * retrying once, so a spec-valid `.xlsx` that Excel opens fine is not rejected.
 */

export class XlsxParseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "XlsxParseError";
  }
}

type CellValue = ExcelJS.CellValue;
type XlsxLoadArg = Parameters<ExcelJS.Workbook["xlsx"]["load"]>[0];

const SPREADSHEETML_NS = "http://schemas.openxmlformats.org/spreadsheetml/2006/main";

/**
 * Optional parts we never read (only cell values are needed). Strict-OOXML producers
 * attach these, and exceljs's reconciler crashes on some of them (e.g. a table part)
 * even after the namespace is normalized — so they are dropped from the retry copy.
 */
const DROPPABLE_PART = /^xl\/(tables|drawings|pivotTables|pivotCache|charts)\//i;

function cellToString(value: CellValue): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean" || typeof value === "bigint") {
    return String(value);
  }
  if (value instanceof Date) return value.toISOString();
  if (typeof value === "object") {
    const v = value as unknown as Record<string, unknown>;
    if ("text" in v) return String(v.text ?? ""); // hyperlink cell
    if ("result" in v) return cellToString(v.result as CellValue); // formula cell
    if ("richText" in v && Array.isArray(v.richText)) {
      return (v.richText as Array<{ text?: string }>).map((r) => r.text ?? "").join("");
    }
    if ("error" in v) return ""; // error cell → empty
  }
  return String(value);
}

const escapeRegExp = (s: string) => s.replace(/[.*+?^${}()|[\]\\/]/g, "\\$&");

/**
 * Rewrite a namespace-prefixed workbook into the default-namespace form exceljs
 * understands, and drop optional parts (tables/drawings/pivots) that would trip its
 * reconciler. Returns a fresh ZIP buffer, or `null` when the input is not a readable
 * ZIP at all (genuinely corrupt → the caller surfaces {@link XlsxParseError}).
 */
async function normalizeForExcelJs(buffer: Buffer): Promise<Buffer | null> {
  let zip: JSZip;
  try {
    zip = await JSZip.loadAsync(buffer);
  } catch {
    return null; // not a real ZIP container
  }
  const nsProbe = new RegExp(`xmlns:([A-Za-z0-9_]+)="${escapeRegExp(SPREADSHEETML_NS)}"`);
  for (const name of Object.keys(zip.files)) {
    const entry = zip.files[name];
    if (!entry || entry.dir) continue;
    if (DROPPABLE_PART.test(name)) {
      zip.remove(name);
      continue;
    }
    if (!name.endsWith(".xml") && !name.endsWith(".rels")) continue;

    let xml = await entry.async("string");
    // Drop refs to the parts removed above so worksheet/rels stay internally consistent.
    xml = xml
      .replace(/<([A-Za-z0-9_]+:)?tableParts\b[\s\S]*?<\/([A-Za-z0-9_]+:)?tableParts>/g, "")
      .replace(/<([A-Za-z0-9_]+:)?tableParts\b[^>]*\/>/g, "")
      .replace(/<([A-Za-z0-9_]+:)?(drawing|legacyDrawing)\b[^>]*\/>/g, "")
      .replace(
        /<Relationship\b[^>]*Target="[^"]*\/(tables|drawings|pivotTables|pivotCache|charts)\/[^"]*"[^>]*\/>/g,
        "",
      );

    const probe = nsProbe.exec(xml);
    if (probe) {
      const prefix = probe[1];
      xml = xml
        .replace(
          new RegExp(`xmlns:${prefix}="${escapeRegExp(SPREADSHEETML_NS)}"`, "g"),
          `xmlns="${SPREADSHEETML_NS}"`,
        )
        .replace(new RegExp(`<${prefix}:`, "g"), "<")
        .replace(new RegExp(`</${prefix}:`, "g"), "</");
    }
    zip.file(name, xml);
  }
  return zip.generateAsync({ type: "nodebuffer" });
}

/** Load a workbook, transparently recovering the namespace-prefixed OOXML dialect. */
async function loadWorkbook(buffer: Buffer): Promise<ExcelJS.Workbook> {
  const workbook = new ExcelJS.Workbook();
  // exceljs bundles its own Buffer typing which drifts from @types/node's generic
  // Buffer; cast to the method's declared arg type rather than widen to `any`.
  try {
    await workbook.xlsx.load(buffer as unknown as XlsxLoadArg);
    return workbook;
  } catch {
    // Fall through to the normalize-and-retry path below.
  }
  const normalized = await normalizeForExcelJs(buffer);
  if (!normalized) throw new XlsxParseError("Workbook could not be parsed");
  try {
    // A fresh workbook — the first attempt may have left the instance half-populated.
    const retry = new ExcelJS.Workbook();
    await retry.xlsx.load(normalized as unknown as XlsxLoadArg);
    return retry;
  } catch {
    throw new XlsxParseError("Workbook could not be parsed");
  }
}

export async function parseXlsx(buffer: Buffer): Promise<ParsedTable> {
  const workbook = await loadWorkbook(buffer);
  const sheet = workbook.worksheets[0];
  if (!sheet) throw new XlsxParseError("Workbook has no worksheets");

  const matrix: string[][] = [];
  sheet.eachRow({ includeEmpty: false }, (row) => {
    const cells: string[] = [];
    row.eachCell({ includeEmpty: true }, (cell, colNumber) => {
      cells[colNumber - 1] = cellToString(cell.value).trim();
    });
    for (let i = 0; i < cells.length; i++) if (cells[i] === undefined) cells[i] = "";
    matrix.push(cells);
  });

  const nonEmpty = matrix.filter((r) => r.some((c) => c !== ""));
  const headerRow = nonEmpty[0];
  if (!headerRow) throw new XlsxParseError("Workbook contains no rows");

  const headers = headerRow.map((h) => h.trim());
  if (headers.length === 0 || headers.every((h) => h === "")) {
    throw new XlsxParseError("Workbook has no header row");
  }
  const width = headers.length;
  const rows = nonEmpty.slice(1).map((r) => {
    const out = r.slice(0, width);
    while (out.length < width) out.push("");
    return out;
  });
  return { headers, rows };
}
