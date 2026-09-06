import { test, expect } from "@playwright/test";

const email = process.env.PLAYWRIGHT_LOGIN_EMAIL;
const password = process.env.PLAYWRIGHT_LOGIN_PASSWORD;

test.describe("Vehicles page", () => {
  test.skip(!email || !password, "Set PLAYWRIGHT_LOGIN_EMAIL and PLAYWRIGHT_LOGIN_PASSWORD");

  test("Arabic desktop vehicles page matches baseline", async ({ page }) => {
    await page.goto("/ar/login");
    await page.getByLabel(/اسم المستخدم|email/i).fill(email!);
    await page.getByLabel(/كلمة المرور|password/i).fill(password!);
    await page.getByRole("button", { name: /دخول|login/i }).click();
    await page.waitForURL("**/ar/**");

    await page.goto("/ar/vehicles");
    await expect(page.getByRole("heading", { name: "السيارات" })).toBeVisible();
    await expect(page.getByTestId("vehicle-filters")).toBeVisible();
    await expect(page.getByTestId("vehicles-grid")).toBeVisible({ timeout: 15_000 });

    await expect(page).toHaveScreenshot("vehicles-ar-desktop.png", {
      fullPage: true,
      maxDiffPixelRatio: 0.02,
    });
  });
});
