import { test, expect, type Page } from "@playwright/test";

/**
 * Verifies Final Reconciliation dialog loads content (not an infinite skeleton).
 *
 * Run: npx playwright test e2e/final-reconciliation.verify.spec.ts
 */
test.use({ channel: "chrome" });
test.describe.configure({ timeout: 240_000 });

const email = process.env.PLAYWRIGHT_LOGIN_EMAIL ?? "admin@diamond.test";
const password = process.env.PLAYWRIGHT_LOGIN_PASSWORD ?? "Diamond123!";

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
}

test.describe("Final Reconciliation dialog", () => {
  test("Arabic dialog leaves skeleton and shows reconciliation content", async ({ page }) => {
    await login(page, "ar");
    await openFinalReconciliation(page, "ar");

    await expect(page.getByTestId("reconciliation-loading")).toBeHidden({ timeout: 30_000 });
    await expect(page.getByTestId("final-reconciliation-dialog")).toBeVisible({ timeout: 30_000 });
    await expect(page.getByTestId("reconciliation-header")).toBeVisible();
    await expect(page.getByTestId("reconciliation-custody")).toBeVisible();
    await expect(page.getByTestId("reconciliation-summary")).toBeVisible();

    const custodyTable = page.getByTestId("reconciliation-metric-table");
    await expect(custodyTable).toBeVisible();
    await expect(custodyTable.locator("thead th")).toHaveCount(4);
    await expect(custodyTable.locator("tbody tr")).toHaveCount(2);
  });

  test("English dialog leaves skeleton and shows reconciliation content", async ({ page }) => {
    await login(page, "en");
    await openFinalReconciliation(page, "en");

    await expect(page.getByTestId("reconciliation-loading")).toBeHidden({ timeout: 30_000 });
    await expect(page.getByTestId("final-reconciliation-dialog")).toBeVisible({ timeout: 30_000 });
    await expect(page.getByTestId("reconciliation-header")).toBeVisible();
    await expect(page.getByTestId("reconciliation-custody")).toBeVisible();
    await expect(page.getByTestId("reconciliation-summary")).toBeVisible();

    const custodyTable = page.getByTestId("reconciliation-metric-table");
    await expect(custodyTable).toBeVisible();
    await expect(custodyTable.locator("thead th")).toHaveCount(4);
    await expect(custodyTable.locator("tbody tr")).toHaveCount(2);
  });
});
