import { test, expect, type BrowserContext, type Page } from "@playwright/test";
import {
  auditCashRental,
  extractRentalToken,
  seedAvailableVehicle,
  staffToken,
  deactivateVehicle,
} from "./helpers/e2e-api";

/**
 * Cash rental E2E — requires live backend (:3000) + frontend (:3100) with
 * DIAMOND_SIMULATION_ENABLED and fake OCR provider in development.
 *
 * Run: npx playwright test e2e/cash-rental.flow.spec.ts
 */
test.use({ channel: "chrome" });
test.describe.configure({ timeout: 420_000 });

const SHOTS = "e2e/__screens__/cash-rental";

function isPaymentInitiationRequest(url: string, method: string): boolean {
  if (method !== "POST") return false;
  if (url.includes("api.stripe.com")) return true;
  if (/\/rental\/[^/]+\/payment(?:\/|$)/.test(url)) return true;
  if (/\/rental\/[^/]+\/card-link(?:\/|$)/.test(url)) return true;
  if (/\/payments\/webhooks\//.test(url)) return true;
  return false;
}

function attachPaymentInitiationGuard(context: BrowserContext) {
  const paymentInitiations: string[] = [];
  const onRequest = (request: { url: () => string; method: () => string }) => {
    const url = request.url();
    const method = request.method();
    if (isPaymentInitiationRequest(url, method)) {
      paymentInitiations.push(`${method} ${url}`);
    }
  };
  context.on("request", onRequest);
  return paymentInitiations;
}

async function staffLogin(page: Page, locale: "ar" | "en") {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    await page.goto(`/${locale}/login`, { waitUntil: "domcontentloaded", timeout: 60_000 });
    if (!page.url().includes("/login")) return;
    await page.locator("#email").fill(process.env.PLAYWRIGHT_LOGIN_EMAIL ?? "admin@diamond.test");
    await page.locator("#password").fill(process.env.PLAYWRIGHT_LOGIN_PASSWORD ?? "Diamond123!");
    await page.getByRole("button", { name: /دخول|login|sign in/i }).click();
    try {
      await page.waitForURL((url) => !url.pathname.includes("/login"), { timeout: 30_000 });
      return;
    } catch (error) {
      if (attempt === 2) throw error;
      await page.waitForTimeout(2_000);
    }
  }
}

async function generateCashLink(page: Page, locale: "ar" | "en", vehicleId: number) {
  await page.goto(`/${locale}/vehicles`);
  await expect(page.getByTestId("vehicles-grid")).toBeVisible({ timeout: 60_000 });

  const card = page.locator(`[data-testid="vehicle-card"][data-record-id="${vehicleId}"]`);
  await expect(card).toBeVisible({ timeout: 60_000 });
  const generate = card.getByRole("button", {
    name: locale === "ar" ? /توليد رابط|إنشاء رابط|تحديد السعر/i : /generate link|set price/i,
  });
  await expect(generate).toBeVisible({ timeout: 30_000 });
  await generate.click();

  await expect(page.getByTestId("rental-collection-mode-options")).toBeVisible();
  await page.getByTestId("rental-collection-mode-cash").click();
  await page
    .getByRole("button", { name: locale === "ar" ? /متابعة|continue/i : /continue/i })
    .click();
  await expect(page.getByTestId("rental-cash-context")).toBeVisible();
  await page
    .getByRole("button", { name: locale === "ar" ? /إرسال الرابط|send link/i : /send link/i })
    .click();

  const linkResult = page.getByTestId("contract-link-result");
  await expect(linkResult).toBeVisible({ timeout: 30_000 });
  const linkField = linkResult.getByTestId("rental-link-url");
  await expect(linkField).toBeVisible({ timeout: 30_000 });
  const href = (await linkField.innerText()).trim();
  expect(href).toMatch(/\/rental\//);
  return href;
}

async function drawRequiredSignatures(page: Page) {
  const canvases = page.getByTestId("signatures").locator("canvas");
  const count = await canvases.count();
  for (let index = 0; index < count; index += 1) {
    const canvas = canvases.nth(index);
    if (!(await canvas.isVisible())) continue;
    const box = await canvas.boundingBox();
    if (!box) continue;
    const startX = box.x + box.width * 0.2;
    const endX = box.x + box.width * 0.8;
    const y = box.y + box.height * 0.55;
    await page.mouse.move(startX, y);
    await page.mouse.down();
    await page.mouse.move(endX, y, { steps: 12 });
    await page.mouse.up();
  }
}

async function completeIdentitySimulation(rentalPage: Page) {
  await expect(rentalPage.getByTestId("license-step")).toBeVisible({ timeout: 60_000 });
  await rentalPage.getByTestId("simulate-license-valid").click();
  await expect(rentalPage.getByTestId("license-valid")).toBeVisible({ timeout: 30_000 });

  const passportSim = rentalPage.getByTestId("simulate-passport-ready");
  if (await passportSim.isVisible()) {
    await passportSim.click();
    await expect(
      rentalPage
        .getByTestId("passport-ready")
        .or(rentalPage.getByTestId("contract-review")),
    ).toBeVisible({ timeout: 30_000 });
  }

  const identityContinue = rentalPage.getByTestId("identity-continue");
  if (await identityContinue.isVisible()) {
    await identityContinue.click();
  }
}

for (const locale of ["en", "ar"] as const) {
  test(`${locale} cash rental completes without payment step`, async ({ page, context }) => {
    const paymentInitiations = attachPaymentInitiationGuard(context);
    const token = await staffToken();
    const vehicle = await seedAvailableVehicle(token, { label: `Cash E2E ${locale}` });

    try {
      await staffLogin(page, locale);
      const link = await generateCashLink(page, locale, vehicle.id);
      const rentalToken = extractRentalToken(link);

      const rentalPage = await context.newPage();
      await rentalPage.goto(link);
      await completeIdentitySimulation(rentalPage);
      await expect(rentalPage.getByTestId("contract-review")).toBeVisible({ timeout: 120_000 });
      const fillTest = rentalPage.getByTestId("contract-review-fill-test-data");
      if (await fillTest.isVisible()) await fillTest.click();
      await drawRequiredSignatures(rentalPage);
      const saveReview = rentalPage.getByRole("button", {
        name: locale === "ar" ? /تأكيد المراجعة|حفظ/i : /confirm review|save/i,
      });
      if (await saveReview.isVisible()) {
        const saveResponse = rentalPage.waitForResponse(
          (response) =>
            response.request().method() === "POST" &&
            response.url().includes("/official-contract"),
          { timeout: 60_000 },
        );
        await saveReview.click();
        await saveResponse;
      }
      const signResponse = rentalPage.waitForResponse(
        (response) =>
          response.request().method() === "POST" &&
          response.url().includes("/official-contract/sign"),
        { timeout: 60_000 },
      );
      await rentalPage.getByTestId("contract-review-sign").click();
      await signResponse;
      const continueButton = rentalPage.getByTestId("contract-review-continue");
      await expect(continueButton.or(rentalPage.getByTestId("handover-step"))).toBeVisible({
        timeout: 60_000,
      });
      if (await continueButton.isVisible()) await continueButton.click();
      await expect(rentalPage.getByTestId("handover-step")).toBeVisible({ timeout: 60_000 });
      await expect(rentalPage.getByTestId("payment-step")).toHaveCount(0);
      await expect(rentalPage.getByText(/payment successful/i)).toHaveCount(0);
      expect(paymentInitiations).toEqual([]);

      const audit = auditCashRental(rentalToken);
      expect(audit.contractStatus).toBe("PAID");
      expect(audit.collectionMode).toBe("CASH");
      expect(audit.cashConfirmedCount).toBe(1);
      expect(audit.rentalPaymentCount).toBe(1);
      expect(audit.cashPayment).toMatchObject({
        purpose: "RENTAL",
        method: "CASH",
        status: "CONFIRMED",
        provider: null,
      });
      expect(audit.rentalPaymentLedgerCount).toBe(1);
      expect(audit.ledgerCompanyId).toBe(audit.companyId);

      await rentalPage.screenshot({
        path: `${SHOTS}/${locale}-${locale === "ar" ? "rtl" : "ltr"}-completion.png`,
        fullPage: true,
      });
    } finally {
      await deactivateVehicle(token, vehicle.id);
    }
  });
}
