import { test, expect, type Page } from "@playwright/test";
import {
  auditCashRoadLiability,
  seedCashRoadLiability,
  STAFF_EMAIL,
  STAFF_PASSWORD,
} from "./helpers/e2e-api";
import { openViolationsRow } from "./helpers/violations";

test.use({ channel: "chrome" });
test.describe.configure({ timeout: 180_000 });

async function staffLogin(page: Page, locale: "en") {
  await page.goto(`/${locale}/login`, { waitUntil: "domcontentloaded", timeout: 60_000 });
  await page.locator("#email").fill(STAFF_EMAIL);
  await page.locator("#password").fill(STAFF_PASSWORD);
  await page.getByRole("button", { name: /login|sign in/i }).click();
  await page.waitForURL((url) => !url.pathname.includes("/login"), { timeout: 30_000 });
}

test("en cash road liability collects via Mark Cash Collected", async ({ page }) => {
  const seed = seedCashRoadLiability();
  await staffLogin(page, "en");
  const row = await openViolationsRow(page, seed.liabilityId, seed.contractNumber);
  await expect(row.getByTestId("road-liability-cash-collect-row")).toBeVisible();
  await expect(row.getByTestId("road-liability-collect-row")).toHaveCount(0);

  await row.getByTestId("road-liability-cash-collect-row").click();
  await expect(page.getByTestId("road-liability-cash-collect-confirm")).toBeVisible({ timeout: 30_000 });
  await expect(page.getByTestId("road-liability-collect-confirm")).toHaveCount(0);
  await page.getByTestId("road-liability-cash-collect-confirm").click();

  await expect(row.getByTestId("road-liability-cash-collect-row")).toHaveCount(0, { timeout: 60_000 });

  const audit = auditCashRoadLiability(seed.liabilityId);
  expect(audit.collectionStatus).toBe("SETTLED");
  expect(audit.settlementChannel).toBe("CASH");
  expect(audit.contractStatus).toBe("CLOSED");
  expect(audit.roadLiabilityPaymentCount).toBe(1);
  expect(audit.payment).toMatchObject({
    purpose: "ROAD_LIABILITY",
    method: "CASH",
    status: "CONFIRMED",
    provider: null,
    amount: seed.amount,
  });
  expect(audit.ledgerCount).toBe(1);
  expect(audit.ledgerCompanyId).toBe(seed.companyId);
});
