import { test, expect, type Page } from "@playwright/test";

/**
 * Renewal visual checks. Public pages use route fixtures — they do not write contracts.
 */
test.use({ channel: "chrome" });
test.describe.configure({ timeout: 120_000 });

const email = process.env.PLAYWRIGHT_LOGIN_EMAIL ?? "admin@diamond.test";
const password = process.env.PLAYWRIGHT_LOGIN_PASSWORD ?? "Diamond123!";
const DESK_TIMEOUT = 90_000;
const SHOTS = "e2e/__screens__/renewal-flow";

const OFFER = {
  office: { displayName: "Diamond Rent Car" },
  contractNumber: "DE-2026-000099",
  status: "ACTIVE",
  priceType: "DAILY",
  rentalDays: 3,
  agreedAmount: 1500,
  currency: "AED",
  startAt: "2026-09-01T08:00:00.000Z",
  endAt: "2026-09-04T08:00:00.000Z",
  termsVersion: "diamond-rental-terms-v1",
  vehicle: {
    displayName: "Renewal Fixture",
    plateNumber: "RN 123",
    color: "White",
    modelYear: 2024,
  },
  renewal: {
    additionalDays: 4,
    additionalAmount: 700,
    previousEndAt: "2026-09-04T08:00:00.000Z",
    newEndAt: "2026-09-08T08:00:00.000Z",
    confirmed: false,
  },
};

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

function mockPublicRenewal(page: Page, data: Record<string, unknown>, status = 200) {
  let latest = data;
  return page.route("**/contracts/renew/**", async (route) => {
    if (route.request().url().includes("/payment")) {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          data: {
            payment: { status: "PROCESSING", amount: 700, currency: "AED", method: "CARD" },
            checkoutUrl: "https://checkout.test/renewal-fixture",
            statusToken: "renewal-status-token-fixture",
            providerAvailable: true,
          },
        }),
      });
      return;
    }
    if (route.request().method() === "POST" && route.request().url().includes("/confirm")) {
      const payment =
        (latest.payment as { providerAvailable?: boolean } | undefined) ??
        ({ providerAvailable: true } as { providerAvailable: boolean });
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          data: {
            ...OFFER,
            ...latest,
            payment,
            renewal: { ...OFFER.renewal, confirmed: false, awaitingPayment: true },
          },
        }),
      });
      return;
    }
    if (route.request().method() === "POST") {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          data: {
            ...OFFER,
            rentalDays: 7,
            agreedAmount: 2200,
            renewal: { ...OFFER.renewal, confirmed: true },
          },
        }),
      });
      return;
    }
    if (status === 200) latest = data;
    await route.fulfill({
      status,
      contentType: "application/json",
      body: JSON.stringify(
        status === 200
          ? { data }
          : {
              error: {
                code: "TOKEN_EXPIRED",
                message: "Contract link has expired",
                context: { reason: "CONTRACT_LINK_EXPIRED" },
              },
            },
      ),
    });
  });
}

function mockDetail(page: Page, overrides: Record<string, unknown>) {
  return page.route(
    (url) => /\/contracts\/[^/?]+$/.test(url.pathname),
    async (route) => {
      const upstream = await route.fetch();
      const payload = (await upstream.json()) as { data: Record<string, unknown> };
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ data: { ...payload.data, ...overrides } }),
      });
    },
  );
}

async function openFirstRow(page: Page) {
  await page.goto("/en/contracts");
  const table = page.getByTestId("contracts-table");
  const empty = page.getByTestId("contracts-empty");
  await expect(table.or(empty)).toBeVisible({ timeout: DESK_TIMEOUT });
  test.skip(!(await table.isVisible()), "No contracts on the desk to open");
  await page.locator("[data-testid=contracts-table] tbody tr").first().click();
  await expect(page.getByTestId("contract-detail")).toBeVisible({ timeout: DESK_TIMEOUT });
}

test.describe("Public renewal page", () => {
  test("English valid offer is LTR, read-only, and confirms", async ({ page }) => {
    await mockPublicRenewal(page, { ...OFFER, payment: { providerAvailable: true } });
    await page.goto("/en/renew/fixture-token-aaaa");
    await expect(page.locator("html")).toHaveAttribute("dir", "ltr");
    await expect(page.getByTestId("public-renewal")).toBeVisible({ timeout: 20_000 });
    await expect(page.getByTestId("current-rental")).toBeVisible();
    await expect(page.getByTestId("renewal-offer")).toBeVisible();
    await expect(page.getByRole("spinbutton")).toHaveCount(0);
    await expect(page.locator("input")).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Confirm Rental Extension" })).toBeVisible();
    await page.getByTestId("renewal-confirm").click();
    await expect(page.getByTestId("renewal-payment-step")).toBeVisible();
    await expect(page.getByTestId("renewal-pay")).toBeVisible();
    await page.screenshot({ path: `${SHOTS}/en-public-renewal-awaiting-payment.png` });
  });

  test("English Stripe unconfigured shows honest unavailable state", async ({ page }) => {
    await mockPublicRenewal(page, { ...OFFER, payment: { providerAvailable: false } });
    await page.goto("/en/renew/fixture-token-aaaa");
    await expect(page.getByTestId("public-renewal")).toBeVisible({ timeout: 20_000 });
    await page.getByTestId("renewal-confirm").click();
    await expect(page.getByTestId("renewal-payment-unavailable")).toBeVisible();
    await expect(page.getByTestId("renewal-success")).toHaveCount(0);
  });

  test("Arabic valid offer is RTL with required labels", async ({ page }) => {
    await mockPublicRenewal(page, OFFER);
    await page.goto("/ar/renew/fixture-token-aaaa");
    await expect(page.locator("html")).toHaveAttribute("dir", "rtl");
    await expect(page.getByTestId("public-renewal")).toBeVisible({ timeout: 20_000 });
    await expect(page.getByRole("heading", { name: "تمديد الإيجار" })).toBeVisible();
    await expect(page.getByRole("button", { name: "تأكيد تمديد الإيجار" })).toBeVisible();
    await page.screenshot({ path: `${SHOTS}/ar-public-renewal.png` });
  });

  test("English expired token is branded", async ({ page }) => {
    await mockPublicRenewal(page, {}, 401);
    await page.goto("/en/renew/expired-token-aaaa");
    await expect(page.getByTestId("renewal-link-error")).toBeVisible({ timeout: 20_000 });
    await expect(page.getByRole("heading")).toHaveText("This renewal link has expired");
    await page.screenshot({ path: `${SHOTS}/en-public-renewal-expired.png` });
  });

  test("Arabic expired token is branded", async ({ page }) => {
    await mockPublicRenewal(page, {}, 401);
    await page.goto("/ar/renew/expired-token-aaaa");
    await expect(page.locator("html")).toHaveAttribute("dir", "rtl");
    await expect(page.getByTestId("renewal-link-error")).toBeVisible({ timeout: 20_000 });
    await expect(page.getByRole("heading")).toHaveText("انتهت صلاحية رابط التمديد");
    await page.screenshot({ path: `${SHOTS}/ar-public-renewal-expired.png` });
  });

  test("mobile 390px public renewal does not overflow", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await mockPublicRenewal(page, OFFER);
    await page.goto("/ar/renew/fixture-token-aaaa");
    await expect(page.getByTestId("public-renewal")).toBeVisible({ timeout: 20_000 });
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow).toBeLessThanOrEqual(1);
    await page.screenshot({ path: `${SHOTS}/ar-public-renewal-mobile-390.png` });
  });
});

test.describe("Staff renewal", () => {
  test("ACTIVE drawer shows Renew and history", async ({ page }) => {
    await login(page, "en");
    await mockDetail(page, {
      status: "ACTIVE",
      actions: {
        canGenerateRentalLink: false,
        canConfirmPayment: false,
        canCarOut: false,
        canGenerateReturnLink: true,
        canCarIn: false,
        canReconcile: false,
        canClose: false,
        canRenew: true,
      },
      renewals: [
        {
          id: "ren-1",
          additionalDays: 4,
          additionalAmount: 700,
          previousEndAt: "2026-09-04T08:00:00.000Z",
          newEndAt: "2026-09-08T08:00:00.000Z",
          createdAt: "2026-09-03T08:00:00.000Z",
          approvedAt: "2026-09-03T08:05:00.000Z",
        },
      ],
    });
    await openFirstRow(page);
    await expect(page.getByTestId("shared-drawer").getByRole("button", { name: /^Renew$/ })).toBeVisible();
    await expect(page.getByTestId("renewal-history")).toBeVisible();
    await page.screenshot({ path: `${SHOTS}/en-staff-renewal-history.png` });
  });
});
