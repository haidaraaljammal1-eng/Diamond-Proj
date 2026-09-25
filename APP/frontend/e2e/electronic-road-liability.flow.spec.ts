import { test, expect, type Page } from "@playwright/test";
import {
  auditElectronicRoadLiability,
  collectElectronicRoadLiability,
  roadLiabilityCollectionCapability,
  seedElectronicRoadLiability,
  staffToken,
  STAFF_EMAIL,
  STAFF_PASSWORD,
} from "./helpers/e2e-api";
import { openViolationsRow } from "./helpers/violations";

test.use({ channel: "chrome" });
test.describe.configure({ timeout: 180_000 });

async function staffLogin(page: Page) {
  await page.goto("/en/login", { waitUntil: "domcontentloaded", timeout: 60_000 });
  await page.locator("#email").fill(STAFF_EMAIL);
  await page.locator("#password").fill(STAFF_PASSWORD);
  await page.getByRole("button", { name: /login|sign in/i }).click();
  await page.waitForURL((url) => !url.pathname.includes("/login"), { timeout: 30_000 });
}

test("en v2 electronic road liability shows off-session CTA and settles once", async ({ page }) => {
  const seed = seedElectronicRoadLiability("v2");
  expect(seed.offSessionEligible).toBe(true);

  await staffLogin(page);
  const row = await openViolationsRow(page, seed.liabilityId, seed.contractNumber);

  await expect(row.getByTestId("road-liability-collect-row")).toBeVisible({ timeout: 60_000 });
  await expect(row.getByTestId("road-liability-cash-collect-row")).toHaveCount(0);

  await row.getByTestId("road-liability-collect-row").click();
  await expect(page.getByTestId("road-liability-collect-confirm")).toBeVisible({ timeout: 30_000 });
  await page.getByRole("button", { name: /cancel/i }).click();

  collectElectronicRoadLiability(seed.liabilityId, "off-session");
  await page.getByTestId("road-liabilities-refresh").click();
  await expect(row.getByTestId("road-liability-collect-row")).toHaveCount(0, { timeout: 60_000 });

  const audit = auditElectronicRoadLiability(seed.liabilityId);
  expect(audit.collectionStatus).toBe("SETTLED");
  expect(audit.contractCollectionMode).toBe("ELECTRONIC");
  expect(audit.roadLiabilityPaymentCount).toBe(1);
  expect(audit.payment).toMatchObject({
    purpose: "ROAD_LIABILITY",
    method: "CARD",
    status: "CONFIRMED",
  });
  expect(audit.ledgerCount).toBe(1);
  expect(audit.ledgerCompanyId).toBe(seed.companyId);
});

test("en v1 electronic road liability hides off-session and uses payment-link fallback", async ({ page }) => {
  const seed = seedElectronicRoadLiability("v1");
  expect(seed.offSessionEligible).toBe(false);
  const token = await staffToken();

  const capability = await roadLiabilityCollectionCapability(token, seed.liabilityId);
  expect(capability.offSessionAvailable).toBe(false);
  expect(capability.paymentLinkAvailable).toBe(true);
  expect(capability.cashCollectionRequired).toBe(false);

  await staffLogin(page);
  const row = await openViolationsRow(page, seed.liabilityId, seed.contractNumber);
  await expect(row.getByTestId("road-liability-collect-row")).toHaveCount(0);
  await expect(row.getByTestId("road-liability-cash-collect-row")).toHaveCount(0);

  collectElectronicRoadLiability(seed.liabilityId, "payment-link");
  const audit = auditElectronicRoadLiability(seed.liabilityId);
  expect(audit.collectionStatus).toBe("SETTLED");
  expect(audit.payment).toMatchObject({
    purpose: "ROAD_LIABILITY",
    method: "CARD",
    status: "CONFIRMED",
  });
  expect(audit.ledgerCount).toBe(1);
});
