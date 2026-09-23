import { test, expect, type Page } from "@playwright/test";

/**
 * Cash rental E2E — requires live backend (:3000) + frontend (:3100) with
 * DIAMOND_SIMULATION_ENABLED and fake OCR provider in development.
 *
 * Run: npx playwright test e2e/cash-rental.flow.spec.ts
 */
test.use({ channel: "chrome" });
test.describe.configure({ timeout: 420_000 });

const email = process.env.PLAYWRIGHT_LOGIN_EMAIL ?? "admin@diamond.test";
const password = process.env.PLAYWRIGHT_LOGIN_PASSWORD ?? "Diamond123!";
const SHOTS = "e2e/__screens__/cash-rental";

async function staffLogin(page: Page, locale: "ar" | "en") {
  await page.goto(`/${locale}/login`);
  await page.locator("#email").fill(email);
  await page.locator("#password").fill(password);
  await page.getByRole("button", { name: /دخول|login|sign in/i }).click();
  await page.waitForURL((url) => !url.pathname.includes("/login"), { timeout: 30_000 });
}

async function generateCashLink(page: Page, locale: "ar" | "en") {
  await page.goto(`/${locale}/vehicles`);
  await expect(page.getByTestId("vehicles-grid")).toBeVisible({ timeout: 60_000 });
  const generate = page
    .getByRole("button", { name: locale === "ar" ? /توليد رابط|إنشاء رابط/i : /generate link/i })
    .first();
  test.skip((await generate.count()) === 0, "No available vehicle for link generation");
  await generate.click();
  await expect(page.getByTestId("rental-collection-mode-options")).toBeVisible();
  await page.getByTestId("rental-collection-mode-cash").click();
  await page.getByRole("button", { name: locale === "ar" ? /متابعة|continue/i }).click();
  await expect(page.getByTestId("rental-cash-context")).toBeVisible();
  await page.getByRole("button", { name: locale === "ar" ? /إرسال الرابط|send link/i }).click();
  const linkField = page.locator('input[readonly], textarea[readonly]').filter({ hasText: /http/ }).first();
  await expect(linkField).toBeVisible({ timeout: 30_000 });
  const href = await linkField.inputValue();
  return href;
}

for (const locale of ["en", "ar"] as const) {
  test(`${locale} cash rental completes without payment step`, async ({ page, context }) => {
    const stripeCalls: string[] = [];
    page.on("request", (req) => {
      if (req.url().includes("stripe.com") || req.url().includes("/payment")) {
        stripeCalls.push(req.url());
      }
    });

    await staffLogin(page, locale);
    const link = await generateCashLink(page, locale);
    const rentalPage = await context.newPage();
    await rentalPage.goto(link);
    await expect(rentalPage.getByTestId("contract-review")).toBeVisible({ timeout: 120_000 });
    const fillTest = rentalPage.getByTestId("contract-review-fill-test-data");
    if (await fillTest.isVisible()) await fillTest.click();
    await rentalPage.getByTestId("contract-review-continue").click();
    await rentalPage.getByTestId("contract-review-sign").click();
    await expect(rentalPage.getByTestId("handover-step")).toBeVisible({ timeout: 60_000 });
    await expect(rentalPage.getByTestId("payment-step")).toHaveCount(0);
    await expect(rentalPage.getByText(/payment successful/i)).toHaveCount(0);
    expect(stripeCalls).toEqual([]);
    await rentalPage.screenshot({
      path: `${SHOTS}/${locale}-${locale === "ar" ? "rtl" : "ltr"}-completion.png`,
      fullPage: true,
    });
  });
}
