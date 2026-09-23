import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it } from "node:test";
import { ARCHIVE_COLUMNS } from "./utils/archive-columns.ts";
import { ARCHIVE_MANAGE_PERMISSION, ARCHIVE_READ_PERMISSION } from "./archive.permissions.ts";

const moduleDir = path.dirname(fileURLToPath(import.meta.url));
const read = (relative: string) => readFileSync(path.join(moduleDir, relative), "utf8");

describe("archive interaction contracts", () => {
  it("editable cell keeps draft on failed save and guards duplicate commits", () => {
    const source = read("components/archive-editable-cell/archive-editable-cell.tsx");
    assert.match(source, /commitInFlightRef/);
    assert.match(source, /isSaving \|\| commitInFlightRef\.current/);
    assert.doesNotMatch(source, /if \(!ok\)[\s\S]*setDraft\(serverValue\)/);
  });

  it("store invalidates stale vehicle row responses", () => {
    const source = read("stores/archive.store.ts");
    assert.match(source, /rowsRequestId/);
    assert.match(source, /requestId !== rowsRequestId/);
    assert.match(source, /get\(\)\.selectedVehicleId !== vehicleId/);
    assert.doesNotMatch(source, /rowsInFlight/);
  });

  it("store guards patch, create, and delete against vehicle switches", () => {
    const source = read("stores/archive.store.ts");
    assert.match(source, /existing\.vehicleId !== vehicleId/);
    assert.ok(source.includes("async createRow()"));
    assert.ok(source.includes("async deleteRow(rowId)"));
    const createGuardCount = source.match(/get\(\)\.selectedVehicleId !== vehicleId/g)?.length ?? 0;
    assert.ok(createGuardCount >= 3);
  });

  it("archive API uses only archive endpoints", () => {
    const source = read("api/archive.api.ts");
    assert.match(source, /ARCHIVE_PATH = "\/archive"/);
    assert.match(source, /\$\{ARCHIVE_PATH\}\/vehicles/);
    assert.match(source, /\$\{ARCHIVE_PATH\}\/rows/);
    assert.doesNotMatch(source, /\/contracts/);
    assert.doesNotMatch(source, /\/customers/);
    assert.doesNotMatch(source, /\/finance/);
    assert.doesNotMatch(source, /\/payments/);
    assert.doesNotMatch(source, /\/maintenance/);
    assert.doesNotMatch(source, /\/gps/);
    assert.doesNotMatch(source, /\/tars/);
  });

  it("archive screen wires table through domain hook only", () => {
    const source = read("components/archive-screen/archive-screen.tsx");
    assert.match(source, /useArchive\(/);
    assert.doesNotMatch(source, /useArchiveStore/);
    assert.doesNotMatch(source, /archive\.api/);
  });

  it("delete dialog requires explicit confirmation", () => {
    const source = read("components/archive-delete-row-dialog/archive-delete-row-dialog.tsx");
    assert.match(source, /onConfirm/);
    assert.match(source, /onClose/);
    assert.doesNotMatch(source, /onConfirm=\{onClose\}/);
  });

  it("table renders vehicle header above 24 business columns", () => {
    const source = read("components/archive-table/archive-table.tsx");
    assert.match(source, /archive-vehicle-header/);
    assert.match(source, /ARCHIVE_COLUMNS\.map/);
    assert.equal(ARCHIVE_COLUMNS.length, 24);
  });

  it("permissions gate manage actions separately from page access", () => {
    const hookSource = read("hooks/use-archive.ts");
    assert.match(hookSource, /ARCHIVE_PAGE_PERMISSIONS/);
    assert.match(hookSource, /ARCHIVE_MANAGE_PERMISSION/);
    assert.match(hookSource, /canManage = hasPermission\(ARCHIVE_MANAGE_PERMISSION\)/);
    assert.equal(ARCHIVE_READ_PERMISSION, "archive.read");
    assert.equal(ARCHIVE_MANAGE_PERMISSION, "archive.manage");
  });

  it("phone field stays string-based in cell parsing", () => {
    const source = read("utils/archive-cell-value.ts");
    assert.doesNotMatch(source, /parseInt[\s\S]*customerPhone/);
    assert.doesNotMatch(source, /Number\([\s\S]*customerPhone/);
  });

  it("date helpers avoid locale timezone conversion", () => {
    const source = read("utils/archive-date.ts");
    assert.doesNotMatch(source, /toLocaleDateString/);
    assert.match(source, /ISO_DATE_PREFIX/);
  });

  it("download excel button exists in archive toolbar", () => {
    const source = read("components/archive-screen/archive-screen.tsx");
    assert.match(source, /data-testid="archive-download-excel"/);
    assert.match(source, /t\("actions\.downloadExcel"\)/);
    assert.match(source, /t\("actions\.downloadingExcel"\)/);
  });

  it("download excel does not depend on selected vehicle", () => {
    const source = read("components/archive-screen/archive-screen.tsx");
    const buttonBlock = source.slice(
      source.indexOf('data-testid="archive-download-excel"') - 200,
      source.indexOf('data-testid="archive-download-excel"') + 400,
    );
    assert.doesNotMatch(buttonBlock, /selectedVehicleId/);
  });

  it("export API calls single archive export endpoint", () => {
    const source = read("api/archive.api.ts");
    const downloadBlock = source.slice(source.indexOf("export async function downloadArchiveExport"));
    assert.match(downloadBlock, /\$\{ARCHIVE_PATH\}\/export/);
    assert.match(downloadBlock, /response\.blob\(\)/);
    assert.doesNotMatch(downloadBlock, /listArchiveRows/);
  });

  it("store commits pending cell drafts before export and blocks failed drafts", () => {
    const source = read("stores/archive.store.ts");
    assert.match(source, /commitAllArchiveCellDrafts/);
    assert.match(source, /hasFailedCellEdits/);
    assert.match(source, /exportInFlight/);
    assert.match(source, /waitForArchiveSaves/);
    assert.match(source, /ARCHIVE_UNSAVED_CELL_ERROR/);
  });

  it("editable cells register committers for export flush", () => {
    const source = read("components/archive-editable-cell/archive-editable-cell.tsx");
    assert.match(source, /registerArchiveCellCommitter/);
  });
});
