import { test } from "node:test";
import assert from "node:assert/strict";
import ExcelJS from "exceljs";
import JSZip from "jszip";
import { parseCsv, CsvParseError } from "src/modules/imports/csv-parser";
import { parseXlsx, XlsxParseError } from "src/modules/imports/xlsx-parser";
import { detectAndParseImport } from "src/modules/imports/detect-source";
import { buildFieldExtractor, parseRow } from "src/modules/imports/row-parse";
import {
  IMPORT_FIELDS,
  REQUIRED_IMPORT_FIELD_KEYS,
} from "src/modules/imports/import-fields";

/** Machine-readable reason of the AppError a thunk is expected to throw. */
async function rejectionReason(fn: () => Promise<unknown>): Promise<string> {
  try {
    await fn();
  } catch (err) {
    return (err as { context?: { reason?: string } }).context?.reason ?? "no-reason";
  }
  throw new Error("expected the call to throw, but it resolved");
}

// --- CSV parser ---

test("parseCsv reads header + rows and normalizes row width", () => {
  const table = parseCsv("a,b,c\n1,2,3\n4,5");
  assert.deepEqual(table.headers, ["a", "b", "c"]);
  assert.deepEqual(table.rows, [
    ["1", "2", "3"],
    ["4", "5", ""], // short row padded to header width
  ]);
});

test("parseCsv handles quoted fields, embedded commas/newlines and escaped quotes", () => {
  const table = parseCsv('name,note\r\n"Doe, John","line1\nline2"\r\n"He said ""hi""",x');
  assert.deepEqual(table.headers, ["name", "note"]);
  assert.deepEqual(table.rows[0], ["Doe, John", "line1\nline2"]);
  assert.deepEqual(table.rows[1], ['He said "hi"', "x"]);
});

test("parseCsv strips a UTF-8 BOM and drops fully blank rows", () => {
  const table = parseCsv("﻿a,b\n1,2\n\n3,4\n");
  assert.deepEqual(table.headers, ["a", "b"]);
  assert.deepEqual(table.rows, [
    ["1", "2"],
    ["3", "4"],
  ]);
});

test("parseCsv throws on empty input and on an unterminated quote", () => {
  assert.throws(() => parseCsv(""), CsvParseError);
  assert.throws(() => parseCsv('a,b\n"open,1'), CsvParseError);
});

// --- XLSX parser (same ParsedTable contract as CSV) ---

test("parseXlsx reads header + rows and coerces cells to strings", async () => {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("Sheet1");
  ws.addRow(["name", "modelYear", "note"]);
  ws.addRow(["Ali", 2024, "ok"]); // number cell coerced to "2024"
  const buf = Buffer.from(await wb.xlsx.writeBuffer());
  const table = await parseXlsx(buf);
  assert.deepEqual(table.headers, ["name", "modelYear", "note"]);
  assert.deepEqual(table.rows[0], ["Ali", "2024", "ok"]);
});

test("parseXlsx throws XlsxParseError on a non-workbook buffer", async () => {
  await assert.rejects(() => parseXlsx(Buffer.from("not a workbook")), XlsxParseError);
});

// A spec-valid workbook in the *namespace-prefixed* OOXML dialect the .NET OpenXML
// SDK / ClosedXML emit (`<x:workbook>`, `<x:sheet>`, `<x:c>`...). Excel opens these
// fine but exceljs — which matches on unprefixed local names — cannot, so parseXlsx
// must normalize and recover them. Also carries a table part exceljs would trip on.
const OOXML_NS = "http://schemas.openxmlformats.org/spreadsheetml/2006/main";
const OFFICE_REL = "http://schemas.openxmlformats.org/officeDocument/2006/relationships";
const PKG_REL = "http://schemas.openxmlformats.org/package/2006/relationships";
const PKG_CT = "http://schemas.openxmlformats.org/package/2006/content-types";

async function prefixedDialectXlsx(rows: string[][]): Promise<Buffer> {
  const cell = (r: number, c: number, v: string) =>
    `<x:c r="${String.fromCharCode(65 + c)}${r + 1}" t="str"><x:v>${v}</x:v></x:c>`;
  const sheetData = rows
    .map((row, r) => `<x:row r="${r + 1}">${row.map((v, c) => cell(r, c, v)).join("")}</x:row>`)
    .join("");
  const zip = new JSZip();
  zip.file(
    "[Content_Types].xml",
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="${PKG_CT}">` +
      `<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>` +
      `<Default Extension="xml" ContentType="application/xml"/>` +
      `<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>` +
      `<Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>` +
      `<Override PartName="/xl/tables/table1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.table+xml"/>` +
      `</Types>`,
  );
  zip.file(
    "_rels/.rels",
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="${PKG_REL}">` +
      `<Relationship Id="rId1" Type="${OFFICE_REL}/officeDocument" Target="xl/workbook.xml"/></Relationships>`,
  );
  zip.file(
    "xl/_rels/workbook.xml.rels",
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="${PKG_REL}">` +
      `<Relationship Id="rId1" Type="${OFFICE_REL}/worksheet" Target="worksheets/sheet1.xml"/></Relationships>`,
  );
  zip.file(
    "xl/workbook.xml",
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
      `<x:workbook xmlns:x="${OOXML_NS}"><x:sheets>` +
      `<x:sheet name="CustomerImport" sheetId="1" r:id="rId1" xmlns:r="${OFFICE_REL}"/></x:sheets></x:workbook>`,
  );
  zip.file(
    "xl/worksheets/_rels/sheet1.xml.rels",
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="${PKG_REL}">` +
      `<Relationship Id="rId1" Type="${OFFICE_REL}/table" Target="../tables/table1.xml"/></Relationships>`,
  );
  zip.file(
    "xl/tables/table1.xml",
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
      `<x:table xmlns:x="${OOXML_NS}" id="1" name="T" displayName="T" ref="A1:B2"><x:tableColumns count="2">` +
      `<x:tableColumn id="1" name="c1"/><x:tableColumn id="2" name="c2"/></x:tableColumns></x:table>`,
  );
  zip.file(
    "xl/worksheets/sheet1.xml",
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
      `<x:worksheet xmlns:x="${OOXML_NS}" xmlns:r="${OFFICE_REL}"><x:sheetData>${sheetData}</x:sheetData>` +
      `<x:tableParts count="1"><x:tablePart r:id="rId1"/></x:tableParts></x:worksheet>`,
  );
  return Buffer.from(await zip.generateAsync({ type: "nodebuffer" }));
}

/** A valid ZIP container whose payload is not a workbook at all. */
async function zipWithoutWorkbook(): Promise<Buffer> {
  const zip = new JSZip();
  zip.file("readme.txt", "this is a zip, but not a spreadsheet");
  return Buffer.from(await zip.generateAsync({ type: "nodebuffer" }));
}

test("exceljs cannot read the namespace-prefixed dialect (documents the root cause)", async () => {
  const buf = await prefixedDialectXlsx([["name"], ["Ali"]]);
  await assert.rejects(() => new ExcelJS.Workbook().xlsx.load(buf as never));
});

test("parseXlsx recovers a namespace-prefixed workbook with a table part", async () => {
  const buf = await prefixedDialectXlsx([
    ["name", "branchCode"],
    ["Ali", "RUH"],
    ["Sara", "JED"],
  ]);
  const table = await parseXlsx(buf);
  assert.deepEqual(table.headers, ["name", "branchCode"]);
  assert.deepEqual(table.rows, [
    ["Ali", "RUH"],
    ["Sara", "JED"],
  ]);
});

// --- File-type gate (detectAndParseImport): content decides the type, not the MIME ---

test("gate: valid XLSX with the canonical spreadsheet MIME is accepted", async () => {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("S");
  ws.addRow(["name", "branchCode"]);
  ws.addRow(["Zed", "JED"]);
  const buf = Buffer.from(await wb.xlsx.writeBuffer());
  const res = await detectAndParseImport(
    "book.xlsx",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    buf,
  );
  assert.equal(res.sourceType, "XLSX");
  assert.deepEqual(res.table.rows[0], ["Zed", "JED"]);
});

test("gate: valid XLSX with application/octet-stream is accepted (MIME is not the authority)", async () => {
  const buf = await prefixedDialectXlsx([["name"], ["Ali"]]);
  const res = await detectAndParseImport("book.xlsx", "application/octet-stream", buf);
  assert.equal(res.sourceType, "XLSX");
});

test("gate: valid XLSX with an empty/untrusted MIME is accepted on magic bytes alone", async () => {
  const buf = await prefixedDialectXlsx([["name"], ["Ali"]]);
  const res = await detectAndParseImport("book.xlsx", "", buf);
  assert.equal(res.sourceType, "XLSX");
});

test("gate: a text file renamed .xlsx is rejected as invalid_file_type", async () => {
  const reason = await rejectionReason(() =>
    detectAndParseImport("evil.xlsx", "text/csv", Buffer.from("a,b\n1,2\n")),
  );
  assert.equal(reason, "invalid_file_type");
});

test("gate: a valid ZIP that is not a workbook is rejected as invalid_xlsx_content", async () => {
  const notAWorkbook = await zipWithoutWorkbook();
  const reason = await rejectionReason(() =>
    detectAndParseImport("book.xlsx", "application/octet-stream", notAWorkbook),
  );
  assert.equal(reason, "invalid_xlsx_content");
});

test("gate: CSV import still works unchanged", async () => {
  const res = await detectAndParseImport("data.csv", "text/csv", Buffer.from("name,branchCode\nAli,RUH\n"));
  assert.equal(res.sourceType, "CSV");
  assert.deepEqual(res.table.rows[0], ["Ali", "RUH"]);
});

test("gate: binary content in a .csv (NUL bytes) is rejected as invalid_file_type", async () => {
  const reason = await rejectionReason(() =>
    detectAndParseImport("data.csv", "text/csv", Buffer.from([0x61, 0x00, 0x62])),
  );
  assert.equal(reason, "invalid_file_type");
});

test("gate: an unsupported extension is rejected as invalid_file_type", async () => {
  const reason = await rejectionReason(() =>
    detectAndParseImport("report.pdf", "application/pdf", Buffer.from("%PDF-1.4")),
  );
  assert.equal(reason, "invalid_file_type");
});

// --- Field catalog ---

test("required import fields are name, vehicleModelName, branchName (business names)", () => {
  assert.deepEqual([...REQUIRED_IMPORT_FIELD_KEYS].sort(), ["branchName", "name", "vehicleModelName"]);
  assert.ok(IMPORT_FIELDS.find((f) => f.key === "externalCustomerId")?.identity);
  assert.ok(IMPORT_FIELDS.find((f) => f.key === "vin")?.identity);
  // Technical code / external-id keys stay in the catalog but are hidden (advanced).
  assert.equal(IMPORT_FIELDS.find((f) => f.key === "vehicleModelCode")?.hidden, true);
  assert.equal(IMPORT_FIELDS.find((f) => f.key === "branchCode")?.hidden, true);
  assert.equal(IMPORT_FIELDS.find((f) => f.key === "salespersonName")?.hidden, undefined);
});

test("new CX fields (color/financing/insurance/salesChannel) are optional, non-identity", () => {
  for (const key of ["vehicleColor", "financingType", "insuranceType", "salesChannel"]) {
    const def = IMPORT_FIELDS.find((f) => f.key === key);
    assert.ok(def, `${key} missing from catalog`);
    assert.equal(def?.required, false, `${key} must stay optional (backward compat)`);
    assert.equal(def?.identity, false, `${key} is display-only, never a matching key`);
  }
  // Adding them does not change the required set — files still validate on business names.
  assert.deepEqual([...REQUIRED_IMPORT_FIELD_KEYS].sort(), ["branchName", "name", "vehicleModelName"]);
});

// --- Field extraction ---

test("buildFieldExtractor maps only mapped headers to field keys", () => {
  const extract = buildFieldExtractor(
    ["Chassis", "Full Name", "Ignored"],
    { Chassis: "vin", "Full Name": "name" },
  );
  assert.deepEqual(extract([" 1abc ", "Ali", "x"]), { vin: "1abc", name: "Ali" });
});

// --- Row parsing / normalization ---

function baseFields(overrides: Record<string, string> = {}): Record<string, string> {
  return {
    name: "Ahmed",
    vehicleModelCode: "attrage",
    branchCode: "riyadh-1",
    ...overrides,
  };
}

test("parseRow normalizes VIN/email/phone/code and defaults type", () => {
  const { row, issues } = parseRow(
    baseFields({ vin: " jn1 az4 ", email: "A@B.COM", mobile: "+966 50 111 2222" }),
  );
  assert.equal(issues.length, 0);
  assert.equal(row.vehicle.vin, "JN1AZ4");
  assert.equal(row.customer.email, "a@b.com");
  assert.equal(row.vehicle.vehicleModelCode, "ATTRAGE");
  assert.equal(row.experience.branchCode, "RIYADH-1");
  assert.equal(row.customer.type, "INDIVIDUAL");
});

test("parseRow flags missing required fields (name + business names)", () => {
  const { issues } = parseRow({ mobile: "0500000000" });
  const fields = issues.map((i) => i.field).sort();
  assert.deepEqual(fields, ["branchName", "name", "vehicleModelName"]);
  assert.ok(issues.every((i) => i.code === "required"));
});

test("parseRow accepts business names and leaves codes null", () => {
  const { row, issues } = parseRow({
    name: "Ahmed",
    vehicleModelName: "  Attrage  ",
    branchName: "Riyadh Main",
    salespersonName: "Sami",
  });
  assert.equal(issues.length, 0);
  assert.equal(row.vehicle.vehicleModelName, "Attrage");
  assert.equal(row.vehicle.vehicleModelCode, null);
  assert.equal(row.experience.branchName, "Riyadh Main");
  assert.equal(row.experience.salespersonName, "Sami");
});

test("parseRow still accepts the ERP code path (name OR code)", () => {
  const { row, issues } = parseRow({ name: "Ahmed", vehicleModelCode: "attrage", branchCode: "riyadh-1" });
  assert.equal(issues.length, 0);
  assert.equal(row.vehicle.vehicleModelCode, "ATTRAGE");
  assert.equal(row.experience.branchCode, "RIYADH-1");
  assert.equal(row.vehicle.vehicleModelName, null);
});

test("parseRow rejects a bad model year, date, type and boolean", () => {
  const { issues } = parseRow(
    baseFields({ modelYear: "abcd", purchaseDate: "not-a-date", type: "ROBOT", optOutSms: "maybe" }),
  );
  const byField = new Set(issues.map((i) => i.field));
  assert.ok(byField.has("modelYear"));
  assert.ok(byField.has("purchaseDate"));
  assert.ok(byField.has("type"));
  assert.ok(byField.has("optOutSms"));
});

test("parseRow keeps new CX labels verbatim (trimmed) and null when unmapped", () => {
  // Mapped columns → trimmed free-text (no normalization/uppercasing).
  const mapped = parseRow(
    baseFields({
      vehicleColor: "  Pearl White ",
      financingType: "Bank finance",
      insuranceType: "Comprehensive",
      salesChannel: "Showroom",
    }),
  );
  assert.equal(mapped.issues.length, 0);
  assert.equal(mapped.row.vehicle.color, "Pearl White");
  assert.equal(mapped.row.experience.financingType, "Bank finance");
  assert.equal(mapped.row.experience.insuranceType, "Comprehensive");
  assert.equal(mapped.row.experience.salesChannel, "Showroom");

  // Unmapped (old file) → null, no issues. Backward compatible.
  const legacy = parseRow(baseFields());
  assert.equal(legacy.issues.length, 0);
  assert.equal(legacy.row.vehicle.color, null);
  assert.equal(legacy.row.experience.financingType, null);
  assert.equal(legacy.row.experience.insuranceType, null);
  assert.equal(legacy.row.experience.salesChannel, null);
});

test("parseRow parses booleans, COMPANY type and ISO dates", () => {
  const { row, issues } = parseRow(
    baseFields({
      type: "company",
      optOutWhatsApp: "yes",
      optOutEmail: "false",
      purchaseDate: "2025-03-01",
      externalSaleId: "SALE-1",
    }),
  );
  assert.equal(issues.length, 0);
  assert.equal(row.customer.type, "COMPANY");
  assert.equal(row.customer.optOutWhatsApp, true);
  assert.equal(row.customer.optOutEmail, false);
  assert.equal(row.experience.purchaseDate?.toISOString(), "2025-03-01T00:00:00.000Z");
  assert.equal(row.experience.externalSaleId, "SALE-1");
});
