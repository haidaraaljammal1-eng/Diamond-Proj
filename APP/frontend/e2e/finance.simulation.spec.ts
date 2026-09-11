import { test, expect, type Page } from "@playwright/test";

test.use({ channel: "chrome" });
test.describe.configure({ timeout: 120_000 });

const email = process.env.PLAYWRIGHT_LOGIN_EMAIL ?? "admin@diamond.test";
const password = process.env.PLAYWRIGHT_LOGIN_PASSWORD ?? "Diamond123!";

async function staffLogin(page: Page) {
  await page.goto("/ar/login");
  await page.locator("#email").fill(email);
  await page.locator("#password").fill(password);
  await page.getByRole("button", { name: /دخول|login|sign in/i }).click();
  await page.waitForURL((url) => !url.pathname.includes("/login"), { timeout: 30_000 });
}

async function waitForFinanceReady(page: Page) {
  await expect(page.getByTestId("finance-screen")).toBeVisible({ timeout: 60_000 });
  await expect(page.getByTestId("finance-kpis")).toBeVisible({ timeout: 60_000 });
}

async function enableFinanceSimulation(page: Page) {
  await page.getByTestId("simulate-finance").click();
  await page.getByTestId("simulate-finance-run").click();
  await expect(page.getByTestId("simulation-badge")).toBeVisible();
  await expect(page.getByTestId("finance-simulation-banner")).toBeVisible();
}

async function selectLedgerFilter(page: Page, label: RegExp, option: RegExp) {
  const ledger = page.getByTestId("finance-ledger");
  await ledger.getByLabel(label).click();
  await page.getByRole("option", { name: option }).click();
}

test.describe("Finance demo simulation", () => {
  test("Arabic simulation covers ledger semantics, filters, periods, and isolation", async ({
    page,
  }) => {
    const writes: string[] = [];
    page.on("request", (request) => {
      const url = request.url();
      const method = request.method();
      if (method === "GET") return;
      if (
        url.includes("/finance") ||
        url.includes("/stripe") ||
        url.includes("/payments") ||
        url.includes("/maintenance") ||
        url.includes("/contracts")
      ) {
        writes.push(`${method} ${url}`);
      }
    });

    await staffLogin(page);
    await page.goto("/ar/finance");
    await waitForFinanceReady(page);

    await enableFinanceSimulation(page);
    await expect(page.getByTestId("finance-add-expense")).toHaveCount(0);
    await page.screenshot({ path: "e2e/__screens__/finance/ar-desktop-sim-1440.png" });
    await page.setViewportSize({ width: 1366, height: 768 });
    await page.screenshot({ path: "e2e/__screens__/finance/ar-desktop-sim-1366.png" });
    await page.setViewportSize({ width: 430, height: 844 });
    await expect(page.getByTestId("finance-ledger-card").first()).toBeVisible();
    await expect(page.getByTestId("finance-ledger-card").first().getByTestId("finance-ledger-movement")).toBeVisible();
    await expect(page.getByTestId("finance-ledger-card").first().getByTestId("finance-ledger-source")).toBeVisible();
    await page.screenshot({ path: "e2e/__screens__/finance/ar-mobile-sim-430.png" });
    await page.setViewportSize({ width: 390, height: 844 });
    await page.screenshot({ path: "e2e/__screens__/finance/ar-mobile-sim-390.png" });
    await page.setViewportSize({ width: 1440, height: 900 });

    await expect(page.getByTestId("finance-kpi-outstanding")).toContainText("AED 2,540");
    await expect(page.getByTestId("finance-kpi-collected")).toContainText("AED");
    await expect(page.getByTestId("finance-kpi-expenses")).toContainText("AED");
    await expect(page.getByTestId("finance-kpi-net")).toContainText("AED");

    const outstandingText = await page.getByTestId("finance-kpi-outstanding").innerText();

    await selectLedgerFilter(page, /^(الحركة|Movement)$/, /^(تحصيل من العميل|Customer Collection)$/);
    const collectionRows = page.locator('[data-testid="finance-ledger-row"]');
    await expect(collectionRows.first()).toBeVisible();
    const collectionCount = await collectionRows.count();
    for (let index = 0; index < collectionCount; index += 1) {
      await expect(collectionRows.nth(index)).toHaveAttribute("data-movement", "COLLECTION");
      await expect(collectionRows.nth(index).getByTestId("finance-ledger-amount")).toContainText("+ AED");
    }

    await selectLedgerFilter(page, /^(المصدر|Source)$/, /^(دفعة إيجار|Rental Payment)$/);
    await expect(page.locator('[data-testid="finance-ledger-row"]')).toHaveCount(1);
    await expect(page.locator('[data-testid="finance-ledger-row"]')).toHaveAttribute(
      "data-source",
      "RENTAL_PAYMENT",
    );
    await expect(
      page.locator('[data-testid="finance-ledger-row"]').getByTestId("finance-ledger-movement"),
    ).toContainText("تحصيل من العميل");
    await expect(
      page.locator('[data-testid="finance-ledger-row"]').getByTestId("finance-ledger-source"),
    ).toContainText("دفعة إيجار");

    await page.getByTestId("finance-ledger-clear").click();

    await selectLedgerFilter(page, /^(الحركة|Movement)$/, /^(مصروف|Expense)$/);
    await selectLedgerFilter(page, /^(المصدر|Source)$/, /^(صيانة|Maintenance)$/);
    await expect(page.locator('[data-testid="finance-ledger-row"]')).toHaveCount(1);
    await expect(page.locator('[data-testid="finance-ledger-row"]')).toHaveAttribute(
      "data-movement",
      "EXPENSE",
    );
    await expect(
      page.locator('[data-testid="finance-ledger-row"]').getByTestId("finance-ledger-amount"),
    ).toContainText("- AED");
    await expect(
      page.locator('[data-testid="finance-ledger-row"]').getByTestId("finance-ledger-source"),
    ).toContainText("صيانة");

    await page.getByTestId("finance-ledger-clear").click();

    await selectLedgerFilter(page, /^(الحركة|Movement)$/, /^(إلغاء مصروف|Expense Reversal)$/);
    await selectLedgerFilter(page, /^(المصدر|Source)$/, /^(مصروف يدوي|Manual Expense)$/);
    await expect(page.locator('[data-testid="finance-ledger-row"]')).toHaveCount(1);
    const reversal = page.locator('[data-testid="finance-ledger-row"]');
    await expect(reversal).toHaveAttribute("data-movement", "EXPENSE_REVERSAL");
    await expect(reversal.getByTestId("finance-ledger-movement")).toContainText("إلغاء مصروف");
    await expect(reversal.getByTestId("finance-ledger-source")).toContainText("مصروف يدوي");
    await expect(reversal.getByTestId("finance-ledger-amount")).toContainText("+ AED");
    await expect(reversal.getByTestId("finance-ledger-movement")).not.toContainText("تحصيل من العميل");

    await page.getByTestId("finance-period-today").click();
    await expect(page.getByTestId("finance-kpi-collected")).toContainText("AED 1,500");
    await expect(page.getByTestId("finance-kpi-outstanding")).toContainText("AED 2,540");
    await page.getByTestId("finance-period-week").click();
    await expect(page.getByTestId("finance-kpi-outstanding")).toHaveText(new RegExp("AED 2,540"));
    await page.getByTestId("finance-period-month").click();
    await expect(page.getByTestId("finance-kpi-outstanding")).toContainText("AED 2,540");
    expect(await page.getByTestId("finance-kpi-outstanding").innerText()).toBe(outstandingText);

    await expect(page.locator('[data-testid="finance-receivable-row"][data-source="RENTAL"]')).toHaveCount(1);
    await expect(page.locator('[data-testid="finance-receivable-row"][data-source="RENEWAL"]')).toHaveCount(1);
    await expect(page.locator('[data-testid="finance-receivable-row"][data-source="RECONCILIATION"]')).toHaveCount(1);
    await expect(page.locator('[data-testid="finance-receivable-row"][data-source="POST_CLOSE_RECEIVABLE"]')).toHaveCount(1);
    await expect(page.getByTestId("finance-receivable-payment-state").first()).toHaveText("بانتظار الدفع");
    await expect(page.getByTestId("finance-open-receivables").getByText("UNPAID", { exact: true })).toHaveCount(0);

    await expect(page.getByTestId("finance-outstanding-breakdown-RENTAL")).toBeVisible();
    await expect(page.getByTestId("finance-outstanding-breakdown-RENEWAL")).toBeVisible();
    await expect(page.getByTestId("finance-outstanding-breakdown-RECONCILIATION")).toBeVisible();
    await expect(page.getByTestId("finance-outstanding-breakdown-POST_CLOSE_RECEIVABLE")).toBeVisible();
    await expect(page.getByTestId("finance-expense-breakdown-MAINTENANCE")).toBeVisible();
    await expect(page.getByTestId("finance-expense-breakdown-VEHICLE_CLEANING")).toBeVisible();
    await expect(page.getByTestId("finance-expense-breakdown-EXPENSE_REVERSAL")).toHaveCount(0);

    await page.getByTestId("simulate-finance").click();
    await page.getByTestId("simulate-finance-reset").click();
    await expect(page.getByTestId("finance-simulation-banner")).toBeVisible();
    await expect(page.getByTestId("finance-kpi-outstanding")).toContainText("AED 2,540");

    await page.getByTestId("simulate-finance").click();
    await page.getByTestId("simulate-finance-disable").click();
    await expect(page.getByTestId("finance-simulation-banner")).toHaveCount(0);
    await expect(page.getByTestId("simulation-badge")).toHaveCount(0);
    await expect(page.getByTestId("finance-add-expense")).toBeVisible();
    expect(writes).toEqual([]);
  });

  test("English LTR simulation smoke", async ({ page }) => {
    await staffLogin(page);
    await page.goto("/en/finance");
    await waitForFinanceReady(page);
    await enableFinanceSimulation(page);
    await expect(page.getByTestId("finance-simulation-banner")).toContainText("DEMO SIMULATION");
    await expect(page.getByTestId("finance-kpi-outstanding")).toContainText("AED 2,540");
    await expect(page.getByRole("heading", { name: "Finance", exact: true })).toBeVisible();
    await expect(page.getByText("Customer Collection").first()).toBeVisible();
    await expect(page.getByTestId("finance-receivable-payment-state").first()).toHaveText("Awaiting Payment");
    await expect(page.getByTestId("finance-open-receivables").getByText("UNPAID", { exact: true })).toHaveCount(0);
    await page.screenshot({ path: "e2e/__screens__/finance/en-desktop-sim.png" });
  });
});
