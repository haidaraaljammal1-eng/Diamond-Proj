import { test, expect, type Locator, type Page } from "@playwright/test";
import path from "node:path";

/**
 * Visual column-alignment QA for Final Reconciliation tables.
 *
 * Run: npx playwright test e2e/final-reconciliation.alignment.spec.ts
 */
test.use({ channel: "chrome" });
test.describe.configure({ timeout: 240_000, mode: "serial" });

const email = process.env.PLAYWRIGHT_LOGIN_EMAIL ?? "admin@diamond.test";
const password = process.env.PLAYWRIGHT_LOGIN_PASSWORD ?? "Diamond123!";
const ALIGN_TOLERANCE_PX = 4;

const VIEWPORTS = [
  { width: 1366, height: 768, name: "1366x768" },
  { width: 1440, height: 900, name: "1440x900" },
  { width: 1920, height: 1080, name: "1920x1080" },
] as const;

async function login(page: Page, locale: "ar" | "en") {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    await page.goto(`/${locale}/login`);
    if (!page.url().includes("/login")) return;
    await page.locator("#email").fill(email);
    await page.locator("#password").fill(password);
    await page.getByRole("button", { name: /دخول|login|sign in/i }).click();
    try {
      await page.waitForURL((url) => !url.pathname.includes("/login"), { timeout: 25_000 });
      return;
    } catch (error) {
      if (attempt === 2) throw error;
      await page.waitForTimeout(2_000);
    }
  }
}

async function openFinalReconciliation(page: Page, locale: "ar" | "en") {
  await page.goto(`/${locale}/contracts`, { waitUntil: "domcontentloaded" });
  await expect(page.getByTestId("contracts-table")).toBeVisible({ timeout: 60_000 });

  const reviewFilter = page.getByRole("button", {
    name: locale === "ar" ? "مراجعة التسوية" : "Reconciliation review",
  });
  if (await reviewFilter.count()) {
    await reviewFilter.click();
  }

  const reconcileAction = page
    .getByRole("button", {
      name: locale === "ar" ? "المطابقة" : "Reconciliation",
      exact: true,
    })
    .first();
  test.skip((await reconcileAction.count()) === 0, "No REVIEW contract available for Final Reconciliation");
  await expect(reconcileAction).toBeVisible({ timeout: 30_000 });
  await reconcileAction.click();
  await expect(page.getByTestId("shared-dialog")).toBeVisible({ timeout: 30_000 });
  await expect(page.getByTestId("reconciliation-loading")).toBeHidden({ timeout: 30_000 });
  await expect(page.getByTestId("reconciliation-metric-table")).toBeVisible({ timeout: 30_000 });
}

async function centerX(locator: Locator): Promise<number> {
  await locator.scrollIntoViewIfNeeded();
  await expect(locator).toBeVisible();
  return locator.evaluate((element) => {
    const rect = element.getBoundingClientRect();
    return rect.x + rect.width / 2;
  });
}

async function expectSameColumn(header: Locator, ...cells: Locator[]) {
  const headerCenter = await centerX(header);
  for (const cell of cells) {
    await expect(cell).toBeVisible();
    const cellCenter = await centerX(cell);
    expect(Math.abs(headerCenter - cellCenter), `column drift ${Math.abs(headerCenter - cellCenter)}px`).toBeLessThanOrEqual(
      ALIGN_TOLERANCE_PX,
    );
  }
}

async function assertMetricTableAlignment(page: Page) {
  await expectSameColumn(
    page.getByTestId("reconciliation-metric-header-car-out"),
    page.getByTestId("reconciliation-metric-mileage-car-out"),
    page.getByTestId("reconciliation-metric-fuel-car-out"),
  );
  await expectSameColumn(
    page.getByTestId("reconciliation-metric-header-car-in"),
    page.getByTestId("reconciliation-metric-mileage-car-in"),
    page.getByTestId("reconciliation-metric-fuel-car-in"),
  );
  await expectSameColumn(
    page.getByTestId("reconciliation-metric-header-difference"),
    page.getByTestId("reconciliation-metric-mileage-difference"),
    page.getByTestId("reconciliation-metric-fuel-difference"),
  );
}

async function assertFuelEighthsFormat(page: Page) {
  const fuelCells = [
    page.getByTestId("reconciliation-metric-fuel-car-out"),
    page.getByTestId("reconciliation-metric-fuel-car-in"),
    page.getByTestId("reconciliation-metric-fuel-difference"),
  ];
  for (const cell of fuelCells) {
    const text = (await cell.innerText()).trim();
    if (text === "—") continue;
    expect(text).toMatch(/^[+-]?\d+\/8( km)?$/);
  }
}

async function assertRoadLiabilityAlignmentIfPresent(page: Page) {
  const liabilitySection = page.getByTestId("reconciliation-road-liabilities");
  if ((await liabilitySection.count()) === 0) return;

  const firstRow = liabilitySection.locator("tbody tr").first();
  if ((await firstRow.count()) === 0) return;

  const rowId = await firstRow.getAttribute("data-testid");
  if (!rowId) return;
  const id = rowId.replace("road-liability-", "");

  await expectSameColumn(
    page.getByTestId("reconciliation-liability-header-official"),
    page.getByTestId(`reconciliation-liability-official-${id}`),
  );
  await expectSameColumn(
    page.getByTestId("reconciliation-liability-header-admin"),
    page.getByTestId(`reconciliation-liability-admin-${id}`),
  );
  await expectSameColumn(
    page.getByTestId("reconciliation-liability-header-charge"),
    page.getByTestId(`reconciliation-liability-charge-${id}`),
  );
}

for (const viewport of VIEWPORTS) {
  test.describe(`viewport ${viewport.name}`, () => {
    test.use({ viewport: { width: viewport.width, height: viewport.height } });

    test(`Arabic metric + liability column alignment @ ${viewport.name}`, async ({ page }) => {
      await login(page, "ar");
      await openFinalReconciliation(page, "ar");
      await assertMetricTableAlignment(page);
      await assertFuelEighthsFormat(page);
      await assertRoadLiabilityAlignmentIfPresent(page);
      await page.screenshot({
        path: path.join("test-results", `reconciliation-ar-${viewport.name}.png`),
        fullPage: false,
      });
    });

    test(`English metric + liability column alignment @ ${viewport.name}`, async ({ page }) => {
      await login(page, "en");
      await openFinalReconciliation(page, "en");
      await assertMetricTableAlignment(page);
      await assertFuelEighthsFormat(page);
      await assertRoadLiabilityAlignmentIfPresent(page);
      await page.screenshot({
        path: path.join("test-results", `reconciliation-en-${viewport.name}.png`),
        fullPage: false,
      });
    });
  });
}
