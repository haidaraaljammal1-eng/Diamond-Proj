import { test, expect, type Page } from "@playwright/test";

test.use({ channel: "chrome" });
test.describe.configure({ timeout: 90_000 });

const email = process.env.PLAYWRIGHT_LOGIN_EMAIL ?? "admin@diamond.test";
const password = process.env.PLAYWRIGHT_LOGIN_PASSWORD ?? "Diamond123!";

const eliteId = "11111111-1111-4111-8111-111111111101";
const uniqueId = "22222222-2222-4222-8222-222222222202";

const mockReturnedContracts = {
  items: [
    {
      contractId: eliteId,
      contractNumber: "ELT-RC-001",
      status: "REVIEW",
      collectionMode: "ELECTRONIC",
      company: {
        id: 1,
        code: "ELITE",
        displayName: "Elite Rent",
        accentColor: "#8B6914",
      },
      customerName: "Ahmed Test",
      vehicleDisplayName: "BMW 520i",
      plateNumber: "A 12345",
      carInOccurredAt: new Date().toISOString(),
      cardAvailability: "available",
      capabilityReasonCode: null,
      savedPaymentMethod: { brand: "visa", last4: "4242" },
    },
    {
      contractId: uniqueId,
      contractNumber: "UNQ-RC-002",
      status: "CLOSED",
      collectionMode: "ELECTRONIC",
      company: {
        id: 2,
        code: "UNIQUE",
        displayName: "Unique Cars",
        accentColor: "#1A4D6B",
      },
      customerName: "Sara Test",
      vehicleDisplayName: "Mercedes C200",
      plateNumber: "B 99887",
      carInOccurredAt: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString(),
      cardAvailability: "unavailable",
      capabilityReasonCode: "ROAD_LIABILITY_AUTHORIZATION_MISSING",
      savedPaymentMethod: null,
    },
  ],
  meta: { page: 1, pageSize: 20, total: 2, totalPages: 1 },
};

async function staffLogin(page: Page) {
  await page.goto("/ar/login");
  await page.locator("#email").fill(email);
  await page.locator("#password").fill(password);
  await page.getByRole("button", { name: /دخول|login|sign in/i }).click();
  await page.waitForURL((url) => !url.pathname.includes("/login"), { timeout: 30_000 });
}

function installReturnedContractsMock(page: Page) {
  return page.route(/returned-contracts(\?|$)/, async (route) => {
    if (route.request().method() !== "GET") {
      await route.continue();
      return;
    }
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        data: mockReturnedContracts.items,
        meta: mockReturnedContracts.meta,
      }),
    });
  });
}

test.describe("Returned contracts tab (mocked API)", () => {
  test("Arabic RTL — table, companies, charge dialogs", async ({ page }) => {
    await installReturnedContractsMock(page);
    await staffLogin(page);
    await page.goto("/ar/violations");
    await expect(page.getByTestId("road-liabilities-screen")).toBeVisible({ timeout: 60_000 });
    await page.getByTestId("violations-tab-returned-contracts").click();
    await expect(page.getByTestId("returned-contracts-panel")).toBeVisible();
    await expect(page.getByTestId(`returned-contract-${eliteId}`)).toBeVisible();
    await expect(page.getByTestId(`returned-contract-${uniqueId}`)).toBeVisible();
    await expect(page.getByTestId("staff-charge-other-input")).toHaveCount(0);
    await page.screenshot({
      path: "e2e/__screens__/violations/ar-returned-contracts-desktop.png",
      fullPage: true,
    });

    await page
      .getByTestId(`returned-contract-${eliteId}`)
      .getByRole("button", { name: /تحصيل|Collect/i })
      .click();
    await expect(page.getByTestId("shared-dialog")).toBeVisible();
    await page.getByTestId("staff-charge-amount").fill("350");
    await page.getByRole("button", { name: /متابعة|Continue/i }).click();
    await expect(page.getByText(/مخالفة مرورية|Traffic Violation/i)).toBeVisible();
    await page.screenshot({
      path: "e2e/__screens__/violations/ar-staff-charge-traffic-confirm.png",
    });
    await page.getByRole("button", { name: /رجوع|Back/i }).click();
    await page.getByRole("radio", { name: /سالك|Salik/i }).check();
    await page.getByRole("button", { name: /متابعة|Continue/i }).click();
    await page.screenshot({
      path: "e2e/__screens__/violations/ar-staff-charge-salik-confirm.png",
    });

    await page.setViewportSize({ width: 390, height: 844 });
    await page.screenshot({
      path: "e2e/__screens__/violations/ar-returned-contracts-mobile.png",
      fullPage: true,
    });
  });

  test("English LTR — returned tab and unavailable card row", async ({ page }) => {
    await installReturnedContractsMock(page);
    await staffLogin(page);
    await page.goto("/en/violations");
    await expect(page.getByTestId("road-liabilities-screen")).toBeVisible({ timeout: 60_000 });
    await page.getByTestId("violations-tab-returned-contracts").click();
    await expect(page.getByTestId("violations-tab-returned-contracts")).toHaveAttribute(
      "aria-selected",
      "true",
    );
    const uniqueRow = page.getByTestId(`returned-contract-${uniqueId}`);
    await expect(uniqueRow).toContainText("Unavailable");
    await expect(uniqueRow.getByRole("button", { name: /Collect Charge/i })).toBeDisabled();
    await page.screenshot({
      path: "e2e/__screens__/violations/en-returned-contracts-desktop.png",
      fullPage: true,
    });
  });
});
