import path from "node:path";
import { test, expect, type Page, type Response } from "@playwright/test";
import {
  BACKEND,
  STAFF_EMAIL,
  STAFF_PASSWORD,
  deleteArchiveRow,
  deactivateVehicle,
  seedAvailableVehicle,
  staffToken,
} from "./helpers/e2e-api";

// Playwright runs in Node; reuse backend exceljs for workbook inspection.
// eslint-disable-next-line @typescript-eslint/no-require-imports
const ExcelJSRuntime = require(path.resolve(process.cwd(), "../backend/node_modules/exceljs"));

/**
 * ARCHIVE-4 live Excel export verification.
 * Run: npx playwright test e2e/archive-export.verify.spec.ts
 */
test.use({ channel: "chrome" });
test.describe.configure({ timeout: 300_000 });


const EXPECTED_HEADERS = [
  "KM OUT",
  "KM IN",
  "KM",
  "تاريخ التسليم",
  "ساعة التسليم",
  "تاريخ الارجاع",
  "ساعة الارجاع",
  "اسم الزبون",
  "رقم الزبون",
  "شرح",
  "عدد الايام",
  "سعر اليوم",
  "مجموع الايجار",
  "سالك",
  "parking",
  "بترول",
  "نقاط سوداء",
  "مخالفات",
  "المجموع",
  "دولار",
  "كاش",
  "فيزا",
  "حوالة",
  "الباقي",
];

async function staffLogin(page: Page, locale: "ar" | "en") {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    await page.goto(`/${locale}/login`, { waitUntil: "domcontentloaded", timeout: 60_000 });
    if (!page.url().includes("/login")) return;
    await expect(page.locator("#email")).toBeVisible({ timeout: 60_000 });
    await page.locator("#email").fill(STAFF_EMAIL);
    await page.locator("#password").fill(STAFF_PASSWORD);
    await page.getByRole("button", { name: /دخول|login|sign in/i }).click();
    try {
      await page.waitForURL((url) => !url.pathname.includes("/login"), { timeout: 30_000 });
      return;
    } catch (error) {
      if (attempt === 2) throw error;
      await page.waitForTimeout(2_000);
    }
  }
}

async function openVehicle(page: Page, plateNumber: string) {
  const select = page.getByTestId("archive-vehicle-select");
  await select.getByRole("combobox").click();
  const option = page.getByRole("option", { name: new RegExp(plateNumber, "i") });
  await expect(option).toBeVisible({ timeout: 30_000 });
  await option.click();
  await expect(page.getByTestId("archive-table")).toBeVisible({ timeout: 60_000 });
}

async function fleetVehicleCount(token: string): Promise<number> {
  const response = await fetch(`${BACKEND}/archive/vehicles`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  expect(response.ok).toBeTruthy();
  const body = (await response.json()) as { data: unknown[] };
  return body.data.length;
}

async function inspectWorkbook(filePath: string, fleetCount: number) {
  const wb = new ExcelJSRuntime.Workbook();
  await wb.xlsx.readFile(filePath);
  expect(wb.worksheets.length).toBe(fleetCount);
  const sheetNames = wb.worksheets.map((ws: { name: string }) => ws.name);
  expect(new Set(sheetNames).size).toBe(sheetNames.length);

  const first = wb.worksheets[0]!;
  expect(first.model.merges?.includes("A1:X1")).toBe(true);
  expect(String(first.getCell("A1").value ?? "")).toMatch(/—/);
  for (let index = 0; index < EXPECTED_HEADERS.length; index += 1) {
    expect(first.getRow(2).getCell(index + 1).value).toBe(EXPECTED_HEADERS[index]);
  }

  return { wb, first };
}

test.describe("Archive ARCHIVE-4 Excel export", () => {
  test("downloads full-fleet workbook and preserves persisted values", async ({ page }) => {
    const token = await staffToken();
    const vehicle = await seedAvailableVehicle(token, { label: "Archive Export E2E" });
    let createdRowId: number | null = null;

    const consoleErrors: string[] = [];
    page.on("console", (msg) => {
      if (msg.type() === "error") consoleErrors.push(msg.text());
    });

    const exportCalls: string[] = [];
    let exportAuditActive = false;
    const rowListCallsDuringExport: string[] = [];
    page.on("response", (response: Response) => {
      const url = response.url();
      if (url.includes("/archive/export")) exportCalls.push(url);
      if (
        exportAuditActive &&
        url.includes("/archive/vehicles/") &&
        url.includes("/rows")
      ) {
        rowListCallsDuringExport.push(url);
      }
    });

    try {
    await staffLogin(page, "ar");
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto("/ar/archive");
    await expect(page.getByTestId("archive-download-excel")).toBeVisible({ timeout: 60_000 });

    const downloadNoVehiclePromise = page.waitForEvent("download");
    const exportNoVehiclePromise = page.waitForResponse(
      (res) => res.request().method() === "GET" && res.url().includes("/archive/export"),
    );
    const fleetCountNoVehicle = await fleetVehicleCount(token);
    expect(fleetCountNoVehicle).toBeGreaterThan(0);
    exportAuditActive = true;
    await page.getByTestId("archive-download-excel").click();
    const downloadNoVehicle = await downloadNoVehiclePromise;
    await exportNoVehiclePromise;
    const noVehicleFilename = downloadNoVehicle.suggestedFilename();
    expect(noVehicleFilename.endsWith(".xlsx")).toBeTruthy();
    const noVehiclePath = await downloadNoVehicle.path();
    expect(noVehiclePath).toBeTruthy();
    const noVehicleStats = await downloadNoVehicle.createReadStream();
    let noVehicleBytes = 0;
    for await (const chunk of noVehicleStats) noVehicleBytes += (chunk as Buffer).length;
    expect(noVehicleBytes).toBeGreaterThan(0);
    await inspectWorkbook(noVehiclePath!, fleetCountNoVehicle);
    exportAuditActive = false;

    await openVehicle(page, vehicle.plateNumber);

    const createResponsePromise = page.waitForResponse(
      (res) => res.request().method() === "POST" && res.url().includes("/archive/vehicles/") && res.url().includes("/rows"),
    );
    await page.getByTestId("archive-add-row").click();
    const createResponse = await createResponsePromise;
    createdRowId = ((await createResponse.json()) as { data: { id: number } }).data.id;
    const row = page.getByTestId(`archive-row-${createdRowId}`);

    await row.locator("[data-testid='archive-cell-customerName'] input").fill("ARCHIVE-4 TEST");
    await row.locator("[data-testid='archive-cell-customerPhone'] input").fill("0501234567");
    await row.locator("[data-testid='archive-cell-km'] input").fill("0");
    await row.locator("[data-testid='archive-cell-description'] input").fill("Excel export verification");
    await row.locator("[data-testid='archive-cell-deliveryDate'] input").fill("2026-09-23");
    await row.locator("[data-testid='archive-cell-deliveryTime'] input").fill("09:30");

    const patchPromise = page.waitForResponse(
      (res) => res.request().method() === "PATCH" && res.url().includes(`/archive/rows/${createdRowId}`),
      { timeout: 30_000 },
    );
    await row.locator("[data-testid='archive-cell-deliveryTime'] input").blur();
    await patchPromise;

    const unsavedDownloadPromise = page.waitForEvent("download");
    const unsavedExportPromise = page.waitForResponse(
      (res) => res.request().method() === "GET" && res.url().includes("/archive/export"),
      { timeout: 60_000 },
    );
    await row.locator("[data-testid='archive-cell-customerName'] input").fill("ARCHIVE-4 LIVE SAVE");
    const fleetCountUnsaved = await fleetVehicleCount(token);
    exportAuditActive = true;
    await page.getByTestId("archive-download-excel").click();
    await unsavedExportPromise;
    const unsavedDownload = await unsavedDownloadPromise;
    const unsavedPath = await unsavedDownload.path();
    expect(unsavedPath).toBeTruthy();
    const { wb: unsavedWb } = await inspectWorkbook(unsavedPath!, fleetCountUnsaved);
    let foundLiveSave = false;
    for (const ws of unsavedWb.worksheets) {
      ws.eachRow((dataRow: { getCell: (index: number) => { value: unknown } }, rowNumber: number) => {
        if (rowNumber < 3) return;
        if (dataRow.getCell(8).value === "ARCHIVE-4 LIVE SAVE") foundLiveSave = true;
      });
    }
    expect(foundLiveSave).toBeTruthy();

    exportAuditActive = false;

    const downloadPromise = page.waitForEvent("download");
    const fleetCountFinal = await fleetVehicleCount(token);
    exportAuditActive = true;
    await page.getByTestId("archive-download-excel").click();
    const download = await downloadPromise;
    const filename = download.suggestedFilename();
    expect(filename.endsWith(".xlsx")).toBeTruthy();
    const filePath = await download.path();
    expect(filePath).toBeTruthy();

    const { wb } = await inspectWorkbook(filePath!, fleetCountFinal);
    let foundPhone = false;
    let foundZero = false;
    let foundDescription = false;
    for (const ws of wb.worksheets) {
      ws.eachRow((dataRow: { getCell: (index: number) => { value: unknown } }, rowNumber: number) => {
        if (rowNumber < 3) return;
        if (dataRow.getCell(9).value === "0501234567") foundPhone = true;
        if (dataRow.getCell(3).value === 0) foundZero = true;
        if (dataRow.getCell(10).value === "Excel export verification") foundDescription = true;
      });
    }
    expect(foundPhone).toBeTruthy();
    expect(foundZero).toBeTruthy();
    expect(foundDescription).toBeTruthy();

    exportAuditActive = false;
    expect(exportCalls.length).toBeGreaterThanOrEqual(2);
    expect(exportCalls.every((url) => url.includes("/archive/export"))).toBeTruthy();
    expect(rowListCallsDuringExport.length).toBe(0);

    const deleteResponsePromise = page.waitForResponse(
      (res) => res.request().method() === "DELETE" && res.url().includes(`/archive/rows/${createdRowId}`),
    );
    await row.getByRole("button", { name: /حذف الصف/i }).click();
    await page.getByTestId("shared-dialog").getByRole("button", { name: "حذف الصف", exact: true }).click();
    await deleteResponsePromise;

    const archiveConsoleErrors = consoleErrors.filter((message) => message.toLowerCase().includes("archive"));
    expect(archiveConsoleErrors).toEqual([]);
    } finally {
      if (createdRowId != null) {
        await deleteArchiveRow(token, createdRowId);
      }
      await deactivateVehicle(token, vehicle.id);
    }
  });
});
