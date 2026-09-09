import { test, expect, type Page } from "@playwright/test";

/**
 * Read-only TARS integration status in the Contract Drawer.
 *
 * The real backend is unconfigured, so the live assertions cover the
 * "Not Connected / all Not Started" screen. SUCCEEDED / PROCESSING / FAILED are
 * rendered from an intercepted projection response — a UI fixture only. No
 * runtime TARS success is ever fabricated.
 */

test.use({ channel: "chrome" });

const email = process.env.PLAYWRIGHT_LOGIN_EMAIL ?? "admin@diamond.test";
const password = process.env.PLAYWRIGHT_LOGIN_PASSWORD ?? "Diamond123!";

const SHOTS = "e2e/__screens__/tars";

/**
 * The TARS section loads behind its own skeleton, so the first assertion on its
 * content waits out the projection request rather than the default 5s.
 */
const expectLoaded = expect.configure({ timeout: 60_000 });

async function login(page: Page, locale: "ar" | "en") {
  await page.goto(`/${locale}/login`);
  await page.locator("#email").fill(email);
  await page.locator("#password").fill(password);
  await page.getByRole("button", { name: /دخول|login|sign in/i }).click();
  await page.waitForURL((url) => !url.pathname.includes("/login"), { timeout: 30_000 });
}

/**
 * Waits for the desk to settle on a cold `next dev` server, where the first
 * compile of a route can outlast the default locator timeout.
 */
const DESK_TIMEOUT = 90_000;

/** Opens the first contract row, or skips when the desk is empty. */
async function openFirstContract(page: Page, locale: "ar" | "en") {
  await page.goto(`/${locale}/contracts`);
  const table = page.getByTestId("contracts-table");
  const empty = page.getByTestId("contracts-empty");
  await expect(table.or(empty)).toBeVisible({ timeout: DESK_TIMEOUT });
  if (!(await table.isVisible())) test.skip(true, "No contract in this environment");
  await page.locator("[data-testid=contracts-table] tbody tr").first().click();
  await expect(page.getByTestId("contract-detail")).toBeVisible({ timeout: DESK_TIMEOUT });
}

function mockTars(
  page: Page,
  body: {
    configured: boolean;
    externalContractId: string | null;
    lastSuccessfulSyncAt: string | null;
    operations: Record<string, string>;
  },
) {
  return page.route("**/contracts/*/tars", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ data: { tars: body } }),
    }),
  );
}

const ALL = (status: string) => ({
  registerContract: status,
  contractAcceptance: status,
  handover: status,
  returnDocumentation: status,
  completeContract: status,
});

test.describe("TARS integration status — live unconfigured backend", () => {
  test("Arabic drawer shows RTL TARS section, Not Connected, five Not Started", async ({
    page,
  }) => {
    await login(page, "ar");
    await openFirstContract(page, "ar");

    const tars = page.getByTestId("contract-tars");
    await expect(tars).toBeVisible();
    await expect(tars.getByText("حالة الربط مع TARS")).toBeVisible();
    await expectLoaded(tars.getByText("غير متصل حالياً")).toBeVisible();
    await expect(
      tars.getByText("سيتم تفعيل المزامنة عند ربط واجهة TARS الرسمية."),
    ).toBeVisible();

    for (const label of [
      "تسجيل العقد",
      "اعتماد العقد / التوقيع",
      "تسليم المركبة",
      "توثيق إعادة المركبة",
      "إكمال العقد",
    ])
      await expect(tars.getByText(label, { exact: true })).toBeVisible();

    await expect(tars.getByText("لم يبدأ", { exact: true })).toHaveCount(5);

    // Status display only — no execution surface anywhere in the section.
    await expect(tars.getByRole("button")).toHaveCount(0);
    await expect(page.getByTestId("contract-timeline")).toBeVisible();

    await tars.screenshot({ path: `${SHOTS}/ar-not-connected.png` });
    await page.screenshot({ path: `${SHOTS}/ar-drawer.png` });
  });

  test("English drawer shows LTR TARS section", async ({ page }) => {
    await login(page, "en");
    await openFirstContract(page, "en");

    const tars = page.getByTestId("contract-tars");
    await expect(tars.getByText("TARS Integration Status")).toBeVisible();
    await expectLoaded(tars.getByText("Not Connected")).toBeVisible();
    for (const label of [
      "Contract Registration",
      "Contract Acceptance",
      "Vehicle Handover",
      "Vehicle Return",
      "Contract Completion",
    ])
      await expect(tars.getByText(label, { exact: true })).toBeVisible();
    await expect(tars.getByText("Not Started", { exact: true })).toHaveCount(5);
    await expect(tars.getByRole("button")).toHaveCount(0);

    await tars.screenshot({ path: `${SHOTS}/en-not-connected.png` });
    await page.screenshot({ path: `${SHOTS}/en-drawer.png` });
  });

  test("mobile 390px keeps the section readable without horizontal overflow", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await login(page, "ar");
    await openFirstContract(page, "ar");

    const tars = page.getByTestId("contract-tars");
    await expect(tars).toBeVisible();
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow).toBeLessThanOrEqual(1);

    await tars.scrollIntoViewIfNeeded();
    await tars.screenshot({ path: `${SHOTS}/ar-mobile-390-section.png` });
    await page.screenshot({ path: `${SHOTS}/ar-mobile-390.png` });
  });
});

test.describe("TARS workflow indicators", () => {
  /**
   * The dev database only holds early-lifecycle contracts, so the Car-Out,
   * Car-In and Close surfaces are reached with a fixture detail response. UI
   * verification only — nothing here is written and no TARS call is made.
   */
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

  const NO_ACTIONS = {
    canGenerateRentalLink: false,
    canConfirmPayment: false,
    canCarOut: false,
    canGenerateReturnLink: false,
    canReconcile: false,
    canClose: false,
    canRenew: false,
  };

  /**
   * The drawer that launched the dialog stays open and sits above it — existing
   * app behaviour. Dismiss it so the dialog can be captured unobstructed.
   */
  async function dismissDrawer(page: Page) {
    await page
      .getByTestId("shared-drawer")
      .getByRole("button", { name: /^Close$/ })
      .click();
    await expect(page.getByTestId("shared-drawer")).toBeHidden();
    await page.waitForTimeout(500);
  }

  async function openFirstRow(page: Page) {
    await page.goto("/en/contracts");
    const table = page.getByTestId("contracts-table");
    await expect(table).toBeVisible({ timeout: DESK_TIMEOUT });
    await page.locator("[data-testid=contracts-table] tbody tr").first().click();
    await expect(page.getByTestId("contract-detail")).toBeVisible({ timeout: DESK_TIMEOUT });
  }

  test("Car-Out dialog shows the read-only handover state and no TARS action", async ({
    page,
  }) => {
    await login(page, "en");
    await mockTars(page, {
      configured: true,
      externalContractId: "TARS-2026-000411",
      lastSuccessfulSyncAt: null,
      operations: { ...ALL("SUCCEEDED"), handover: "PENDING" },
    });
    await mockDetail(page, {
      status: "PAID",
      actions: { ...NO_ACTIONS, canCarOut: true },
    });
    await openFirstRow(page);

    await page.getByTestId("shared-drawer").getByRole("button", { name: /^Car-Out$/ }).click();
    const dialog = page.getByRole("dialog", { name: /Car-Out — handover/ });
    await expect(dialog).toBeVisible();
    await expectLoaded(dialog.getByText("TARS Handover")).toBeVisible();
    await expect(dialog.getByText("Pending", { exact: true })).toBeVisible();
    // The handover form is untouched: its only submit is the Diamond action.
    await expect(dialog.getByRole("button", { name: /Confirm Car-Out/i })).toBeVisible();

    await dismissDrawer(page);
    await dialog.screenshot({ path: `${SHOTS}/en-car-out-inline.png` });
  });

  test("Close dialog shows the read-only completion state", async ({ page }) => {
    await login(page, "en");
    await mockTars(page, {
      configured: true,
      externalContractId: null,
      lastSuccessfulSyncAt: null,
      operations: { ...ALL("SUCCEEDED"), completeContract: "NOT_STARTED" },
    });
    await mockDetail(page, {
      status: "REVIEW",
      actions: { ...NO_ACTIONS, canClose: true },
    });
    await openFirstRow(page);

    await page
      .getByTestId("shared-drawer")
      .getByRole("button", { name: /^Close contract$/ })
      .click();
    const dialog = page.getByRole("dialog", { name: /Close contract\?/ });
    await expect(dialog).toBeVisible();
    await expectLoaded(dialog.getByText("TARS Completion")).toBeVisible();
    await expect(dialog.getByText("Not Started", { exact: true })).toBeVisible();
    await expect(dialog.getByRole("button", { name: /^Close contract$/ })).toBeEnabled();

    await dismissDrawer(page);
    await dialog.screenshot({ path: `${SHOTS}/en-close-inline.png` });
  });

  test("Car-In record in the drawer shows the read-only return state", async ({ page }) => {
    await login(page, "en");
    await mockTars(page, {
      configured: true,
      externalContractId: null,
      lastSuccessfulSyncAt: null,
      operations: { ...ALL("NOT_STARTED"), returnDocumentation: "SUCCEEDED" },
    });
    await mockDetail(page, {
      status: "REVIEW",
      actions: NO_ACTIONS,
      carIn: {
        id: "fixture-car-in",
        occurredAt: "2026-09-09T08:00:00.000Z",
        mileageIn: 41250,
        fuelIn: "3/4",
        notes: null,
        photos: [],
      },
    });
    await openFirstRow(page);

    const carInSection = page
      .getByTestId("contract-detail")
      .locator("section")
      .filter({ hasText: "Car-In" })
      .first();
    await expectLoaded(carInSection.getByText("TARS Return")).toBeVisible();
    await expect(carInSection.getByText("Synced", { exact: true })).toBeVisible();

    await carInSection.screenshot({ path: `${SHOTS}/en-car-in-inline.png` });
  });
});

test.describe("TARS integration status — mocked projection states", () => {
  test("connected contract renders reference, last sync and mixed states", async ({
    page,
  }) => {
    await login(page, "en");
    await mockTars(page, {
      configured: true,
      externalContractId: "TARS-2026-000411",
      lastSuccessfulSyncAt: "2026-09-09T09:30:00.000Z",
      operations: {
        registerContract: "SUCCEEDED",
        contractAcceptance: "SUCCEEDED",
        handover: "PROCESSING",
        returnDocumentation: "PENDING",
        completeContract: "FAILED",
      },
    });
    await openFirstContract(page, "en");

    const tars = page.getByTestId("contract-tars");
    await expectLoaded(tars.getByText("Connected")).toBeVisible();
    await expect(tars.getByText("TARS-2026-000411")).toBeVisible();
    await expect(tars.getByText("Last Sync")).toBeVisible();
    await expect(tars.getByText("Synced", { exact: true })).toHaveCount(2);
    await expect(tars.getByText("Syncing", { exact: true })).toBeVisible();
    await expect(tars.getByText("Pending", { exact: true })).toBeVisible();
    await expect(tars.getByText("Sync Failed", { exact: true })).toBeVisible();
    await expect(tars.getByRole("button")).toHaveCount(0);

    await tars.screenshot({ path: `${SHOTS}/en-connected-mixed.png` });
  });

  test("Arabic connected contract keeps the reference readable in RTL", async ({
    page,
  }) => {
    await login(page, "ar");
    await mockTars(page, {
      configured: true,
      externalContractId: "TARS-2026-000411",
      lastSuccessfulSyncAt: "2026-09-09T09:30:00.000Z",
      operations: ALL("SUCCEEDED"),
    });
    await openFirstContract(page, "ar");

    const tars = page.getByTestId("contract-tars");
    await expectLoaded(tars.getByText("متصل", { exact: true })).toBeVisible();
    await expect(tars.getByText("تمت المزامنة", { exact: true })).toHaveCount(5);
    await expect(tars.getByText("TARS-2026-000411")).toBeVisible();

    await tars.screenshot({ path: `${SHOTS}/ar-connected-succeeded.png` });
  });

  test("a failed projection read stays inside the section", async ({ page }) => {
    await login(page, "en");
    await page.route("**/contracts/*/tars", (route) =>
      route.fulfill({
        status: 500,
        contentType: "application/json",
        body: JSON.stringify({
          error: { code: "INTERNAL_ERROR", message: "boom" },
        }),
      }),
    );
    await openFirstContract(page, "en");

    // The Contract Drawer keeps working.
    await expect(page.getByTestId("contract-detail")).toBeVisible();
    await expect(page.getByTestId("contract-timeline")).toBeVisible();
    await expectLoaded(
      page.getByTestId("contract-tars").getByText("Unable to load TARS integration status."),
    ).toBeVisible();

    await page.getByTestId("contract-tars").screenshot({
      path: `${SHOTS}/en-read-error.png`,
    });
  });
});
