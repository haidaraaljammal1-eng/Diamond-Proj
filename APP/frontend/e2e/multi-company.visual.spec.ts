import { mkdir } from "node:fs/promises";
import path from "node:path";
import { expect, test, type Page } from "@playwright/test";

const email = process.env.PLAYWRIGHT_LOGIN_EMAIL ?? "admin@diamond.test";
const password = process.env.PLAYWRIGHT_LOGIN_PASSWORD ?? "Diamond123!";
const baseURL = process.env.PLAYWRIGHT_BASE_URL ?? "http://localhost:3100";
// `/auth/login` allows 5 attempts per minute per caller (RATE_LIMIT_AUTH_MAX),
// so the suite signs in once and every test reuses that session.
const storageStatePath = path.join(process.cwd(), "e2e/.auth/multi-company.json");
// Scoped to the Backend origin so Next RSC prefetches of /<locale>/vehicles are not intercepted.
const apiBase = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001";

async function login(page: Page, locale: "ar" | "en") {
  await page.goto(`/${locale}/login`);
  if (!page.url().includes("/login")) return;
  await page.locator("#email").fill(email);
  await page.locator("#password").fill(password);
  await page.getByRole("button", { name: /login|sign in|دخول/i }).click();
  await page.waitForURL((url) => !url.pathname.includes("/login"), { timeout: 30_000 });
}

// Runs outside the describe so it does not inherit the storage state it creates.
test.beforeAll(async ({ browser }) => {
  await mkdir(path.dirname(storageStatePath), { recursive: true });
  const context = await browser.newContext({ baseURL, storageState: undefined });
  const page = await context.newPage();
  await login(page, "en");
  await context.storageState({ path: storageStatePath });
  await context.close();
});

test.describe("Operating Company frontend", () => {
  test.use({ storageState: storageStatePath });

  test("ELITE projections use the Contract/Vehicle DTO and backend accent", async ({ page }) => {
    test.setTimeout(75_000);
    await login(page, "en");
    await page.route(`${apiBase}/vehicles?*`, async (route) => {
      const response = await route.fetch();
      const payload = await response.json() as { data?: Array<Record<string, unknown>> };
      if (payload.data?.[0]) {
        payload.data[0] = {
          ...payload.data[0],
          company: { id: 2, code: "ELITE", displayName: "ELITE", accentColor: "#3E5C76" },
        };
      }
      await route.fulfill({ response, json: payload });
    });
    await page.goto("/en/vehicles");
    const eliteVehicle = page.locator('[data-company-code="ELITE"]').first();
    await expect(eliteVehicle).toBeVisible({ timeout: 20_000 });
    await expect(eliteVehicle).toHaveCSS("--company-accent", "#3E5C76");

    await page.unroute(`${apiBase}/vehicles?*`);
    await page.route(`${apiBase}/contracts?*`, async (route) => {
      const response = await route.fetch();
      const payload = await response.json() as { data?: Array<Record<string, unknown>> };
      if (payload.data?.[0]) {
        payload.data[0] = {
          ...payload.data[0],
          company: { id: 2, code: "ELITE", displayName: "ELITE", accentColor: "#3E5C76" },
        };
      }
      await route.fulfill({ response, json: payload });
    });
    await page.goto("/en/contracts");
    const eliteContract = page.locator('[data-company-code="ELITE"]').first();
    await expect(eliteContract).toBeVisible({ timeout: 20_000 });
    await expect(eliteContract).toHaveCSS("--company-accent", "#3E5C76");
  });

  test("Fleet loads company markers, filter and required Add Vehicle options", async ({ page }, testInfo) => {
    await login(page, "en");
    await page.goto("/en/vehicles");
    await expect(page.getByTestId("vehicle-filters")).toBeVisible({ timeout: 20_000 });
    await expect(page.getByRole("combobox", { name: "Company" })).toBeVisible();
    await page.screenshot({ path: testInfo.outputPath("fleet-en-1440.png"), fullPage: true });

    const cards = page.getByTestId("vehicle-card");
    if ((await cards.count()) > 0) {
      await expect(cards.first().locator("[data-company-code]")).toBeVisible();
    }

    await page.getByRole("button", { name: /add vehicle/i }).click();
    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible();
    const companySelect = dialog.getByRole("combobox", { name: "Company" });
    await expect(companySelect).toBeVisible();
    await companySelect.click();
    await expect(page.getByRole("option", { name: "UNIQUE", exact: true })).toBeVisible();
    await expect(page.getByRole("option", { name: "ELITE", exact: true })).toBeVisible();
  });

  test("Contracts render historical company and keep filters usable", async ({ page }, testInfo) => {
    await login(page, "en");
    await page.goto("/en/contracts");
    await expect(page.getByTestId("contract-filters")).toBeVisible({ timeout: 20_000 });
    await expect(page.getByRole("combobox", { name: "Company" })).toBeVisible();
    await page.screenshot({ path: testInfo.outputPath("contracts-en-1440.png"), fullPage: true });
    const rows = page.locator("[data-testid=contracts-table] tbody tr");
    if ((await rows.count()) > 0) {
      const marker = rows.first().locator("[data-company-code]");
      await expect(marker).toBeVisible();
      // The marker belongs under the contract number. It used to depend on one CSS
      // module overriding another, so a different chunk order put it on the number line.
      const numberBox = await rows.first().locator("td").first().locator("span[dir=ltr]").first().boundingBox();
      const markerBox = await marker.boundingBox();
      expect(numberBox && markerBox).toBeTruthy();
      expect(markerBox!.y).toBeGreaterThan(numberBox!.y + numberBox!.height - 2);
    }
  });

  test("signed A4 keeps the approved header and authoritative UNIQUE name", async ({ page }, testInfo) => {
    test.setTimeout(120_000);
    await login(page, "en");
    await page.goto("/en/contracts");
    const signedRows = page.locator("[data-testid=contracts-table] tbody tr").filter({
      has: page.getByRole("button", { name: /view contract/i }),
    });
    await expect(signedRows.first()).toBeVisible({ timeout: 20_000 });
    const contractIds = (await signedRows.evaluateAll((rows) =>
      rows.map((row) => row.getAttribute("data-record-id")))).filter((id): id is string => Boolean(id));
    expect(contractIds.length).toBeGreaterThan(0);

    // Contracts signed before the official-contract snapshot existed carry no A4
    // at all. They are pre-multi-company data, so render the first row that has one.
    const a4 = page.getByTestId("official-contract-a4");
    let rendered = false;
    for (const contractId of contractIds) {
      await page.goto(`/en/contracts/${contractId}/contract`);
      rendered = await a4.waitFor({ state: "visible", timeout: 20_000 }).then(() => true).catch(() => false);
      if (rendered) break;
    }
    expect(rendered, "no signed contract rendered an official A4").toBe(true);
    await expect(a4.getByText("DIAMOND UNIQUE CAR RENTALS CO. LLC S.O.C", { exact: true })).toBeVisible();
    await a4.screenshot({ path: testInfo.outputPath("official-contract-unique.png") });
  });

  for (const locale of ["ar", "en"] as const) {
    test(`${locale} remains direction-correct and viewport-safe at mobile width`, async ({ page }, testInfo) => {
      await page.setViewportSize({ width: 390, height: 844 });
      await login(page, locale);
      await page.goto(`/${locale}/vehicles`);
      await expect(page.getByTestId("vehicle-filters")).toBeVisible({ timeout: 20_000 });
      await expect(page.locator("html")).toHaveAttribute("dir", locale === "ar" ? "rtl" : "ltr");
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth);
      expect(overflow).toBe(false);
      await page.screenshot({ path: testInfo.outputPath(`fleet-${locale}-390.png`), fullPage: true });
    });
  }
});
