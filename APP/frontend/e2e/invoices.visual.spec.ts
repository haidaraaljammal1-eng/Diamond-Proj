import { mkdir } from "node:fs/promises";
import path from "node:path";
import { test, expect, type Page } from "@playwright/test";
import { listInvoices, staffToken } from "./helpers/e2e-api";

test.use({ channel: "chrome" });
test.describe.configure({ mode: "serial", timeout: 240_000 });

const email = process.env.PLAYWRIGHT_LOGIN_EMAIL ?? "admin@diamond.test";
const password = process.env.PLAYWRIGHT_LOGIN_PASSWORD ?? "Diamond123!";
const baseURL = process.env.PLAYWRIGHT_BASE_URL ?? "http://localhost:3100";
const storageStatePath = path.join(process.cwd(), "e2e/.auth/invoices.json");

const REAL_INVOICE_ID = "269c8186-08eb-4a1f-83a0-fd061dfea4c0";
const REAL_INVOICE_NUMBER = "1100";
const REAL_CONTRACT_NUMBER = "DE-2026-000191";

async function login(page: Page, locale: "ar" | "en", landingPath?: string) {
  await page.goto(`/${locale}/login`, { waitUntil: "domcontentloaded", timeout: 60_000 });
  if (!page.url().includes("/login")) {
    if (landingPath) await page.goto(landingPath, { waitUntil: "domcontentloaded", timeout: 60_000 });
    return;
  }
  await page.locator("#email").waitFor({ state: "visible", timeout: 30_000 });
  await page.locator("#email").fill(email);
  await page.locator("#password").fill(password);
  await page.getByRole("button", { name: /دخول|login|sign in/i }).click();
  await page.waitForURL((url) => !url.pathname.includes("/login"), { timeout: 90_000 });
  if (landingPath) {
    await page.goto(landingPath, { waitUntil: "domcontentloaded", timeout: 60_000 });
  }
}

async function waitForInvoicesReady(page: Page) {
  await expect(page.getByTestId("invoices-screen")).toBeVisible({ timeout: 60_000 });
  await expect(page.getByTestId("invoices-company-filter")).toBeVisible();
  await expect(page.getByTestId("invoices-toolbar")).toBeVisible();
}

async function expectInvoice1100Row(page: Page) {
  const row = page.locator(`[data-invoice-id="${REAL_INVOICE_ID}"]`);
  await expect(row).toBeVisible({ timeout: 30_000 });
  await expect(row).toContainText(REAL_INVOICE_NUMBER);
  await expect(row).toContainText("ELITE");
  await expect(row).toContainText(REAL_CONTRACT_NUMBER);
  await expect(row).toContainText("400");
}

function invoicesListResponse(page: Page, predicate: (url: URL) => boolean) {
  return page.waitForResponse(
    (response) => {
      if (response.request().method() !== "GET") return false;
      try {
        const url = new URL(response.url());
        if (!url.pathname.includes("/invoices")) return false;
        if (url.pathname.includes("/pdf") || url.pathname.includes("/deliveries")) return false;
        return predicate(url) && response.ok();
      } catch {
        return false;
      }
    },
    { timeout: 60_000 },
  );
}

test.describe("Invoices archive", () => {
  test.use({ storageState: storageStatePath });

  test.beforeAll(async ({ browser }) => {
    test.setTimeout(120_000);
    const token = await staffToken();
    const invoices = await listInvoices(token);
    if (invoices.length === 0) {
      throw new Error("Real invoice 1100 missing — run on haidara with DE-2026-000191");
    }
    await mkdir(path.dirname(storageStatePath), { recursive: true });
    const context = await browser.newContext({ baseURL, storageState: undefined });
    const page = await context.newPage();
    await login(page, "en", "/en/dashboard");
    await context.storageState({ path: storageStatePath });
    await context.close();
  });

  test("Arabic invoices page — RTL, sidebar, invoice 1100", async ({ page }) => {
    await page.goto("/ar/dashboard", { waitUntil: "domcontentloaded" });
    await expect(page.getByRole("link", { name: "الفواتير" })).toBeVisible({ timeout: 30_000 });
    await page.getByRole("link", { name: "الفواتير" }).click();
    await page.waitForURL(/\/ar\/invoices/, { timeout: 30_000 });
    await expect(page.locator("html")).toHaveAttribute("dir", "rtl");
    await expect(page.getByRole("heading", { name: "الفواتير" })).toBeVisible();
    await waitForInvoicesReady(page);
    await expectInvoice1100Row(page);
    await expect(page.getByRole("button", { name: /إنشاء|إضافة فاتورة|create invoice/i })).toHaveCount(0);
    await expect(page).toHaveScreenshot("invoices-ar-desktop.png", {
      fullPage: true,
      maxDiffPixelRatio: 0.03,
    });
  });

  test("English invoices page — LTR, sidebar, invoice 1100", async ({ page }) => {
    await page.goto("/en/dashboard", { waitUntil: "domcontentloaded" });
    await expect(page.getByRole("link", { name: "Invoices" })).toBeVisible({ timeout: 30_000 });
    await page.getByRole("link", { name: "Invoices" }).click();
    await page.waitForURL(/\/en\/invoices/, { timeout: 30_000 });
    await expect(page.locator("html")).toHaveAttribute("dir", "ltr");
    await expect(page.getByRole("heading", { name: "Invoices" })).toBeVisible();
    await waitForInvoicesReady(page);
    await expectInvoice1100Row(page);
    await expect(page).toHaveScreenshot("invoices-en-desktop.png", {
      fullPage: true,
      maxDiffPixelRatio: 0.03,
    });
  });

  test("company filters issue deterministic backend queries", async ({ page }) => {
    await page.goto("/en/invoices", { waitUntil: "domcontentloaded" });
    await waitForInvoicesReady(page);
    await expectInvoice1100Row(page);

    const eliteReq = invoicesListResponse(page, (url) => url.searchParams.get("companyCode") === "ELITE");
    await Promise.all([page.getByTestId("invoices-company-ELITE").click(), eliteReq]);
    await expectInvoice1100Row(page);

    const uniqueReq = invoicesListResponse(page, (url) => url.searchParams.get("companyCode") === "UNIQUE");
    await Promise.all([page.getByTestId("invoices-company-UNIQUE").click(), uniqueReq]);
    await expect(page.locator(`[data-invoice-id="${REAL_INVOICE_ID}"]`)).toHaveCount(0);
    await expect(page.getByTestId("invoices-empty")).toBeVisible({ timeout: 30_000 });

    const allReq = invoicesListResponse(page, (url) => !url.searchParams.has("companyCode"));
    await Promise.all([page.getByTestId("invoices-company-ALL").click(), allReq]);
    await expectInvoice1100Row(page);
  });

  test("search, rental type, and date filters", async ({ page }) => {
    await page.goto("/en/invoices", { waitUntil: "domcontentloaded" });
    await waitForInvoicesReady(page);
    await page.getByTestId("invoices-company-ALL").click();

    await page.getByTestId("invoices-search").fill(REAL_INVOICE_NUMBER);
    const searchReq = invoicesListResponse(page, (url) => url.searchParams.get("search") === REAL_INVOICE_NUMBER);
    await Promise.all([page.getByTestId("data-search-submit").click(), searchReq]);
    await expectInvoice1100Row(page);

    const clearReq = invoicesListResponse(page, (url) => !url.searchParams.get("search"));
    await Promise.all([page.getByTestId("data-search-clear").click(), clearReq]);

    const typeReq = invoicesListResponse(page, (url) => url.searchParams.get("invoiceType") === "RENTAL");
    const typeTrigger = page.getByTestId("invoices-type-filter").getByRole("combobox");
    await typeTrigger.click();
    await Promise.all([page.getByRole("option", { name: /^Rental$/i }).click(), typeReq]);
    await expectInvoice1100Row(page);

  });

  test("date filter keeps invoice 1100 visible", async ({ page }) => {
    await page.goto("/en/invoices", { waitUntil: "domcontentloaded" });
    await waitForInvoicesReady(page);
    const invoiceUrls: string[] = [];
    page.on("request", (request) => {
      if (request.method() === "GET" && request.url().includes("/invoices")) {
        invoiceUrls.push(request.url());
      }
    });
    await page.getByTestId("invoices-date-from").fill("2026-10-01");
    await page.getByTestId("invoices-date-to").fill("2026-10-31");
    await expect
      .poll(
        () =>
          invoiceUrls.some(
            (url) =>
              url.includes("dateFrom=") &&
              url.includes("2026-10-01") &&
              url.includes("dateTo=") &&
              url.includes("2026-10-31"),
          ),
        { timeout: 20_000 },
      )
      .toBe(true);
    await expectInvoice1100Row(page);
  });

  test("detail drawer, PDF, download, WhatsApp UI and safe 503", async ({ page }) => {
    await page.goto("/en/invoices", { waitUntil: "domcontentloaded" });
    await waitForInvoicesReady(page);
    await expectInvoice1100Row(page);

    const row = page.locator(`[data-invoice-id="${REAL_INVOICE_ID}"]`);
    await row.click();
    const drawer = page.getByTestId("invoice-detail-drawer");
    await expect(drawer).toBeVisible();
    await expect(drawer).toContainText(REAL_INVOICE_NUMBER);
    await expect(drawer).toContainText("ELITE");
    await expect(drawer).toContainText(REAL_CONTRACT_NUMBER);
    await expect(drawer).toContainText("400");
    await expect(drawer.getByRole("button", { name: /edit|delete/i })).toHaveCount(0);
    await expect(page).toHaveScreenshot("invoices-detail-drawer.png");

    const pdfView = page.waitForResponse(
      (response) =>
        response.url().includes(`/invoices/${REAL_INVOICE_ID}/pdf`) &&
        !response.url().includes("download=1") &&
        response.request().method() === "GET",
    );
    await page.getByTestId("invoice-detail-view-pdf").click();
    const pdf = await pdfView;
    expect(pdf.status()).toBe(200);
    expect(pdf.headers()["content-type"] ?? "").toContain("application/pdf");

    const downloadPromise = page.waitForEvent("download");
    const pdfDownload = page.waitForResponse(
      (response) =>
        response.url().includes(`/invoices/${REAL_INVOICE_ID}/pdf`) &&
        response.url().includes("download=1"),
    );
    await page.getByTestId("invoice-detail-download-pdf").click();
    const download = await downloadPromise;
    await pdfDownload;
    expect(download.suggestedFilename()).toBe("Diamond-Elite-Invoice-1100.pdf");

    await page.getByTestId("invoice-detail-send-whatsapp").click();
    const dialog = page.getByTestId("invoice-whatsapp-dialog");
    await expect(dialog).toBeVisible();
    await expect(dialog).toContainText(REAL_INVOICE_NUMBER);
    await expect(dialog).toContainText(REAL_CONTRACT_NUMBER);
    await expect(dialog).toContainText("ELITE");
    await expect(dialog).toContainText("400");
    await expect(page.locator('input[type="tel"]')).toHaveCount(0);
    await expect(page).toHaveScreenshot("invoices-whatsapp-dialog.png");

    let postCount = 0;
    await page.route(`**/invoices/${REAL_INVOICE_ID}/deliveries/whatsapp`, async (route) => {
      if (route.request().method() !== "POST") {
        await route.continue();
        return;
      }
      postCount += 1;
      const body = route.request().postDataJSON() as Record<string, unknown>;
      expect(body.phone).toBeUndefined();
      expect(body.recipientPhone).toBeUndefined();
      expect(body.companyId).toBeUndefined();
      expect(body.message).toBeUndefined();
      await route.fulfill({
        status: 503,
        contentType: "application/json",
        body: JSON.stringify({
          error: {
            code: "SERVICE_UNAVAILABLE",
            message: "WhatsApp provider is not configured",
            context: { reason: "WHATSAPP_PROVIDER_UNCONFIGURED" },
          },
        }),
      });
    });

    const sendButton = page.getByTestId("invoice-whatsapp-send");
    await expect(sendButton).toBeEnabled();
    await sendButton.dblclick({ delay: 50 });
    await expect(page.getByTestId("invoice-whatsapp-error")).toContainText(/WhatsApp delivery is not configured/i, {
      timeout: 15_000,
    });
    expect(postCount).toBeLessThanOrEqual(2);
    expect(postCount).toBeGreaterThanOrEqual(1);
  });

  test("Arabic drawer and WhatsApp translated 503", async ({ page }) => {
    await page.goto("/ar/invoices", { waitUntil: "domcontentloaded" });
    await waitForInvoicesReady(page);
    await page.locator(`[data-invoice-id="${REAL_INVOICE_ID}"]`).click();
    await expect(page.getByTestId("invoice-detail-drawer")).toBeVisible();

    await page.route(`**/invoices/${REAL_INVOICE_ID}/deliveries/whatsapp`, async (route) => {
      if (route.request().method() !== "POST") {
        await route.continue();
        return;
      }
      await route.fulfill({
        status: 503,
        contentType: "application/json",
        body: JSON.stringify({
          error: {
            code: "SERVICE_UNAVAILABLE",
            message: "WhatsApp provider is not configured",
            context: { reason: "WHATSAPP_PROVIDER_UNCONFIGURED" },
          },
        }),
      });
    });
    await page.getByTestId("invoice-detail-send-whatsapp").click();
    await page.getByTestId("invoice-whatsapp-send").click();
    await expect(page.getByTestId("invoice-whatsapp-error")).toContainText(/واتساب|WhatsApp/i);
  });
});
