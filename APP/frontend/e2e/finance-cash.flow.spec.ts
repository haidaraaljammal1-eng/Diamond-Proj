import { test, expect, type Locator, type Page } from "@playwright/test";
import {
  auditCashRental,
  auditCashRoadLiability,
  completeRentalSigning,
  extractRentalToken,
  seedAvailableVehicle,
  seedCashRoadLiability,
  staffToken,
  deactivateVehicle,
  STAFF_EMAIL,
  STAFF_PASSWORD,
} from "./helpers/e2e-api";
import { openViolationsRow } from "./helpers/violations";
import { completeIdentitySimulation } from "./helpers/rental-contract";

test.use({ channel: "chrome" });
test.describe.configure({ timeout: 420_000, mode: "serial" });

async function staffLogin(page: Page) {
  await page.goto("/en/login", { waitUntil: "domcontentloaded", timeout: 60_000 });
  await page.locator("#email").fill(STAFF_EMAIL);
  await page.locator("#password").fill(STAFF_PASSWORD);
  await page.getByRole("button", { name: /login|sign in/i }).click();
  await page.waitForURL((url) => !url.pathname.includes("/login"), { timeout: 30_000 });
}

async function openFinanceLedger(page: Page) {
  await page.goto("/en/finance");
  await expect(page.getByTestId("finance-screen")).toBeVisible({ timeout: 60_000 });
  await expect(page.getByTestId("finance-ledger")).toBeVisible({ timeout: 60_000 });
}

async function expectLedgerCashRow(
  ledger: Locator,
  contractId: string,
  ledgerKind: string,
  movement: "COLLECTION" | "EXPENSE",
  amount: number,
) {
  await ledger.getByTestId("finance-ledger-clear").click();
  await ledger.getByTestId("finance-ledger-search").fill(contractId);
  await ledger.getByTestId("data-search-submit").click();
  const row = ledger.locator(
    `[data-testid="finance-ledger-row"][data-kind="${ledgerKind}"][data-movement="${movement}"]`,
  );
  await expect(row).toHaveCount(1, { timeout: 30_000 });
  await expect(row.getByTestId("finance-ledger-movement")).toContainText(/Cash/i);
  await expect(row.getByTestId("finance-ledger-amount")).toContainText(
    amount.toLocaleString("en-US"),
  );
}

test("finance shows cash rental and cash road liability collections", async ({ page, context }) => {
  const token = await staffToken();
  const vehicle = await seedAvailableVehicle(token, { label: "Finance Cash E2E" });
  const liabilitySeed = seedCashRoadLiability();
  let rentalToken = "";

  try {
    await staffLogin(page);
    await page.goto("/en/vehicles");
    const card = page.locator(`[data-testid="vehicle-card"][data-record-id="${vehicle.id}"]`);
    await expect(card).toBeVisible({ timeout: 60_000 });
    await card.getByRole("button", { name: /generate link|set price/i }).click();
    await expect(page.getByTestId("rental-collection-mode-options")).toBeVisible();
    await page.getByTestId("rental-collection-mode-cash").click();
    await page.getByRole("button", { name: /continue/i }).click();
    await expect(page.getByTestId("rental-cash-context")).toBeVisible();
    await page.getByRole("button", { name: /send link/i }).click();
    const linkResult = page.getByTestId("contract-link-result");
    await expect(linkResult).toBeVisible({ timeout: 30_000 });
    const link = (await linkResult.getByTestId("rental-link-url").innerText()).trim();
    rentalToken = extractRentalToken(link);

    const rentalPage = await context.newPage();
    await rentalPage.goto(link);
    await completeIdentitySimulation(rentalPage);
    await expect(rentalPage.getByTestId("contract-review")).toBeVisible({ timeout: 120_000 });
    completeRentalSigning(rentalToken);
    await rentalPage.reload();
    await expect(rentalPage.getByTestId("handover-step")).toBeVisible({ timeout: 60_000 });

    const rentalAudit = auditCashRental(rentalToken);
    expect(rentalAudit.rentalPaymentLedgerCount).toBe(1);

    const row = await openViolationsRow(
      page,
      liabilitySeed.liabilityId,
      liabilitySeed.contractNumber,
    );
    await row.getByTestId("road-liability-cash-collect-row").click();
    await page.getByTestId("road-liability-cash-collect-confirm").click();
    await expect(row.getByTestId("road-liability-cash-collect-row")).toHaveCount(0, { timeout: 60_000 });

    const liabilityAudit = auditCashRoadLiability(liabilitySeed.liabilityId);
    expect(liabilityAudit.ledgerCount).toBe(1);

    await openFinanceLedger(page);
    await page.getByTestId("finance-refresh").click();
    const ledger = page.getByTestId("finance-ledger");

    await expectLedgerCashRow(
      ledger,
      rentalAudit.contractId,
      "RENTAL_PAYMENT",
      "COLLECTION",
      rentalAudit.cashPayment?.amount ?? rentalAudit.ledgerAmount ?? 0,
    );
    await expectLedgerCashRow(
      ledger,
      liabilitySeed.contractId,
      "ROAD_LIABILITY_PAYMENT",
      "EXPENSE",
      liabilityAudit.ledgerAmount ?? liabilitySeed.amount,
    );
  } finally {
    await deactivateVehicle(token, vehicle.id);
  }
});
