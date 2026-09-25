import { test, expect, type Page } from "@playwright/test";

/**
 * Verifies settled / CLOSED contracts never show the Reconcile row action.
 *
 * Run: npx playwright test e2e/final-reconciliation.closed.spec.ts
 */
test.use({ channel: "chrome" });
test.describe.configure({ timeout: 240_000 });

const email = process.env.PLAYWRIGHT_LOGIN_EMAIL ?? "admin@diamond.test";
const password = process.env.PLAYWRIGHT_LOGIN_PASSWORD ?? "Diamond123!";

async function login(page: Page, locale: "ar" | "en") {
  await page.goto(`/${locale}/login`);
  await page.locator("#email").fill(email);
  await page.locator("#password").fill(password);
  await page.getByRole("button", { name: /دخول|login|sign in/i }).click();
  await page.waitForURL((url) => !url.pathname.includes("/login"), { timeout: 25_000 });
}

async function assertNoReconcileOnClosedRows(page: Page, locale: "ar" | "en") {
  await page.goto(`/${locale}/contracts`, { waitUntil: "domcontentloaded" });
  await expect(page.getByTestId("contracts-table")).toBeVisible({ timeout: 60_000 });

  const closedFilter = page.getByRole("button", {
    name: locale === "ar" ? "مغلق" : "Closed",
  });
  if (await closedFilter.count()) {
    await closedFilter.click();
  }

  const closedRows = page.locator('[data-testid="contracts-table"] tbody tr');
  const rowCount = await closedRows.count();
  test.skip(rowCount === 0, "No CLOSED contracts available for verification");

  const reconcileLabel = locale === "ar" ? "المطابقة" : "Reconciliation";
  const table = page.getByTestId("contracts-table");
  await expect(table.getByRole("button", { name: reconcileLabel, exact: true })).toHaveCount(0);

  const firstRow = closedRows.first();
  await expect(firstRow).toContainText(locale === "ar" ? "مغلق" : "Closed");

  await firstRow.click();
  const detail = page.getByTestId("contract-detail");
  await expect(detail).toBeVisible({ timeout: 30_000 });
  await expect(detail.getByRole("button", { name: reconcileLabel, exact: true })).toHaveCount(0);

  const finalRecon = page.getByTestId("contract-final-reconciliation");
  if (await finalRecon.count()) {
    await expect(finalRecon).toBeVisible();
    await expect(page.getByRole("button", { name: /collect|تحصيل|finalize|إنهاء/i })).toHaveCount(0);
  }

  await page.screenshot({
    path: `test-results/final-reconciliation-closed-${locale}.png`,
    fullPage: true,
  });
}

test.describe("Final Reconciliation closed contract UX", () => {
  test("Arabic CLOSED rows hide Reconcile and show read-only detail", async ({ page }) => {
    await login(page, "ar");
    await assertNoReconcileOnClosedRows(page, "ar");
  });

  test("English CLOSED rows hide Reconcile and show read-only detail", async ({ page }) => {
    await login(page, "en");
    await assertNoReconcileOnClosedRows(page, "en");
  });
});
