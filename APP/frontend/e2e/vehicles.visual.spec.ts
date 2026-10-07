import { test, expect } from "@playwright/test";

test.use({ channel: "chrome" });
test.describe.configure({ timeout: 120_000 });

const email = process.env.PLAYWRIGHT_LOGIN_EMAIL ?? "admin@diamond.test";
const password = process.env.PLAYWRIGHT_LOGIN_PASSWORD ?? "Diamond123!";

test.describe("Vehicles page", () => {
  test("Arabic desktop vehicles page matches baseline", async ({ page }) => {
    await page.goto("/ar/login");
    await page.locator("#email").waitFor({ state: "visible", timeout: 30_000 });
    await page.locator("#email").fill(email);
    await page.locator("#password").fill(password);
    await page.getByRole("button", { name: /دخول|login|sign in/i }).click();
    await page.waitForURL((url) => !url.pathname.includes("/login"), {
      timeout: 30_000,
    });

    await page.goto("/ar/vehicles");
    await expect(page.getByRole("heading", { name: "السيارات" })).toBeVisible({
      timeout: 20_000,
    });
    await expect(page.getByTestId("vehicle-filters")).toBeVisible();
    await expect(page.getByTestId("vehicles-grid")).toBeVisible({ timeout: 15_000 });

    await expect(page).toHaveScreenshot("vehicles-ar-desktop.png", {
      fullPage: true,
      maxDiffPixelRatio: 0.02,
    });
  });
});
