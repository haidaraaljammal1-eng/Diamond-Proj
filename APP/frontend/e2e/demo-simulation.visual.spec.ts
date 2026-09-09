import { test, expect, type Page } from "@playwright/test";

/**
 * Presentation-only Demo Simulation Mode.
 * Public rental uses a route fixture. No Development database mutation.
 */
test.use({ channel: "chrome" });
test.describe.configure({ timeout: 180_000 });

const email = process.env.PLAYWRIGHT_LOGIN_EMAIL ?? "admin@diamond.test";
const password = process.env.PLAYWRIGHT_LOGIN_PASSWORD ?? "Diamond123!";
const DESK_TIMEOUT = 90_000;
const SHOTS = "e2e/__screens__/demo-simulation";

const RENTAL = {
  office: { displayName: "Diamond Rent Car — Marina" },
  flow: { step: "LICENSE_VERIFICATION" },
  contract: {
    contractNumber: "DE-2026-000411",
    status: "AWAITING",
    termsVersion: "diamond-rental-terms-v1",
  },
  vehicle: {
    displayName: "BMW 730Li",
    vehicleType: "Luxury",
    plateNumber: "A 12345",
    modelYear: 2024,
    color: "Black",
    vin: "WBAXXXXDEMO12345",
  },
  rental: {
    rentalDays: 7,
    agreedAmount: 3500,
    currency: "AED",
    depositAmount: 1500,
    startAt: "2026-09-12T08:00:00.000Z",
    endAt: "2026-09-19T08:00:00.000Z",
    actualPickupAt: null,
    actualReturnAt: null,
  },
  customer: null,
  licenseVerification: {
    status: "PROVIDER_UNAVAILABLE",
    licenseNumber: null,
    licenseNumberMasked: null,
    expiryDate: null,
    confidence: null,
  },
  payment: {
    status: null,
    method: null,
    amount: 3500,
    currency: "AED",
    providerAvailable: false,
  },
};

function mockPublicRental(page: Page, mutations: { count: number }) {
  return page.route("**/contracts/rental/**", async (route) => {
    const method = route.request().method();
    if (method !== "GET") {
      mutations.count += 1;
      await route.fulfill({
        status: 599,
        contentType: "application/json",
        body: JSON.stringify({
          error: { code: "SIMULATION_BLOCKED", message: "Simulation must not mutate" },
        }),
      });
      return;
    }
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ data: RENTAL }),
    });
  });
}

function mockTarsPosts(page: Page, mutations: { count: number }) {
  return page.route("**/contracts/**/tars", async (route) => {
    if (route.request().method() !== "GET") {
      mutations.count += 1;
      await route.fulfill({
        status: 405,
        contentType: "application/json",
        body: JSON.stringify({
          error: { code: "TARS_READ_ONLY", message: "No TARS write" },
        }),
      });
      return;
    }
    await route.continue();
  });
}

async function login(page: Page, locale: "ar" | "en") {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    await page.goto(`/${locale}/login`);
    if (!page.url().includes("/login")) return;
    await page.locator("#email").fill(email);
    await page.locator("#password").fill(password);
    await page.getByRole("button", { name: /دخول|login|sign in/i }).click();
    try {
      await page.waitForURL((url) => !url.pathname.includes("/login"), { timeout: 25_000 });
      return;
    } catch (error) {
      if (attempt === 2) throw error;
      await page.waitForTimeout(2_000);
    }
  }
}

async function openFirstContract(page: Page, locale: "ar" | "en") {
  await page.goto(`/${locale}/contracts`);
  const table = page.getByTestId("contracts-table");
  const empty = page.getByTestId("contracts-empty");
  await expect(table.or(empty)).toBeVisible({ timeout: DESK_TIMEOUT });
  if (!(await table.isVisible())) test.skip(true, "No contract in this environment");
  await page.locator("[data-testid=contracts-table] tbody tr").first().click();
  await expect(page.getByTestId("contract-detail")).toBeVisible({ timeout: DESK_TIMEOUT });
}

test.describe("Demo Simulation Mode — customer rental", () => {
  test("AR: VALID license → contract → payment → READY_FOR_HANDOVER without mutations", async ({
    page,
  }) => {
    const mutations = { count: 0 };
    await mockPublicRental(page, mutations);

    await page.goto("/ar/rental/demo-sim-token");
    await expect(page.getByTestId("license-step")).toBeVisible({ timeout: DESK_TIMEOUT });
    await expect(page.getByTestId("simulate-license")).toBeVisible();
    await expect(page.getByTestId("rental-summary")).toContainText("BMW 730Li");
    await expect(page.getByTestId("rental-summary")).toContainText("AED 3,500");
    await expect(page.getByTestId("rental-summary")).toContainText("A 12345");
    await page.screenshot({ path: `${SHOTS}/ar-01-license-verification.png`, fullPage: true });

    await page.getByTestId("simulate-license").click();
    await page.getByTestId("simulate-license-valid").click();
    await expect(page.getByTestId("license-verifying")).toBeVisible();
    await expect(page.getByTestId("license-valid")).toBeVisible({ timeout: 8_000 });
    await expect(page.getByText("DXB-DEMO-482731")).toBeVisible();
    await expect(page.getByTestId("simulation-badge")).toBeVisible();
    await page.screenshot({ path: `${SHOTS}/ar-02-license-valid.png`, fullPage: true });

    await page.getByRole("button", { name: "متابعة إلى عقد الإيجار" }).click();
    await expect(page.getByTestId("contract-step")).toBeVisible();
    await expect(page.getByTestId("contract-step")).toContainText("DE-2026-000411");
    await expect(page.getByTestId("contract-step")).toContainText("A 12345");
    await page.getByTestId("simulate-contract").click();
    await page.getByTestId("simulate-contract-fill").click();
    await expect(page.locator('input[name="name"]')).toHaveValue("Demo Customer");
    await page.screenshot({ path: `${SHOTS}/ar-03-official-contract.png`, fullPage: true });

    await page.getByRole("button", { name: "حفظ البيانات" }).click();
    await expect(page.getByRole("checkbox")).toBeVisible({ timeout: 8_000 });
    await page.getByRole("checkbox").check();
    await page.getByRole("button", { name: "الموافقة والمتابعة إلى الدفع" }).click();
    await expect(page.getByTestId("payment-step")).toBeVisible({ timeout: 8_000 });
    await expect(page.getByTestId("payment-step")).toContainText("DE-2026-000411");
    await expect(page.getByTestId("payment-step")).toContainText("3,500");
    await page.screenshot({ path: `${SHOTS}/ar-04-payment.png`, fullPage: true });

    await page.getByTestId("simulate-payment").click();
    await page.getByTestId("simulate-payment-run").click();
    await expect(page.getByTestId("payment-processing")).toBeVisible();
    await page.screenshot({ path: `${SHOTS}/ar-05-payment-processing.png`, fullPage: true });
    await expect(page.getByTestId("handover-step")).toBeVisible({ timeout: 12_000 });
    await expect(page.getByText("تم تأكيد الدفع بنجاح")).toBeVisible();
    await expect(page.getByText("أصبح عقد الإيجار جاهزًا لتسليم المركبة")).toBeVisible();
    await page.screenshot({ path: `${SHOTS}/ar-06-handover.png`, fullPage: true });

    expect(mutations.count).toBe(0);
  });

  test("EN: license scenarios, failed payment, pending payment, reset", async ({ page }) => {
    const mutations = { count: 0 };
    await mockPublicRental(page, mutations);

    await page.goto("/en/rental/demo-sim-token");
    await expect(page.getByTestId("simulate-license")).toBeVisible({ timeout: DESK_TIMEOUT });
    await expect(page.locator("html")).toHaveAttribute("dir", "ltr");

    await page.getByTestId("simulate-license").click();
    await page.getByTestId("simulate-license-expired").click();
    await expect(page.getByTestId("license-expired")).toBeVisible({ timeout: 8_000 });

    await page.getByTestId("simulate-license").click();
    await page.getByTestId("simulate-license-unreadable").click();
    await expect(page.getByTestId("license-unreadable")).toBeVisible({ timeout: 8_000 });

    await page.getByTestId("simulate-license").click();
    await page.getByTestId("simulate-license-valid").click();
    await expect(page.getByTestId("license-valid")).toBeVisible({ timeout: 8_000 });
    await page.getByRole("button", { name: "Continue to rental contract" }).click();
    await page.getByTestId("simulate-contract").click();
    await page.getByTestId("simulate-contract-fill").click();
    await page.getByRole("button", { name: "Save details" }).click();
    await expect(page.getByRole("checkbox")).toBeVisible({ timeout: 8_000 });
    await page.getByRole("checkbox").check();
    await page.getByRole("button", { name: "Accept & Continue to Payment" }).click();
    await expect(page.getByTestId("payment-step")).toBeVisible({ timeout: 8_000 });

    await page.getByTestId("simulate-payment").click();
    await page.getByTestId("simulate-payment-failed").click();
    await expect(page.getByTestId("payment-failed")).toBeVisible({ timeout: 8_000 });

    await page.getByTestId("simulate-payment").click();
    await page.getByTestId("simulate-payment-pending").click();
    await expect(page.getByTestId("payment-pending")).toBeVisible({ timeout: 8_000 });

    await page.getByTestId("simulation-reset").click();
    await expect(page.getByTestId("license-step")).toBeVisible();
    await expect(page.getByTestId("license-unavailable")).toBeVisible();
    await expect(page.getByTestId("simulation-badge")).toHaveCount(0);

    expect(mutations.count).toBe(0);
  });

  test("mobile 390px and 430px keep simulation controls inside the viewport", async ({
    page,
  }) => {
    const mutations = { count: 0 };
    await mockPublicRental(page, mutations);

    for (const width of [390, 430] as const) {
      await page.setViewportSize({ width, height: 844 });
      await page.goto("/ar/rental/demo-sim-token");
      await expect(page.getByTestId("simulate-license")).toBeVisible({ timeout: DESK_TIMEOUT });
      await page.getByTestId("simulate-license").click();
      await expect(page.getByTestId("simulate-license-valid")).toBeVisible();
      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
      );
      expect(overflow).toBeLessThanOrEqual(1);
      await page.screenshot({ path: `${SHOTS}/ar-mobile-${width}.png`, fullPage: true });
      await page.keyboard.press("Escape");
    }

    expect(mutations.count).toBe(0);
  });
});

test.describe("Demo Simulation Mode — TARS status", () => {
  test("AR: Not Connected, then Synced and Partial Failure overlays", async ({ page }) => {
    const tarsWrites = { count: 0 };
    await mockTarsPosts(page, tarsWrites);
    await login(page, "ar");
    await openFirstContract(page, "ar");

    const tars = page.getByTestId("contract-tars");
    await expect(tars).toBeVisible();
    await expect(tars.getByText("غير متصل حالياً")).toBeVisible({ timeout: 60_000 });
    await tars.screenshot({ path: `${SHOTS}/ar-07-tars-not-connected.png` });

    await page.getByTestId("simulate-tars").click();
    await page.getByTestId("simulate-tars-synced").click();
    await expect(tars.getByText("تمت المزامنة", { exact: true })).toHaveCount(3);
    await expect(page.getByTestId("simulation-badge")).toBeVisible();
    await tars.screenshot({ path: `${SHOTS}/ar-08-tars-synced.png` });

    await page.getByTestId("simulate-tars").click();
    await page.getByTestId("simulate-tars-partialFailure").click();
    await expect(tars.getByText("فشل الربط")).toBeVisible();
    await expect(tars.getByRole("button", { name: /retry|إعادة المحاولة/i })).toHaveCount(0);
    await tars.screenshot({ path: `${SHOTS}/ar-09-tars-partial-failure.png` });

    expect(tarsWrites.count).toBe(0);
  });
});
