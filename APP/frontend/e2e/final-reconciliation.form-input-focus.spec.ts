import { test, expect, type Page } from "@playwright/test";

/**
 * Regression: nested reconciliation line dialogs must not steal input focus on each keystroke.
 * Root cause was Dialog auto-focus re-running when `onClose` identity changed every render.
 */
test.describe.configure({ timeout: 120_000, mode: "serial" });

const REVIEW_CONTRACT = process.env.PLAYWRIGHT_REVIEW_CONTRACT ?? "DE-2026-000003";


const email = process.env.PLAYWRIGHT_LOGIN_EMAIL ?? "admin@diamond.test";
const password = process.env.PLAYWRIGHT_LOGIN_PASSWORD ?? "Diamond123!";

async function login(page: Page) {
  await page.goto("/ar/login", { waitUntil: "domcontentloaded" });
  if (!page.url().includes("/login")) return;
  await page.locator("#email").fill(email);
  await page.locator("#password").fill(password);
  await page.getByRole("button", { name: /دخول|login|sign in/i }).click();
  await page.waitForURL((url) => !url.pathname.includes("/login"), { timeout: 25_000 });
}

test.use({ channel: "chrome" });

async function openReconciliationForFirstReview(page: Page) {
  await page.goto("/ar/contracts", { waitUntil: "domcontentloaded", timeout: 120_000 });
  await expect(page.getByTestId("contracts-table")).toBeVisible({ timeout: 90_000 });

  const reviewFilter = page.getByRole("button", { name: "مراجعة التسوية" });
  if (await reviewFilter.count()) {
    await reviewFilter.click();
  }

  await page.getByTestId("contract-search").fill(REVIEW_CONTRACT);
  await page.getByTestId("data-search-submit").click();
  await page.getByRole("button", { name: "المطابقة", exact: true }).first().click();
  await expect(page.getByTestId("final-reconciliation-dialog")).toBeVisible({ timeout: 30_000 });
  await expect(page.getByTestId("reconciliation-loading")).toBeHidden({ timeout: 30_000 });
}

async function expectSequentialTyping(
  page: Page,
  formTestId: string,
  inputIndex: number,
  text: string,
) {
  const form = page.getByTestId(formTestId);
  await expect(form).toBeVisible();
  const input = form.locator("input").nth(inputIndex);
  await input.click();
  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i]!;
    await expect
      .poll(async () => input.evaluate((el) => document.activeElement === el))
      .toBe(true);
    await page.keyboard.type(ch);
  }
  await expect(input).toHaveValue(text);
}

test.describe("Final Reconciliation form input focus", () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
    await openReconciliationForFirstReview(page);
  });

  test("damage description accepts full text after one focus", async ({ page }) => {
    await page.getByTestId("reconciliation-add-damage").click();
    await expectSequentialTyping(page, "damage-form", 0, "Front bumper scratch");
  });

  test("damage amount accepts full number after one focus", async ({ page }) => {
    await page.getByTestId("reconciliation-add-damage").click();
    await expectSequentialTyping(page, "damage-form", 1, "275");
  });

  test("fuel amount accepts full number after one focus", async ({ page }) => {
    await page.getByTestId("reconciliation-add-fuel").click();
    await expectSequentialTyping(page, "fuel-form", 0, "125");
  });
});
