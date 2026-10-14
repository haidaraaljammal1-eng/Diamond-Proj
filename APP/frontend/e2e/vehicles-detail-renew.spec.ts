import { expect, test, type Page } from "@playwright/test";

test.use({ channel: "chrome" });
test.describe.configure({ timeout: 180_000, retries: 1 });

const email = process.env.PLAYWRIGHT_LOGIN_EMAIL ?? "admin@diamond.test";
const password = process.env.PLAYWRIGHT_LOGIN_PASSWORD ?? "Diamond123!";

async function login(page: Page, locale: "ar" | "en") {
  await page.goto(`/${locale}/login`);
  await page.locator("#email").waitFor({ state: "visible", timeout: 30_000 });
  await page.locator("#email").fill(email);
  await page.locator("#password").fill(password);
  const loginLabel = locale === "ar" ? /دخول/i : /login|sign in/i;
  await page.getByRole("button", { name: loginLabel }).click();
  await page.waitForURL((url) => !url.pathname.includes("/login"), { timeout: 90_000 });
}

async function openActiveRentedVehicleDetail(page: Page, locale: "ar" | "en") {
  await page.goto(`/${locale}/vehicles`);
  await expect(page.getByTestId("vehicles-grid")).toBeVisible({ timeout: 30_000 });
  const rentedFilter = locale === "ar" ? "مؤجرة" : "Rented";
  await page.getByTestId("vehicle-filters").getByRole("button", { name: rentedFilter }).click();
  const patrolCard = page
    .getByTestId("vehicle-card")
    .filter({ hasText: /Nissan Patrol/i })
    .filter({ hasText: /MV6AVH9402/i })
    .first();
  await expect(patrolCard).toBeVisible({ timeout: 30_000 });
  await patrolCard.click();
  await expect(page.getByTestId("vehicle-detail")).toBeVisible({ timeout: 20_000 });
}

for (const locale of ["ar", "en"] as const) {
  test(`vehicle detail renew rental — ${locale}`, async ({ page }) => {
    await login(page, locale);
    await openActiveRentedVehicleDetail(page, locale);

    const renewBtn = page.getByTestId("vehicle-detail-renew-rental");
    await expect(renewBtn).toBeVisible({ timeout: 25_000 });
    await expect(renewBtn).toBeEnabled({ timeout: 25_000 });

    const renewLabel = locale === "ar" ? /تجديد الإيجار/ : /Renew Rental/i;
    await expect(renewBtn).toContainText(renewLabel);

    await renewBtn.click();
    const renewDialog = page.getByRole("dialog").filter({
      hasText: locale === "ar" ? /تجديد العقد/i : /Renew contract/i,
    });
    await expect(renewDialog).toBeVisible({ timeout: 15_000 });

    const hoursMode = locale === "ar" ? /ساعات/ : /Hours/i;
    const daysMode = locale === "ar" ? /أيام/ : /Days/i;
    await expect(renewDialog.getByRole("button", { name: hoursMode })).toBeVisible();
    await expect(renewDialog.getByRole("button", { name: daysMode })).toBeVisible();
  });
}
