import { test, expect } from "@playwright/test";

const email = process.env.PLAYWRIGHT_LOGIN_EMAIL;
const password = process.env.PLAYWRIGHT_LOGIN_PASSWORD;

test.describe("Users / Staff page", () => {
  test.skip(!email || !password, "Set PLAYWRIGHT_LOGIN_EMAIL and PLAYWRIGHT_LOGIN_PASSWORD");

  test("Arabic desktop team page matches baseline", async ({ page }) => {
    await page.goto("/ar/login");
    await page.getByLabel(/اسم المستخدم|email/i).fill(email!);
    await page.getByLabel(/كلمة المرور|password/i).fill(password!);
    await page.getByRole("button", { name: /دخول|login/i }).click();
    await page.waitForURL("**/ar/**");

    await page.goto("/ar/team");
    await expect(page.getByRole("heading", { name: "الموظفون" })).toBeVisible();
    await expect(page.getByTestId("users-grid")).toBeVisible({ timeout: 15_000 });

    await expect(page).toHaveScreenshot("users-team-ar-desktop.png", {
      fullPage: true,
      maxDiffPixelRatio: 0.02,
    });
  });
});
