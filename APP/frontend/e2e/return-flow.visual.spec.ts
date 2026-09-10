import { test, expect, type Page } from "@playwright/test";

/**
 * Return / Car-In / Reconciliation / Close visual checks.
 * Fixture detail overrides are UI-only — they do not write contracts.
 */
test.use({ channel: "chrome" });
test.describe.configure({ timeout: 120_000 });

const email = process.env.PLAYWRIGHT_LOGIN_EMAIL ?? "admin@diamond.test";
const password = process.env.PLAYWRIGHT_LOGIN_PASSWORD ?? "Diamond123!";
const DESK_TIMEOUT = 90_000;
const SHOTS = "e2e/__screens__/return-flow";

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

function mockTars(page: Page, operations: Record<string, string>) {
  return page.route("**/contracts/*/tars", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        data: {
          tars: {
            configured: true,
            externalContractId: null,
            lastSuccessfulSyncAt: null,
            operations,
          },
        },
      }),
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

const NO_ACTIONS = {
  canGenerateRentalLink: false,
  canConfirmPayment: false,
  canCarOut: false,
  canGenerateReturnLink: false,
  canCarIn: false,
  canReconcile: false,
  canClose: false,
  canRenew: false,
};

async function openFirstRow(page: Page) {
  await page.goto("/en/contracts");
  const table = page.getByTestId("contracts-table");
  const empty = page.getByTestId("contracts-empty");
  await expect(table.or(empty)).toBeVisible({ timeout: DESK_TIMEOUT });
  test.skip(!(await table.isVisible()), "No contracts on the desk to open");
  await page.locator("[data-testid=contracts-table] tbody tr").first().click();
  await expect(page.getByTestId("contract-detail")).toBeVisible({ timeout: DESK_TIMEOUT });
}

async function assertDialogAboveDrawer(page: Page) {
  const dialog = page.getByTestId("shared-dialog");
  const drawer = page.getByTestId("shared-drawer");
  await expect(dialog).toBeVisible();
  await expect(drawer).toBeVisible();
  const stacking = await page.evaluate(() => {
    const dialogEl = document.querySelector("[data-testid=shared-dialog]");
    const drawerEl = document.querySelector("[data-testid=shared-drawer]");
    if (!dialogEl || !drawerEl) return null;
    const dialogZ = Number(getComputedStyle(dialogEl).zIndex);
    const drawerZ = Number(getComputedStyle(drawerEl).zIndex);
    const dialogBox = dialogEl.getBoundingClientRect();
    return { dialogZ, drawerZ, dialogWidth: dialogBox.width, dialogHeight: dialogBox.height };
  });
  expect(stacking).not.toBeNull();
  expect(stacking!.dialogZ).toBeGreaterThan(stacking!.drawerZ);
  expect(stacking!.dialogWidth).toBeGreaterThan(0);
  expect(stacking!.dialogHeight).toBeGreaterThan(0);
}

test.describe("Public return page", () => {
  test("English invalid token is LTR and branded", async ({ page }) => {
    await page.goto("/en/return/not-a-real-token");
    await expect(page.locator("html")).toHaveAttribute("dir", "ltr");
    await expect(page.getByTestId("return-link-error")).toBeVisible({ timeout: 20_000 });
    await expect(page.getByRole("heading")).toContainText(/return link/i);
    await expect(page.getByRole("button", { name: /close contract/i })).toHaveCount(0);
    await page.screenshot({ path: `${SHOTS}/en-public-return-invalid.png` });
  });

  test("Arabic invalid token is RTL and branded", async ({ page }) => {
    await page.goto("/ar/return/not-a-real-token");
    await expect(page.locator("html")).toHaveAttribute("dir", "rtl");
    await expect(page.getByTestId("return-link-error")).toBeVisible({ timeout: 20_000 });
    await expect(page.getByRole("heading")).toContainText(/رابط الإرجاع/);
    await page.screenshot({ path: `${SHOTS}/ar-public-return-invalid.png` });
  });

  test("mobile 390px public return does not overflow", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/ar/return/not-a-real-token");
    await expect(page.getByTestId("return-link-error")).toBeVisible({ timeout: 20_000 });
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow).toBeLessThanOrEqual(1);
    await page.screenshot({ path: `${SHOTS}/ar-public-return-mobile-390.png` });
  });
});

test.describe("Staff return / Car-In / Close stacking", () => {
  test("ACTIVE drawer shows return link and hides Car-In", async ({ page }) => {
    await login(page, "en");
    await mockDetail(page, {
      status: "ACTIVE",
      actions: { ...NO_ACTIONS, canGenerateReturnLink: true, canRenew: true },
    });
    await openFirstRow(page);
    await expect(page.getByTestId("contract-detail").getByText("Active", { exact: true }).first()).toBeVisible();
    await expect(
      page.getByTestId("shared-drawer").getByRole("button", { name: /^Generate return link$/ }),
    ).toBeVisible();
    await expect(page.getByTestId("shared-drawer").getByRole("button", { name: /^Car-In$/ })).toHaveCount(0);
    await page.screenshot({ path: `${SHOTS}/en-active-return-link.png` });
  });

  test("CLOSED drawer is read-only", async ({ page }) => {
    await login(page, "en");
    await mockDetail(page, {
      status: "CLOSED",
      actions: NO_ACTIONS,
    });
    await openFirstRow(page);
    await expect(page.getByTestId("contract-detail").getByText("Closed", { exact: true }).first()).toBeVisible();
    await expect(page.getByTestId("shared-drawer").getByRole("button", { name: /^Car-In$/ })).toHaveCount(0);
    await expect(page.getByTestId("shared-drawer").getByRole("button", { name: /^Close contract$/ })).toHaveCount(0);
    await page.screenshot({ path: `${SHOTS}/en-closed-readonly.png` });
  });

  test("Car-In dialog stacks above the drawer with TARS Return only", async ({ page }) => {
    await login(page, "en");
    await mockTars(page, { ...ALL("NOT_STARTED"), returnDocumentation: "PENDING" });
    await mockDetail(page, {
      status: "RETOUT",
      actions: { ...NO_ACTIONS, canCarIn: true },
    });
    await openFirstRow(page);
    await page.getByTestId("shared-drawer").getByRole("button", { name: /^Car-In$/ }).click();
    const dialog = page.getByRole("dialog", { name: /Car-In/ });
    await expect(dialog).toBeVisible();
    await assertDialogAboveDrawer(page);
    await expect(dialog.getByText("TARS Return")).toBeVisible({ timeout: 60_000 });
    await expect(dialog.getByRole("button", { name: /retry|sync now|submit return/i })).toHaveCount(0);
    await expect(dialog.getByText(/Add photo/i).first()).toBeVisible();
    await page.screenshot({ path: `${SHOTS}/en-car-in-above-drawer.png` });
  });

  test("Close dialog stacks above the drawer with TARS Completion only", async ({ page }) => {
    await login(page, "en");
    await mockTars(page, { ...ALL("SUCCEEDED"), completeContract: "NOT_STARTED" });
    await mockDetail(page, {
      status: "REVIEW",
      actions: { ...NO_ACTIONS, canClose: true },
    });
    await openFirstRow(page);
    await page.getByTestId("shared-drawer").getByRole("button", { name: /^Close contract$/ }).click();
    await expect(page.getByRole("dialog", { name: /Close contract\?/ })).toBeVisible();
    await assertDialogAboveDrawer(page);
    await expect(page.getByText("TARS Completion")).toBeVisible({ timeout: 60_000 });
    await expect(page.getByRole("button", { name: /retry|sync now/i })).toHaveCount(0);
    await page.screenshot({ path: `${SHOTS}/en-close-above-drawer.png` });
  });

  test("Car-Out dialog stacks above the drawer", async ({ page }) => {
    await login(page, "en");
    await mockDetail(page, {
      status: "PAID",
      actions: { ...NO_ACTIONS, canCarOut: true },
    });
    await openFirstRow(page);
    await page.getByTestId("shared-drawer").getByRole("button", { name: /^Car-Out$/ }).click();
    await expect(page.getByRole("dialog", { name: /Car-Out/ })).toBeVisible();
    await assertDialogAboveDrawer(page);
    await page.screenshot({ path: `${SHOTS}/en-car-out-above-drawer.png` });
  });

  test("Reconciliation shows empty Salik and Violation lines", async ({ page }) => {
    await login(page, "en");
    await mockDetail(page, {
      status: "REVIEW",
      actions: { ...NO_ACTIONS, canReconcile: true },
      carOut: { mileageOut: 1000, fuelOut: "F", photos: [] },
      carIn: { mileageIn: 1400, fuelIn: "1/2", photos: [] },
    });
    await openFirstRow(page);
    await page.getByTestId("shared-drawer").getByRole("button", { name: /^Reconciliation$/ }).click();
    const dialog = page.getByRole("dialog", { name: /Reconciliation/ });
    await expect(dialog).toBeVisible();
    await assertDialogAboveDrawer(page);
    await expect(page.getByTestId("reconcile-line-SALIK")).toBeVisible();
    await expect(page.getByTestId("reconcile-line-VIOLATION")).toBeVisible();
    await expect(dialog.getByText("Salik", { exact: true }).first()).toBeVisible();
    await expect(dialog.getByText("Violation", { exact: true }).first()).toBeVisible();
    await expect(dialog.getByText("Damage", { exact: true })).toBeVisible();
    await expect(dialog.getByText("Fuel", { exact: true })).toBeVisible();
    await expect(dialog.getByText("Late", { exact: true })).toBeVisible();
    await expect(dialog.getByText(/no live lookup/i).first()).toBeVisible();
    await page.screenshot({ path: `${SHOTS}/en-reconcile-salik-violation.png` });
  });

  test("Arabic desk RTL and Car-In label", async ({ page }) => {
    await login(page, "ar");
    await mockDetail(page, {
      status: "RETOUT",
      actions: { ...NO_ACTIONS, canCarIn: true },
    });
    await page.goto("/ar/contracts");
    await expect(page.locator("html")).toHaveAttribute("dir", "rtl");
    const table = page.getByTestId("contracts-table");
    const empty = page.getByTestId("contracts-empty");
    await expect(table.or(empty)).toBeVisible({ timeout: DESK_TIMEOUT });
    test.skip(!(await table.isVisible()), "No contracts on the desk to open");
    await page.locator("[data-testid=contracts-table] tbody tr").first().click();
    await expect(page.getByTestId("shared-drawer")).toBeVisible();
    await expect(page.getByRole("button", { name: /^استلام السيارة$/ })).toBeVisible();
    await page.screenshot({ path: `${SHOTS}/ar-car-in-action.png` });
  });

  test("Arabic reconciliation emphasizes Salik and Violation", async ({ page }) => {
    await login(page, "ar");
    await mockDetail(page, {
      status: "REVIEW",
      actions: { ...NO_ACTIONS, canReconcile: true },
      carOut: { mileageOut: 1000, fuelOut: "F", photos: [] },
      carIn: { mileageIn: 1400, fuelIn: "1/2", photos: [] },
    });
    await page.goto("/ar/contracts");
    await expect(page.locator("html")).toHaveAttribute("dir", "rtl");
    const table = page.getByTestId("contracts-table");
    const empty = page.getByTestId("contracts-empty");
    await expect(table.or(empty)).toBeVisible({ timeout: DESK_TIMEOUT });
    test.skip(!(await table.isVisible()), "No contracts on the desk to open");
    await page.locator("[data-testid=contracts-table] tbody tr").first().click();
    await page.getByTestId("shared-drawer").getByRole("button", { name: /^المطابقة$/ }).click();
    const dialog = page.getByRole("dialog", { name: /المطابقة/ });
    await expect(dialog).toBeVisible();
    await expect(page.getByTestId("reconcile-line-SALIK")).toBeVisible();
    await expect(page.getByTestId("reconcile-line-VIOLATION")).toBeVisible();
    await expect(dialog.getByText("سالك", { exact: true }).first()).toBeVisible();
    await expect(dialog.getByText("مخالفة", { exact: true }).first()).toBeVisible();
    await page.screenshot({ path: `${SHOTS}/ar-reconcile-salik-violation.png` });
  });

  test("mobile 390px Car-In dialog does not overflow", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await login(page, "en");
    await mockDetail(page, {
      status: "RETOUT",
      actions: { ...NO_ACTIONS, canCarIn: true },
    });
    await openFirstRow(page);
    await page.getByTestId("shared-drawer").getByRole("button", { name: /^Car-In$/ }).click();
    await expect(page.getByRole("dialog", { name: /Car-In/ })).toBeVisible();
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow).toBeLessThanOrEqual(1);
    await page.screenshot({ path: `${SHOTS}/en-car-in-mobile-390.png` });
  });
});

test.describe("Live desk states (non-mutating)", () => {
  test("ACTIVE filter English LTR", async ({ page }) => {
    await login(page, "en");
    await page.goto("/en/contracts");
    await expect(page.locator("html")).toHaveAttribute("dir", "ltr");
    await expect(page.getByTestId("contracts-table").or(page.getByTestId("contracts-empty"))).toBeVisible({
      timeout: DESK_TIMEOUT,
    });
    await page.getByRole("button", { name: /^Active$/ }).click();
    await expect(page.getByRole("button", { name: /^Active$/ })).toHaveAttribute("aria-pressed", "true");
    await page.screenshot({ path: `${SHOTS}/en-desk-active-filter.png` });
    const table = page.getByTestId("contracts-table");
    if (!(await table.isVisible())) return;
    await table.locator("tbody tr").first().click();
    await expect(page.getByTestId("contract-detail")).toBeVisible({ timeout: DESK_TIMEOUT });
    const returnLink = page.getByTestId("shared-drawer").getByRole("button", { name: /^Generate return link$/ });
    test.skip(!(await returnLink.isVisible()), "No ACTIVE return-link action on the first filtered row");
    await page.screenshot({ path: `${SHOTS}/en-live-active-drawer.png` });
  });

  test("CLOSED filter and vehicles Available English", async ({ page }) => {
    await login(page, "en");
    await page.goto("/en/contracts");
    await page.getByRole("button", { name: /^Closed$/ }).click();
    await expect(page.getByRole("button", { name: /^Closed$/ })).toHaveAttribute("aria-pressed", "true");
    await page.screenshot({ path: `${SHOTS}/en-desk-closed-filter.png` });
    await page.goto("/en/vehicles");
    await expect(page.getByText("Available").first()).toBeVisible({ timeout: DESK_TIMEOUT });
    await page.screenshot({ path: `${SHOTS}/en-vehicles-available.png` });
  });

  test("REVIEW after Car-In shows returned custody and GPS informational flag", async ({
    page,
  }) => {
    await login(page, "en");
    await mockDetail(page, {
      status: "REVIEW",
      carIn: {
        id: "car-in-fixture",
        occurredAt: "2026-09-10T11:00:00.000Z",
        mileageIn: 80,
        fuelIn: "1/2",
        notes: null,
        photos: [],
      },
      roadLiabilitySignals: {
        hasSalikGpsSignal: true,
        salikGpsSignalCount: 1,
        unconfirmedSalikGpsSignalCount: 1,
        latestSalikGpsSignalAt: "2026-09-10T10:31:00.000Z",
      },
      postCloseReceivables: { count: 0, openAmount: 0, items: [] },
    });
    await openFirstRow(page);
    await expect(page.getByTestId("contract-custody")).toContainText("Vehicle returned");
    await expect(page.getByTestId("contract-custody")).toContainText("Custody ended");
    await expect(page.getByTestId("contract-gps-salik-flag")).toContainText(
      "Possible Salik crossing detected by GPS",
    );
    await expect(page.getByTestId("shared-drawer")).not.toContainText("Waiting for Violation");
    await expect(page.getByTestId("shared-drawer")).not.toContainText("waiting for Salik");
    await page.screenshot({ path: `${SHOTS}/en-review-custody-gps-flag.png` });
  });

  test("CLOSED contract shows historical GPS flag and post-close charges", async ({ page }) => {
    await login(page, "en");
    await mockDetail(page, {
      status: "CLOSED",
      carIn: {
        id: "car-in-fixture",
        occurredAt: "2026-09-10T11:00:00.000Z",
        mileageIn: 80,
        fuelIn: "1/2",
        notes: null,
        photos: [],
      },
      roadLiabilitySignals: {
        hasSalikGpsSignal: true,
        salikGpsSignalCount: 1,
        unconfirmedSalikGpsSignalCount: 1,
        latestSalikGpsSignalAt: "2026-09-10T10:31:00.000Z",
      },
      postCloseReceivables: {
        count: 1,
        openAmount: 120,
        items: [
          {
            id: "pcr-1",
            amount: 120,
            currency: "AED",
            status: "OPEN",
            roadLiabilityType: "RTA_VIOLATION",
            createdAt: "2026-09-20T10:00:00.000Z",
          },
        ],
      },
    });
    await openFirstRow(page);
    await expect(page.getByTestId("contract-gps-salik-flag")).toContainText(
      "No official Salik charge confirmed yet",
    );
    await expect(page.getByTestId("contract-post-close")).toContainText("Post-Close Charges");
    await expect(page.getByTestId("contract-post-close")).toContainText("120 AED");
    await page.screenshot({ path: `${SHOTS}/en-closed-gps-post-close.png` });
  });

  test("Arabic desk RTL status filters", async ({ page }) => {
    await login(page, "ar");
    await page.goto("/ar/contracts");
    await expect(page.locator("html")).toHaveAttribute("dir", "rtl");
    await expect(page.getByTestId("contracts-table").or(page.getByTestId("contracts-empty"))).toBeVisible({
      timeout: DESK_TIMEOUT,
    });
    await page.screenshot({ path: `${SHOTS}/ar-desk-ltr-check.png` });
  });
});
