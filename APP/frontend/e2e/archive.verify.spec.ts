import { test, expect, type Page } from "@playwright/test";
import {
  deleteArchiveRow,
  deactivateVehicle,
  seedAvailableVehicle,
  staffToken,
  type SeededVehicle,
} from "./helpers/e2e-api";
import { attachArchiveApiGuard } from "./helpers/archive-api-guard";

/**
 * ARCHIVE-3A live verification against local dev backend + frontend.
 * Creates one temporary Archive row when needed and deletes it before exit.
 *
 * Run: npx playwright test e2e/archive.verify.spec.ts
 */
test.use({ channel: "chrome" });
test.describe.configure({ timeout: 300_000 });

const email = process.env.PLAYWRIGHT_LOGIN_EMAIL ?? "admin@diamond.test";
const password = process.env.PLAYWRIGHT_LOGIN_PASSWORD ?? "Diamond123!";
const SHOTS = "e2e/__screens__/archive";

const EXPECTED_COLUMN_LABELS_AR = [
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
    await page.locator("#email").fill(email);
    await page.locator("#password").fill(password);
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

async function openArchiveVehicleSelect(page: Page) {
  const select = page.getByTestId("archive-vehicle-select");
  await expect(select).toBeVisible({ timeout: 60_000 });
  await select.getByRole("combobox").click();
}

async function chooseVehicleOption(page: Page, vehicle: SeededVehicle) {
  await openArchiveVehicleSelect(page);
  const option = page.getByRole("option", { name: new RegExp(vehicle.plateNumber, "i") });
  await expect(option).toBeVisible({ timeout: 30_000 });
  const label = (await option.innerText()).trim();
  await option.click();
  return label;
}

test.describe("Archive ARCHIVE-3A", () => {
  test("Arabic desktop live verification", async ({ page }) => {
    const consoleErrors: string[] = [];
    page.on("console", (msg) => {
      if (msg.type() === "error") consoleErrors.push(msg.text());
    });
    page.on("pageerror", (error) => consoleErrors.push(error.message));

    const archiveCalls = attachArchiveApiGuard(page);
    const token = await staffToken();
    const vehicleA = await seedAvailableVehicle(token, { label: "Archive E2E A" });
    const vehicleB = await seedAvailableVehicle(token, { label: "Archive E2E B" });
    let createdRowId: number | null = null;

    try {
    await staffLogin(page, "ar");
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto("/ar/archive");
    await expect(page.getByTestId("archive-screen")).toBeVisible({ timeout: 60_000 });
    await page.screenshot({ path: `${SHOTS}/01-initial-ar-1440.png`, fullPage: true });

    const firstVehicleLabel = await chooseVehicleOption(page, vehicleA);
    await expect(page.getByTestId("archive-table")).toBeVisible({ timeout: 60_000 });
    await expect(page.getByTestId("archive-vehicle-header")).toContainText("—");
    await expect(page.getByTestId("archive-vehicle-header")).not.toHaveText("");

    const headers = page.locator("[data-testid^='archive-column-']");
    await expect(headers).toHaveCount(24);
    const headerTexts = await headers.allInnerTexts();
    assertColumnOrder(headerTexts, EXPECTED_COLUMN_LABELS_AR);

    await page.screenshot({ path: `${SHOTS}/02-selected-vehicle-ar-1440.png`, fullPage: true });

    const scroll = page.getByTestId("archive-table-scroll");
    await scroll.evaluate((node) => {
      node.scrollLeft = node.scrollWidth;
    });
    await expect(page.getByTestId("archive-column-remaining")).toBeVisible();
    await page.screenshot({ path: `${SHOTS}/03-scrolled-right-ar-1440.png`, fullPage: true });

    const secondVehicleLabel = await chooseVehicleOption(page, vehicleB);
    await expect(page.getByTestId("archive-vehicle-header")).toBeVisible({ timeout: 30_000 });
    expect(secondVehicleLabel).not.toBe(firstVehicleLabel);

    await chooseVehicleOption(page, vehicleA);
    await expect(page.getByTestId("archive-table")).toBeVisible({ timeout: 60_000 });

    const createResponsePromise = page.waitForResponse(
      (res) => res.request().method() === "POST" && res.url().includes("/archive/vehicles/") && res.url().includes("/rows"),
      { timeout: 30_000 },
    );
    await page.getByTestId("archive-add-row").click();
    const createResponse = await createResponsePromise;
    expect(createResponse.ok()).toBeTruthy();
    const created = (await createResponse.json()) as { data: { id: number } };
    createdRowId = created.data.id;

    const row = page.getByTestId(`archive-row-${createdRowId}`);
    await expect(row).toBeVisible({ timeout: 30_000 });

    const customerCell = row.locator("[data-testid='archive-cell-customerName'] input");
    await customerCell.fill("ARCHIVE-3A TEST");
    const blurPatchPromise = page.waitForResponse(
      (res) => res.request().method() === "PATCH" && res.url().includes(`/archive/rows/${createdRowId}`),
      { timeout: 30_000 },
    );
    await customerCell.blur();
    const blurPatch = await blurPatchPromise;
    expect(blurPatch.ok()).toBeTruthy();
    const blurBody = blurPatch.request().postDataJSON() as Record<string, unknown>;
    expect(Object.keys(blurBody)).toEqual(["customerName"]);

    const kmCell = row.locator("[data-testid='archive-cell-km'] input");
    await kmCell.fill("0");
    const enterPatchUrls: string[] = [];
    page.on("request", (request) => {
      if (request.method() === "PATCH" && request.url().includes(`/archive/rows/${createdRowId}`)) {
        enterPatchUrls.push(request.url());
      }
    });
    const enterPatchPromise = page.waitForResponse(
      (res) => res.request().method() === "PATCH" && res.url().includes(`/archive/rows/${createdRowId}`),
      { timeout: 30_000 },
    );
    await kmCell.press("Enter");
    await enterPatchPromise;
    expect(enterPatchUrls.length).toBe(1);

    await expect(kmCell).toHaveValue("0");
    await kmCell.fill("");
    const clearPatchPromise = page.waitForResponse(
      (res) => res.request().method() === "PATCH" && res.url().includes(`/archive/rows/${createdRowId}`),
      { timeout: 30_000 },
    );
    await kmCell.blur();
    const clearPatch = await clearPatchPromise;
    expect((clearPatch.request().postDataJSON() as { km: null }).km).toBeNull();

    const phoneCell = row.locator("[data-testid='archive-cell-customerPhone'] input");
    await phoneCell.fill("+971501234567");
    const phonePatchPromise = page.waitForResponse(
      (res) => res.request().method() === "PATCH" && res.url().includes(`/archive/rows/${createdRowId}`),
      { timeout: 30_000 },
    );
    await phoneCell.blur();
    await phonePatchPromise;
    const refreshRowsPromise = page.waitForResponse(
      (res) => res.request().method() === "GET" && res.url().includes("/archive/vehicles/") && res.url().includes("/rows"),
      { timeout: 30_000 },
    );
    await page.getByRole("button", { name: "تحديث" }).click();
    await refreshRowsPromise;
    await expect(phoneCell).toHaveValue("+971501234567");

    const deleteButton = row.getByRole("button", { name: /حذف الصف/i });
    await deleteButton.click();
    await expect(page.getByRole("heading", { name: "حذف صف الأرشيف؟" })).toBeVisible();
    await page.getByRole("button", { name: "إلغاء" }).click();
    await expect(row).toBeVisible();

    const deleteResponsePromise = page.waitForResponse(
      (res) => res.request().method() === "DELETE" && res.url().includes(`/archive/rows/${createdRowId}`),
      { timeout: 30_000 },
    );
    await deleteButton.click();
    await page.getByTestId("shared-dialog").getByRole("button", { name: "حذف الصف", exact: true }).click();
    const deleteResponse = await deleteResponsePromise;
    expect(deleteResponse.ok()).toBeTruthy();
    await expect(page.getByTestId("shared-dialog")).toBeHidden({ timeout: 15_000 });
    await expect(row).toHaveCount(0);
    createdRowId = null;

    expect(archiveCalls.length).toBeGreaterThan(0);
    expect(archiveCalls.every((call) => call.url.includes("/archive"))).toBeTruthy();

    const archiveConsoleErrors = consoleErrors.filter(
      (message) =>
        message.toLowerCase().includes("archive") ||
        message.includes("Hydration") ||
        message.includes("Warning: Each child in a list"),
    );
    expect(archiveConsoleErrors).toEqual([]);
    } finally {
      if (createdRowId != null) {
        await deleteArchiveRow(token, createdRowId);
      }
      await deactivateVehicle(token, vehicleA.id);
      await deactivateVehicle(token, vehicleB.id);
    }
  });

  test("English LTR layout", async ({ page }) => {
    await staffLogin(page, "en");
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto("/en/archive");
    await expect(page.getByTestId("archive-screen")).toBeVisible({ timeout: 60_000 });
    await page.screenshot({ path: `${SHOTS}/04-english-ltr-1440.png`, fullPage: true });
    const dir = await page.locator("html").getAttribute("dir");
    expect(dir).toBe("ltr");
  });

  test("Tablet viewport keeps horizontal table scroll", async ({ page }) => {
    const token = await staffToken();
    const vehicle = await seedAvailableVehicle(token, { label: "Archive Tablet" });
    try {
    await staffLogin(page, "ar");
    await page.setViewportSize({ width: 768, height: 900 });
    await page.goto("/ar/archive");
    await expect(page.getByTestId("archive-screen")).toBeVisible({ timeout: 60_000 });
    await chooseVehicleOption(page, vehicle);
    await expect(page.getByTestId("archive-table-scroll")).toBeVisible({ timeout: 60_000 });
    const pageWidth = await page.evaluate(() => document.documentElement.scrollWidth);
    expect(pageWidth).toBeLessThanOrEqual(820);
    await page.screenshot({ path: `${SHOTS}/05-tablet-ar-768.png`, fullPage: true });
    } finally {
      await deactivateVehicle(token, vehicle.id);
    }
  });
});

function assertColumnOrder(actual: string[], expected: string[]) {
  const normalizedActual = actual.map((value) => value.trim());
  for (let index = 0; index < expected.length; index += 1) {
    expect(normalizedActual[index]).toBe(expected[index]);
  }
}
