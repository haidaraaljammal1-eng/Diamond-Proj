import { test, expect, type Page } from "@playwright/test";

test.use({ channel: "chrome" });
test.describe.configure({ timeout: 120_000 });

const email = process.env.PLAYWRIGHT_LOGIN_EMAIL ?? "admin@diamond.test";
const password = process.env.PLAYWRIGHT_LOGIN_PASSWORD ?? "Diamond123!";

async function staffLogin(page: Page) {
  await page.goto("/ar/login");
  await page.locator("#email").waitFor({ state: "visible", timeout: 30_000 });
  await page.locator("#email").fill(email);
  await page.locator("#password").fill(password);
  await page.getByRole("button", { name: /دخول|login|sign in/i }).click();
  await page.waitForURL((url) => !url.pathname.includes("/login"), { timeout: 30_000 });
}

async function openFinance(page: Page) {
  await page.goto("/ar/finance");
  await expect(page.getByTestId("finance-screen")).toBeVisible({ timeout: 60_000 });
}

function periodChip(page: Page, label: RegExp) {
  return page.getByTestId("finance-statement-export-dialog").getByRole("button", { name: label });
}

async function assertChipActive(page: Page, label: RegExp) {
  const chip = periodChip(page, label);
  await expect(chip).toHaveAttribute("aria-pressed", "true");
}

async function exerciseDialog(page: Page, companyTestId: "finance-statement-elite" | "finance-statement-unique") {
  const businessTodayRequests: string[] = [];
  page.on("request", (req) => {
    if (req.url().includes("/finance/statements/business-today")) {
      businessTodayRequests.push(req.url());
    }
  });

  await page.getByTestId(companyTestId).click();
  const dialog = page.getByTestId("finance-statement-export-dialog");
  await expect(dialog).toBeVisible();

  await assertChipActive(page, /^اليوم$/);
  const todayLabel = page.getByTestId("finance-statement-today-label");
  await expect(todayLabel).toBeVisible();
  await expect(todayLabel).toContainText(/كشف حركات اليوم — \d{2}\/\d{2}\/\d{4}/, { timeout: 15_000 });

  const stableText = (await todayLabel.textContent()) ?? "";
  await page.waitForTimeout(3_000);
  await expect(todayLabel).toHaveText(stableText);
  await page.waitForTimeout(2_000);
  await expect(todayLabel).toHaveText(stableText);

  const afterWaitRequests = businessTodayRequests.length;
  await page.waitForTimeout(2_000);
  expect(businessTodayRequests.length).toBe(afterWaitRequests);
  await expect(todayLabel).toHaveText(stableText);

  await periodChip(page, /^يومي$/).click();
  await assertChipActive(page, /^يومي$/);
  await expect(dialog.locator('input[type="date"]')).toBeVisible();

  await periodChip(page, /^أسبوعي$/).click();
  await assertChipActive(page, /^أسبوعي$/);
  await expect(dialog.locator('input[type="date"]')).toBeVisible();

  await periodChip(page, /^شهري$/).click();
  await assertChipActive(page, /^شهري$/);
  await expect(dialog.locator('input[type="number"]').first()).toBeVisible();

  await periodChip(page, /^مخصص$/).click();
  await assertChipActive(page, /^مخصص$/);

  await periodChip(page, /^اليوم$/).click();
  await assertChipActive(page, /^اليوم$/);
  await expect(dialog.locator('input[type="date"]')).toHaveCount(0);

  await dialog.getByRole("button", { name: /^إلغاء$/ }).click();
  await expect(dialog).toBeHidden();

  await page.getByTestId(companyTestId).click();
  await expect(dialog).toBeVisible();
  await assertChipActive(page, /^اليوم$/);

  expect(businessTodayRequests.length).toBeLessThanOrEqual(2);
}

test.describe("Finance statement export dialog", () => {
  test.beforeEach(async ({ page }) => {
    await staffLogin(page);
    await openFinance(page);
  });

  test("ELITE: stable TODAY and period chips", async ({ page }) => {
    await exerciseDialog(page, "finance-statement-elite");
  });

  test("UNIQUE: stable TODAY and period chips", async ({ page }) => {
    await exerciseDialog(page, "finance-statement-unique");
  });
});
