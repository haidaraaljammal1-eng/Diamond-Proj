import { test, expect, type Page } from "@playwright/test";

test.use({ channel: "chrome" });

const email = process.env.PLAYWRIGHT_LOGIN_EMAIL ?? "admin@diamond.test";
const password = process.env.PLAYWRIGHT_LOGIN_PASSWORD ?? "Diamond123!";

async function login(page: Page, locale: "ar" | "en") {
  await page.goto(`/${locale}/login`);
  await page.locator("#email").fill(email);
  await page.locator("#password").fill(password);
  await page.getByRole("button", { name: /دخول|login|sign in/i }).click();
  await page.waitForURL((url) => !url.pathname.includes("/login"), {
    timeout: 30_000,
  });
}

test.describe("Contracts Frontend V1 visual", () => {
  test("Arabic contracts desk opens with RTL, filters, empty or table", async ({
    page,
  }) => {
    await login(page, "ar");
    await page.goto("/ar/contracts");

    const html = page.locator("html");
    await expect(html).toHaveAttribute("dir", "rtl");
    await expect(page.getByRole("heading", { name: "العقود" })).toBeVisible({
      timeout: 20_000,
    });
    await expect(page.getByTestId("contract-filters")).toBeVisible();
    await expect(page.getByTestId("data-search")).toBeVisible();

    const table = page.getByTestId("contracts-table");
    const empty = page.getByTestId("contracts-empty");
    await expect(table.or(empty)).toBeVisible({ timeout: 20_000 });

    await page.getByRole("button", { name: "موقّع" }).click();
    await expect(page.getByRole("button", { name: "موقّع" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );

    if (await table.isVisible()) {
      await page.locator("[data-testid=contracts-table] tbody tr").first().click();
      await expect(page.getByTestId("shared-drawer")).toBeVisible();
      await expect(page.getByTestId("contract-timeline")).toBeVisible();
    }
  });

  test("English contracts desk opens LTR with Shared filters", async ({ page }) => {
    await login(page, "en");
    await page.goto("/en/contracts");

    const html = page.locator("html");
    await expect(html).toHaveAttribute("dir", "ltr");
    await expect(page.getByRole("heading", { name: "Contracts" })).toBeVisible({
      timeout: 20_000,
    });
    await expect(page.getByTestId("contract-filters")).toBeVisible();
    await expect(page.getByRole("button", { name: "Refresh" })).toBeVisible();
  });

  test("Fleet page opens; Set Rental Price dialog when a vehicle exists", async ({
    page,
  }) => {
    await login(page, "en");
    await page.goto("/en/vehicles");
    await expect(page.getByTestId("vehicle-filters")).toBeVisible({ timeout: 20_000 });

    const grid = page.getByTestId("vehicles-grid");
    const empty = page.getByText(/no vehicles in the fleet/i);
    await expect(grid.or(empty)).toBeVisible({ timeout: 20_000 });

    if (await grid.isVisible()) {
      const price = page.getByRole("button", { name: /set price|rental price|price/i }).first();
      const carOut = page.getByRole("button", { name: /car-out/i }).first();
      const returnLink = page.getByRole("button", { name: /return/i }).first();
      await expect(price.or(carOut).or(returnLink)).toBeVisible();

      if (await price.isVisible()) {
        await price.click();
        await expect(page.getByRole("dialog")).toBeVisible();
      }
    }
  });
});
