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
  type SeededVehicle,
} from "./helpers/e2e-api";
import {
  completeContractReviewAndSign,
  completeIdentitySimulation,
  continueAfterContractSign,
  fillAndSaveRenterDetails,
} from "./helpers/rental-contract";
import { loginStaffWithCredentials } from "./helpers/rbac-v2";

test.use({ channel: "chrome" });
test.describe.configure({ timeout: 420_000, mode: "serial" });

async function staffLogin(page: Page, locale: "en") {
  await loginStaffWithCredentials(page, locale, STAFF_EMAIL, STAFF_PASSWORD);
}

async function generateElectronicLink(page: Page, vehicle: SeededVehicle) {
  await page.goto("/en/vehicles");
  // Fleet list is paginated (newest first); search by plate so the seeded card is always on screen.
  await expect(page.getByTestId("vehicle-filters")).toBeVisible({ timeout: 60_000 });
  await page.getByTestId("vehicle-search").fill(vehicle.plateNumber);
  await page.getByTestId("data-search-submit").click();
  await expect(page.getByTestId("vehicles-grid")).toBeVisible({ timeout: 60_000 });
  const card = page.locator(`[data-testid="vehicle-card"][data-record-id="${vehicle.id}"]`);
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
    const link = await generateElectronicLink(page, vehicle);
    const rentalToken = extractRentalToken(link);

    const rentalPage = await context.newPage();
    await rentalPage.goto(link);
    await completeIdentitySimulation(rentalPage);
    await fillAndSaveRenterDetails(rentalPage);
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
