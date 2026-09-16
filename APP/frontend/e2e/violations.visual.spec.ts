import { test, expect, type Page } from "@playwright/test";

test.use({ channel: "chrome" });
test.describe.configure({ timeout: 90_000 });

const email = process.env.PLAYWRIGHT_LOGIN_EMAIL ?? "admin@diamond.test";
const password = process.env.PLAYWRIGHT_LOGIN_PASSWORD ?? "Diamond123!";

async function staffLogin(page: Page) {
  await page.goto("/ar/login");
  await page.locator("#email").fill(email);
  await page.locator("#password").fill(password);
  await page.getByRole("button", { name: /دخول|login|sign in/i }).click();
  await page.waitForURL((url) => !url.pathname.includes("/login"), { timeout: 30_000 });
}

async function waitForViolationsReady(page: Page) {
  await expect(page.getByTestId("road-liabilities-screen")).toBeVisible({ timeout: 60_000 });
  await expect(page.getByTestId("road-liabilities-summary")).toBeVisible();
}

async function closeDrawer(page: Page) {
  const close = page.getByTestId("shared-drawer").getByRole("button", { name: /إغلاق|Close/i });
  if (await close.isVisible()) {
    await close.click();
    await expect(page.getByTestId("shared-drawer")).toHaveCount(0);
  }
}

test.describe("Violations & Salik Operations Center", () => {
  test("Arabic desktop empty backend state", async ({ page }) => {
    const writes: string[] = [];
    const detailGets: string[] = [];
    page.on("request", (request) => {
      const url = request.url();
      if (!url.includes("/road-liabilities")) return;
      if (request.method() !== "GET") writes.push(`${request.method()} ${url}`);
      if (/\/road-liabilities\/[^/?]+/.test(url) && !url.includes("/summary")) {
        detailGets.push(url);
      }
    });

    await staffLogin(page);
    await page.goto("/ar/violations");
    await waitForViolationsReady(page);
    await expect(page.getByRole("heading", { name: "المخالفات وسالك" })).toBeVisible();
    await expect(page.getByTestId("road-liabilities-empty")).toBeVisible();
    await expect(page.getByTestId("road-liabilities-queues")).toBeVisible();
    await expect(page.getByTestId("road-liabilities-queue-collectible")).toBeVisible();
    await expect(page.getByTestId("road-liabilities-advanced")).toBeVisible();
    await expect(page.getByTestId("road-liabilities-advanced-panel")).toHaveCount(0);
    await expect(page.getByTestId("road-liabilities-summary")).toContainText("المبلغ المستحق للتحصيل");
    await expect(page.getByTestId("road-liabilities-summary")).toContainText("بانتظار التأكيد");
    await expect(page.getByTestId("road-liabilities-summary")).toContainText("تحتاج مراجعة");
    await expect(page.getByTestId("road-liabilities-summary")).not.toContainText("غير مرتبطة");
    await expect(page.getByRole("button", { name: "إضافة" })).toHaveCount(0);
    await expect(page.getByTestId("road-liabilities-summary")).toContainText("AED 0");
    expect(detailGets).toEqual([]);
    expect(writes).toEqual([]);
    await page.screenshot({ path: "e2e/__screens__/violations/ar-desktop-1440.png" });

    await page.setViewportSize({ width: 1366, height: 768 });
    await page.screenshot({ path: "e2e/__screens__/violations/ar-desktop-1366.png" });
  });

  test("simulation overlay, drawer provenance, GPS link, reset", async ({ page }) => {
    const writes: string[] = [];
    const simulatedDetailGets: string[] = [];
    page.on("request", (request) => {
      const url = request.url();
      if (url.includes("/road-liabilities") && request.method() !== "GET") {
        writes.push(`${request.method()} ${url}`);
      }
      if (url.includes("/road-liabilities/sim-rl-")) {
        simulatedDetailGets.push(url);
      }
    });

    await staffLogin(page);
    await page.goto("/ar/violations");
    await waitForViolationsReady(page);

    const simulate = page.getByTestId("simulate-violations");
    await expect(simulate).toBeVisible();
    await simulate.click();
    await page.getByTestId("simulate-violations-run").click();
    await expect(page.getByTestId("simulation-badge")).toBeVisible();
    await expect(page.getByTestId("road-liability-row").first()).toBeVisible();
    await expect(page.getByTestId("road-liabilities-empty")).toHaveCount(0);
    await page.screenshot({ path: "e2e/__screens__/violations/ar-desktop-sim.png" });

    const pending = page.locator('[data-testid="road-liability-row"][data-prediction="true"]');
    await expect(pending.first()).toBeVisible();
    await expect(pending.first()).toContainText("بانتظار المبلغ الرسمي");
    await expect(pending.first()).toContainText("رُصد عبر GPS");
    await expect(pending.first()).toContainText("بانتظار تأكيد سالك");
    await expect(pending.first().getByTestId("road-liability-work-state")).toHaveCount(1);

    await page.getByTestId("road-liabilities-queue-collectible").click();
    await expect(page.locator('[data-testid="road-liability-row"][data-prediction="true"]')).toHaveCount(0);
    await expect(page.getByTestId("road-liability-row").first()).toBeVisible();
    await page.getByTestId("road-liabilities-queue-all").click();

    await page.locator('[data-testid="road-liability-row"][data-liability-id="sim-rl-gps-salik"]').click();
    await expect(page.getByTestId("shared-drawer")).toBeVisible();
    await expect(page.getByTestId("road-liability-detail")).toBeVisible();
    await expect(page.getByTestId("road-liability-provenance")).toBeVisible();
    await expect(page.getByTestId("road-liability-view-gps")).toBeVisible();
    await expect(page.getByTestId("road-liability-view-contract")).toBeVisible();
    await page.screenshot({ path: "e2e/__screens__/violations/ar-desktop-drawer.png" });

    await page.getByTestId("road-liability-view-gps").click();
    await page.waitForURL((url) => url.pathname.includes("/gps") && url.searchParams.get("vehicleId") === "900001");

    await page.goto("/ar/violations");
    await waitForViolationsReady(page);
    await page.getByTestId("simulate-violations").click();
    await page.getByTestId("simulate-violations-run").click();
    await page.locator('[data-testid="road-liability-row"][data-liability-id="sim-rl-rta-open"]').click();
    await expect(page.getByTestId("road-liability-detail")).toContainText("مخالفة RTA");
    await expect(page.getByTestId("road-liability-event-status")).toBeVisible();
    await expect(page.getByTestId("road-liability-detail")).not.toContainText("ACTIVE");
    await page.getByTestId("shared-drawer").getByRole("button", { name: "إغلاق" }).click();

    await page.getByTestId("simulation-reset").click();
    await expect(page.getByTestId("road-liabilities-empty")).toBeVisible();
    expect(writes).toEqual([]);
    expect(simulatedDetailGets).toEqual([]);
  });

  test("customer charge review in the liability drawer", async ({ page }) => {
    const chargeWrites: string[] = [];
    const reconCalls: string[] = [];
    page.on("request", (request) => {
      const url = request.url();
      if (url.includes("confirm-charge")) {
        chargeWrites.push(`${request.method()} ${url}`);
      }
      if (url.includes("/reconciliation/road-liabilities")) {
        reconCalls.push(`${request.method()} ${url}`);
      }
    });

    await staffLogin(page);
    await page.goto("/ar/violations");
    await waitForViolationsReady(page);
    await page.getByTestId("simulate-violations").click();
    await page.getByTestId("simulate-violations-run").click();
    await expect(page.getByTestId("road-liability-row").first()).toBeVisible();

    await page.locator('[data-testid="road-liability-row"][data-liability-id="sim-rl-gps-pending"]').click();
    await expect(page.getByTestId("road-liability-charge-section")).toBeVisible();
    await expect(page.getByTestId("road-liability-charge-review")).toHaveCount(0);
    await expect(page.getByTestId("road-liability-charge-section")).toContainText(
      "بانتظار التأكيد الرسمي قبل إضافة أي مبلغ على العميل",
    );
    await closeDrawer(page);

    await page.locator('[data-testid="road-liability-row"][data-liability-id="sim-rl-salik-unmatched"]').click();
    await expect(page.getByTestId("road-liability-detail")).toContainText("لم يتم العثور على عقد");
    await expect(page.getByTestId("road-liability-charge-review")).toHaveCount(0);
    await closeDrawer(page);

    await page.locator('[data-testid="road-liability-row"][data-liability-id="sim-rl-rta-ambiguous"]').click();
    await expect(page.getByTestId("road-liability-detail")).toContainText("تم العثور على أكثر من احتمال");
    await expect(page.getByTestId("road-liability-charge-review")).toHaveCount(0);
    await closeDrawer(page);

    await page.locator('[data-testid="road-liability-row"][data-liability-id="sim-rl-salik-violation"]').click();
    await expect(page.getByTestId("road-liability-charge-section")).toHaveAttribute("data-state", "attached");
    await expect(page.getByTestId("road-liability-charge-section")).toContainText("تمت إضافتها إلى التسوية");
    await expect(page.getByTestId("road-liability-charge-review")).toHaveCount(0);
    await closeDrawer(page);

    await page.locator('[data-testid="road-liability-row"][data-liability-id="sim-rl-rta-open"]').click();
    await expect(page.getByTestId("road-liability-charge-section")).toHaveAttribute("data-state", "available");
    await expect(page.getByTestId("road-liability-charge-review")).toBeVisible();
    await expect(page.getByTestId("road-liability-charge-official")).toContainText("AED 600");
    await page.screenshot({ path: "e2e/__screens__/violations/ar-desktop-charge-available.png" });

    await page.getByTestId("road-liability-charge-review").click();
    await expect(page.getByTestId("road-liability-charge-dialog")).toBeVisible();
    await expect(page.getByTestId("shared-dialog")).toContainText("تثبيت المبلغ على العميل");
    await expect(page.getByTestId("road-liability-charge-amount")).toHaveValue("600");
    await expect(page.getByTestId("road-liability-charge-additional")).toContainText("AED 0");
    await expect(page.getByTestId("road-liability-charge-reason")).toHaveCount(0);

    await page.getByTestId("road-liability-charge-amount").fill("500");
    await page.getByTestId("road-liability-charge-confirm").click();
    await expect(page.getByTestId("road-liability-charge-dialog")).toContainText(
      "لا يمكن أن يكون المبلغ على العميل أقل من المبلغ الرسمي",
    );

    await page.getByTestId("road-liability-charge-amount").fill("720");
    await expect(page.getByTestId("road-liability-charge-additional")).toContainText("AED 120");
    await page.getByTestId("road-liability-charge-confirm").click();
    await expect(page.getByTestId("road-liability-charge-dialog")).toContainText("سبب الزيادة مطلوب");
    await page.getByRole("button", { name: "رسوم إدارية" }).click();
    await page.screenshot({ path: "e2e/__screens__/violations/ar-desktop-charge-dialog.png" });
    await page.getByTestId("road-liability-charge-confirm").click();

    await expect(page.getByTestId("road-liability-charge-dialog")).toHaveCount(0);
    await expect(page.getByTestId("road-liability-charge-section")).toHaveAttribute("data-state", "attached");
    await expect(page.getByTestId("road-liability-charge-section")).toContainText("AED 600");
    await expect(page.getByTestId("road-liability-charge-section")).toContainText("AED 120");
    await expect(page.getByTestId("road-liability-charge-locked-customer")).toContainText("AED 720");
    await expect(page.getByTestId("road-liability-charge-review")).toHaveCount(0);
    await expect(
      page.locator('[data-testid="road-liability-row"][data-liability-id="sim-rl-rta-open"]'),
    ).toContainText("تمت إضافتها للتسوية");
    await page.screenshot({ path: "e2e/__screens__/violations/ar-desktop-charge-locked.png" });

    expect(chargeWrites).toEqual([]);
    expect(reconCalls).toEqual([]);

    await page.getByTestId("shared-drawer").getByRole("button", { name: "إغلاق" }).click();
    await page.getByTestId("simulation-reset").click();
    await page.getByTestId("simulate-violations").click();
    await page.getByTestId("simulate-violations-run").click();
    await page.locator('[data-testid="road-liability-row"][data-liability-id="sim-rl-rta-open"]').click();
    await expect(page.getByTestId("road-liability-charge-review")).toBeVisible();
    await expect(page.getByTestId("road-liability-charge-section")).toHaveAttribute("data-state", "available");
  });

  test("English LTR drawer and search", async ({ page }) => {
    await staffLogin(page);
    await page.goto("/en/violations");
    await expect(page.getByRole("heading", { name: "Violations & Salik" })).toBeVisible({
      timeout: 60_000,
    });
    await expect(page.getByTestId("road-liabilities-summary")).toContainText("Collectible Amount");
    await expect(page.getByTestId("road-liabilities-queue-needs_attention")).toBeVisible();
    await page.getByTestId("simulate-violations").click();
    await page.getByTestId("simulate-violations-run").click();
    await page.getByTestId("road-liabilities-search").fill("RTA-24891");
    await page.getByTestId("data-search-submit").click();
    await expect(page.getByTestId("road-liability-row")).toHaveCount(1);
    await page.getByTestId("road-liability-row").click();
    await expect(page.getByTestId("shared-drawer")).toBeVisible();
    await expect(page.getByTestId("road-liability-detail")).toContainText("RTA Violation");
    await expect(page.getByTestId("road-liability-charge-review")).toContainText("Review Customer Charge");
    await page.getByTestId("road-liability-charge-review").click();
    await expect(page.getByTestId("shared-dialog")).toContainText("Confirm Customer Charge");
    await expect(page.getByTestId("shared-dialog")).toContainText("Official Amount");
    await expect(page.getByTestId("shared-dialog")).toContainText("Customer Charge");
    await page.screenshot({ path: "e2e/__screens__/violations/en-desktop-drawer.png" });
  });

  test("mobile liability cards at 390 and 430", async ({ page }) => {
    await staffLogin(page);
    await page.goto("/ar/violations");
    await waitForViolationsReady(page);
    await page.getByTestId("simulate-violations").click();
    await page.getByTestId("simulate-violations-run").click();

    await page.setViewportSize({ width: 390, height: 844 });
    await expect(page.getByTestId("road-liability-card").first()).toBeVisible();
    await page.screenshot({ path: "e2e/__screens__/violations/ar-mobile-390.png", fullPage: true });

    await page.setViewportSize({ width: 430, height: 932 });
    await expect(page.getByTestId("road-liability-card").first()).toBeVisible();
    await page.screenshot({ path: "e2e/__screens__/violations/ar-mobile-430.png", fullPage: true });

    await page.getByTestId("road-liability-card").first().click();
    await expect(page.getByTestId("shared-drawer")).toBeVisible();
    await page.getByTestId("shared-drawer").getByRole("button", { name: "إغلاق" }).click();

    await page.locator('[data-testid="road-liability-card"][data-liability-id="sim-rl-rta-open"]').click();
    await page.getByTestId("road-liability-charge-review").click();
    await expect(page.getByTestId("road-liability-charge-dialog")).toBeVisible();
    await page.screenshot({ path: "e2e/__screens__/violations/ar-mobile-430-charge-dialog.png" });

    await page.setViewportSize({ width: 390, height: 844 });
    await expect(page.getByTestId("road-liability-charge-dialog")).toBeVisible();
    await page.screenshot({ path: "e2e/__screens__/violations/ar-mobile-390-charge-dialog.png" });
  });

  test("CLOSED late RTA uses the same Charge Review dialog for post-close", async ({ page }) => {
    await staffLogin(page);
    await page.goto("/en/violations");
    await expect(page.getByRole("heading", { name: "Violations & Salik" })).toBeVisible({
      timeout: 60_000,
    });
    await page.getByTestId("simulate-violations").click();
    await page.getByTestId("simulate-violations-run").click();
    await page.getByTestId("road-liabilities-search").fill("RTA-LATE-100");
    await page.getByTestId("data-search-submit").click();
    await expect(page.getByTestId("road-liability-row")).toHaveCount(1);
    await page.getByTestId("road-liability-row").click();
    await expect(page.getByTestId("road-liability-charge-review")).toBeVisible();
    await page.getByTestId("road-liability-charge-review").click();
    await expect(page.getByTestId("road-liability-charge-dialog")).toBeVisible();
    await expect(page.getByTestId("shared-dialog")).toContainText("Confirm Customer Charge");
    await expect(page.getByTestId("shared-dialog")).toContainText(
      "This contract is closed. A post-close receivable will be created without changing the original reconciliation.",
    );
    await page.screenshot({ path: "e2e/__screens__/violations/en-desktop-post-close-charge.png" });
  });
});
