import { execSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { test, expect, type Page } from "@playwright/test";
import { STAFF_EMAIL, STAFF_PASSWORD } from "./helpers/e2e-api";

/**
 * Invoices UI with invoice rows loaded from haidara_test via Playwright route intercept.
 * Financial data is real (seeded on haidara_test); staff login uses the standard dev staff user
 * because NextAuth on :3100 targets the dev API URL. API list payload is captured from test backend.
 */
test.use({ channel: "chrome" });
test.describe.configure({ mode: "serial", timeout: 180_000 });

const fixturePath = path.join(process.cwd(), "e2e/.fixtures/smc-invoice-haidara-test.json");
const testApi = (process.env.PLAYWRIGHT_API_URL ?? "http://localhost:3010").replace(/\/$/, "");
const enabled = process.env.PLAYWRIGHT_HAIDARA_TEST_E2E === "1";

type Fixture = {
  adminEmail: string;
  adminPassword: string;
  invoiceId: string;
  invoiceNumber: number | string;
  contractId: string;
  contractNumber: string;
  totalAmount: number;
  companyCode: string;
  cleanup: {
    contractIds: string[];
    customerId: number;
    vehicleIds: number[];
    adminEmail: string;
  };
};

async function staffLogin(page: Page, locale: "ar" | "en") {
  await page.goto(`/${locale}/login`, { waitUntil: "domcontentloaded" });
  await page.locator("#email").fill(STAFF_EMAIL);
  await page.locator("#password").fill(STAFF_PASSWORD);
  await page.getByRole("button", { name: /دخول|login|sign in/i }).click();
  await page.waitForURL((url) => !url.pathname.includes("/login"), { timeout: 90_000 });
}

async function loginTestBackend(fixture: Fixture): Promise<string> {
  const res = await fetch(`${testApi}/auth/login`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email: fixture.adminEmail, password: fixture.adminPassword }),
  });
  if (!res.ok) throw new Error(`Test backend login failed: ${res.status}`);
  const body = (await res.json()) as { data: { accessToken: string } };
  return body.data.accessToken;
}

function installInvoiceApiFromTestDb(page: Page, listJson: unknown, detailJson: unknown) {
  return page.route(/\/invoices(\?|\/)/, async (route) => {
    const url = route.request().url();
    if (route.request().method() !== "GET") {
      await route.continue();
      return;
    }
    if (url.includes("/pdf") || url.includes("/deliveries")) {
      await route.continue();
      return;
    }
    if (/\/invoices\/[^/?]+/.test(url) && !url.includes("?")) {
      await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(detailJson) });
      return;
    }
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(listJson) });
  });
}

test.describe("Staff manual invoice (haidara_test data → Invoices UI)", () => {
  test.skip(!enabled, "Set PLAYWRIGHT_HAIDARA_TEST_E2E=1 and test backend on PLAYWRIGHT_API_URL");

  let fixture: Fixture;
  let listPayload: unknown;
  let detailPayload: unknown;

  test.beforeAll(async () => {
    const backendDir = path.resolve(process.cwd(), "../backend");
    execSync("npx tsx scripts/seed-playwright-smc-invoice.ts", {
      cwd: backendDir,
      env: {
        ...process.env,
        TEST_DATABASE_URL:
          process.env.TEST_DATABASE_URL ??
          "postgresql://postgres:admin@localhost:5432/haidara_test?schema=public",
        DATABASE_URL:
          process.env.TEST_DATABASE_URL ??
          "postgresql://postgres:admin@localhost:5432/haidara_test?schema=public",
      },
      stdio: "inherit",
    });
    fixture = JSON.parse(await readFile(fixturePath, "utf8")) as Fixture;
    const health = await fetch(`${testApi}/health`).catch(() => null);
    if (!health?.ok) {
      throw new Error(`Test backend not reachable at ${testApi}`);
    }
    const token = await loginTestBackend(fixture);
    const listRes = await fetch(`${testApi}/invoices?contractId=${fixture.contractId}`, {
      headers: { authorization: `Bearer ${token}` },
    });
    if (!listRes.ok) throw new Error(`List invoices failed: ${listRes.status}`);
    listPayload = await listRes.json();
    const detailRes = await fetch(`${testApi}/invoices/${fixture.invoiceId}`, {
      headers: { authorization: `Bearer ${token}` },
    });
    if (!detailRes.ok) throw new Error(`Invoice detail failed: ${detailRes.status}`);
    detailPayload = await detailRes.json();
  });

  test.afterAll(() => {
    if (!fixture?.cleanup) return;
    const backendDir = path.resolve(process.cwd(), "../backend");
    execSync("npx tsx scripts/cleanup-playwright-smc-invoice.ts", {
      cwd: backendDir,
      env: {
        ...process.env,
        TEST_DATABASE_URL:
          process.env.TEST_DATABASE_URL ??
          "postgresql://postgres:admin@localhost:5432/haidara_test?schema=public",
        DATABASE_URL:
          process.env.TEST_DATABASE_URL ??
          "postgresql://postgres:admin@localhost:5432/haidara_test?schema=public",
      },
    });
  });

  test("English — invoice row and detail (real test-DB payload)", async ({ page }) => {
    await installInvoiceApiFromTestDb(page, listPayload, detailPayload);
    await staffLogin(page, "en");
    await page.goto("/en/invoices", { waitUntil: "domcontentloaded" });
    await expect(page.getByTestId("invoices-screen")).toBeVisible({ timeout: 60_000 });

    const row = page.locator(`[data-invoice-id="${fixture.invoiceId}"]`);
    await expect(row).toBeVisible({ timeout: 30_000 });
    await expect(row).toContainText(String(fixture.invoiceNumber));
    await expect(row).toContainText(fixture.companyCode);
    await expect(row).toContainText(fixture.contractNumber);
    await expect(row).toContainText(String(fixture.totalAmount));

    await row.click();
    await expect(page.getByTestId("invoice-detail-drawer")).toBeVisible({ timeout: 30_000 });
    await expect(page.getByTestId("invoice-detail-drawer")).toContainText(String(fixture.invoiceNumber));

    await page.screenshot({
      path: "e2e/__screens__/invoices/en-staff-manual-invoice-list.png",
      fullPage: true,
    });
    await page.screenshot({
      path: "e2e/__screens__/invoices/en-staff-manual-invoice-detail.png",
    });
  });

  test("Arabic RTL — invoice row visible", async ({ page }) => {
    await installInvoiceApiFromTestDb(page, listPayload, detailPayload);
    await staffLogin(page, "ar");
    await page.goto("/ar/invoices", { waitUntil: "domcontentloaded" });
    await expect(page.getByTestId("invoices-screen")).toBeVisible({ timeout: 60_000 });
    const row = page.locator(`[data-invoice-id="${fixture.invoiceId}"]`);
    await expect(row).toBeVisible({ timeout: 30_000 });
    await expect(row).toContainText(String(fixture.totalAmount));
    await page.screenshot({
      path: "e2e/__screens__/invoices/ar-staff-manual-invoice-list.png",
      fullPage: true,
    });
  });
});
