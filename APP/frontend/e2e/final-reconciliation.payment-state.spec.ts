import { test, expect, type Page } from "@playwright/test";

/**
 * Verifies Final Reconciliation electronic payment state machine in staff UI.
 *
 * Run: npx playwright test e2e/final-reconciliation.payment-state.spec.ts
 */
test.use({ channel: "chrome" });
test.describe.configure({ timeout: 300_000, mode: "serial" });

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

async function openReviewReconciliation(page: Page, locale: "ar" | "en") {
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
  await reconcileAction.click();
  await expect(page.getByTestId("shared-dialog")).toBeVisible({ timeout: 30_000 });
  await expect(page.getByTestId("reconciliation-loading")).toBeHidden({ timeout: 30_000 });
  await expect(page.getByTestId("final-reconciliation-dialog")).toBeVisible({ timeout: 30_000 });
}

async function closeReconciliationDialog(page: Page) {
  await page.getByTestId("shared-dialog").getByRole("button", { name: /close|إغلاق/i }).first().click();
  await expect(page.getByTestId("shared-dialog")).toBeHidden({ timeout: 15_000 });
}

async function ensureElectronicLinkIssued(page: Page) {
  if ((await page.getByTestId("reconciliation-awaiting-payment").count()) > 0) {
    return;
  }

  const collect = page.getByTestId("reconciliation-collect");
  test.skip((await collect.count()) === 0, "No positive-balance reconciliation available");
  await collect.click();

  const methodDialog = page.getByRole("dialog", { name: /choose collection method/i });
  await expect(methodDialog).toBeVisible({ timeout: 10_000 });
  await methodDialog.getByRole("button", { name: /electronic payment/i }).click();

  const linkDialog = page.getByTestId("reconciliation-link-dialog");
  await expect(linkDialog).toBeVisible({ timeout: 30_000 });
  await page.getByRole("button", { name: /^close$/i }).last().click();
  await expect(page.getByTestId("reconciliation-awaiting-payment")).toBeVisible({ timeout: 30_000 });
}

test.describe("Final Reconciliation payment state machine", () => {
  test("scenario A — draft positive balance shows Collect", async ({ page }) => {
    await login(page, "en");
    await openReviewReconciliation(page, "en");

    const collect = page.getByTestId("reconciliation-collect");
    if ((await collect.count()) === 0) {
      test.skip(true, "No positive-balance draft reconciliation available");
    }
    await expect(collect).toBeVisible();
    await expect(page.getByTestId("reconciliation-completed")).toHaveCount(0);
    await page.screenshot({ path: "test-results/final-reconciliation-scenario-a.png", fullPage: true });
  });

  test("scenario B — generate electronic link keeps Collect and shows awaiting payment", async ({ page }) => {
    await login(page, "en");
    await openReviewReconciliation(page, "en");
    await ensureElectronicLinkIssued(page);

    await expect(page.getByTestId("reconciliation-awaiting-payment")).toBeVisible();
    await expect(page.getByTestId("reconciliation-collect")).toBeVisible();
    await expect(page.getByTestId("reconciliation-completed")).toHaveCount(0);
    const hasLink = (await page.getByTestId("reconciliation-link-result").count()) > 0;
    const hasReissue = (await page.getByTestId("reconciliation-reissue-link").count()) > 0;
    expect(hasLink || hasReissue).toBe(true);
    await page.screenshot({ path: "test-results/final-reconciliation-scenario-b.png", fullPage: true });
  });

  test("scenario C — close and reopen dialog keeps collection capability", async ({ page }) => {
    await login(page, "en");
    await openReviewReconciliation(page, "en");
    await ensureElectronicLinkIssued(page);

    await closeReconciliationDialog(page);
    await openReviewReconciliation(page, "en");

    await expect(page.getByTestId("reconciliation-awaiting-payment")).toBeVisible();
    await expect(page.getByTestId("reconciliation-collect")).toBeVisible();
    await expect(page.getByTestId("reconciliation-completed")).toHaveCount(0);

    const hasLink = (await page.getByTestId("reconciliation-link-result").count()) > 0;
    const hasReissue = (await page.getByTestId("reconciliation-reissue-link").count()) > 0;
    expect(hasLink || hasReissue).toBe(true);
    await page.screenshot({ path: "test-results/final-reconciliation-scenario-c.png", fullPage: true });
  });

  test("scenario D — public link open does not complete reconciliation", async ({ page, context }) => {
    await login(page, "en");
    await openReviewReconciliation(page, "en");
    await ensureElectronicLinkIssued(page);

    if ((await page.getByTestId("reconciliation-link-result").count()) === 0) {
      const reissue = page.getByTestId("reconciliation-reissue-link");
      test.skip((await reissue.count()) === 0, "No payment link or reissue action available");
      await reissue.click();
      const linkDialog = page.getByTestId("reconciliation-link-dialog");
      const linkResult = page.getByTestId("reconciliation-link-result");
      await expect(linkDialog.or(linkResult)).toBeVisible({ timeout: 30_000 });
      if (await linkDialog.isVisible()) {
        await page.getByRole("button", { name: /^close$/i }).last().click();
      }
      await expect(linkResult).toBeVisible({ timeout: 30_000 });
    }

    const linkText = await page.getByTestId("reconciliation-link-url").textContent();
    test.skip(!linkText, "No payment link URL rendered");

    const publicPage = await context.newPage();
    await publicPage.goto(linkText!.trim(), { waitUntil: "domcontentloaded" });
    await publicPage.close();

    await expect(page.getByTestId("reconciliation-collect")).toBeVisible();
    await expect(page.getByTestId("reconciliation-completed")).toHaveCount(0);
    await page.screenshot({ path: "test-results/final-reconciliation-scenario-d.png", fullPage: true });
  });
});
