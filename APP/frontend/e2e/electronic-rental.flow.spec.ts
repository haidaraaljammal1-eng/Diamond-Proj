import { test, expect, type Page } from "@playwright/test";
import {
  auditElectronicRental,
  extractRentalToken,
  seedAvailableVehicle,
  settleElectronicRentalPayment,
  staffToken,
  deactivateVehicle,
  STAFF_EMAIL,
  STAFF_PASSWORD,
} from "./helpers/e2e-api";
import {
  completeContractReviewAndSign,
  completeIdentitySimulation,
  continueAfterContractSign,
} from "./helpers/rental-contract";

test.use({ channel: "chrome" });
test.describe.configure({ timeout: 420_000, mode: "serial" });

async function staffLogin(page: Page, locale: "en") {
  await page.goto(`/${locale}/login`, { waitUntil: "domcontentloaded", timeout: 60_000 });
  await page.locator("#email").fill(STAFF_EMAIL);
  await page.locator("#password").fill(STAFF_PASSWORD);
  await page.getByRole("button", { name: /login|sign in/i }).click();
  await page.waitForURL((url) => !url.pathname.includes("/login"), { timeout: 30_000 });
}

async function generateElectronicLink(page: Page, vehicleId: number) {
  await page.goto("/en/vehicles");
  await expect(page.getByTestId("vehicles-grid")).toBeVisible({ timeout: 60_000 });
  const card = page.locator(`[data-testid="vehicle-card"][data-record-id="${vehicleId}"]`);
  await expect(card).toBeVisible({ timeout: 60_000 });
  await card.getByRole("button", { name: /generate link|set price/i }).click();
  await expect(page.getByTestId("rental-collection-mode-options")).toBeVisible();
  await page.getByTestId("rental-collection-mode-electronic").click();
  await page.getByRole("button", { name: /continue/i }).click();
  await page.getByRole("button", { name: /send link/i }).click();
  const linkField = page.getByTestId("rental-link-url");
  await expect(linkField).toBeVisible({ timeout: 30_000 });
  const href = (await linkField.innerText()).trim();
  expect(href).toMatch(/\/rental\//);
  return href;
}

test("en electronic rental settles via test-provider payment", async ({ page, context }) => {
  const token = await staffToken();
  const vehicle = await seedAvailableVehicle(token, { label: "Electronic E2E EN" });

  try {
    await staffLogin(page, "en");
    const link = await generateElectronicLink(page, vehicle.id);
    const rentalToken = extractRentalToken(link);

    const rentalPage = await context.newPage();
    await rentalPage.goto(link);
    await completeIdentitySimulation(rentalPage);
    await expect(rentalPage.getByTestId("contract-review")).toBeVisible({ timeout: 120_000 });
    await completeContractReviewAndSign(rentalPage);
    await continueAfterContractSign(rentalPage);

    await expect(rentalPage.getByTestId("payment-step")).toBeVisible({ timeout: 60_000 });
    await expect(rentalPage.getByTestId("rental-cash-context")).toHaveCount(0);

    const simulate = rentalPage.getByTestId("simulate-payment-success");
    if (await simulate.isVisible()) {
      await simulate.click();
    } else {
      settleElectronicRentalPayment(rentalToken);
      await rentalPage.reload();
    }

    await expect(rentalPage.getByTestId("handover-step").or(rentalPage.getByText(/payment successful/i))).toBeVisible({
      timeout: 60_000,
    });

    const audit = auditElectronicRental(rentalToken);
    expect(audit.contractStatus).toBe("PAID");
    expect(audit.collectionMode).toBe("ELECTRONIC");
    expect(audit.cardConfirmedCount).toBe(1);
    expect(audit.cashConfirmedCount).toBe(0);
    expect(audit.cardPayment).toMatchObject({
      purpose: "RENTAL",
      method: "CARD",
      status: "CONFIRMED",
    });
    expect(audit.rentalPaymentLedgerCount).toBe(1);
    expect(audit.ledgerCompanyId).toBe(audit.companyId);
  } finally {
    await deactivateVehicle(token, vehicle.id);
  }
});
