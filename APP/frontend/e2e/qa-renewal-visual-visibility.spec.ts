import { expect, test } from "@playwright/test";
import path from "node:path";

test.use({ channel: "chrome" });
test.describe.configure({ timeout: 120_000 });

const email = process.env.PLAYWRIGHT_LOGIN_EMAIL ?? "admin@diamond.test";
const password = process.env.PLAYWRIGHT_LOGIN_PASSWORD ?? "Diamond123!";

test("QA vehicle 628 — renew button visible only (no click)", async ({ page }) => {
  await page.goto("/ar/login");
  await page.locator("#email").fill(email);
  await page.locator("#password").fill(password);
  await page.getByRole("button", { name: /دخول/i }).click();
  await page.waitForURL((url) => !url.pathname.includes("/login"), { timeout: 90_000 });

  await page.goto("/ar/vehicles");
  await expect(page.getByTestId("vehicles-grid")).toBeVisible({ timeout: 30_000 });

  const qaCard = page
    .getByTestId("vehicle-card")
    .filter({ hasText: /QA-RENEWAL-VISUAL-20261013/i })
    .first();
  await expect(qaCard).toBeVisible({ timeout: 30_000 });
  await expect(qaCard).toContainText(/مؤجرة|Rented/i);
  await qaCard.click();

  await expect(page.getByTestId("vehicle-detail")).toBeVisible({ timeout: 20_000 });
  const renewBtn = page.getByTestId("vehicle-detail-renew-rental");
  await expect(renewBtn).toBeVisible({ timeout: 25_000 });
  await expect(renewBtn).toBeEnabled({ timeout: 25_000 });
  await expect(renewBtn).toContainText(/تجديد الإيجار/);

  const out = path.join(
    process.cwd(),
    "test-results",
    "qa-renewal-visual-628-renew-button-visible.png",
  );
  await page.screenshot({ path: out, fullPage: true });
});
