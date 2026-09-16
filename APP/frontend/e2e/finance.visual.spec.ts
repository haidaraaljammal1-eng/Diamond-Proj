import { test, expect, type Page } from "@playwright/test";

test.use({ channel: "chrome" });
test.describe.configure({ timeout: 180_000 });

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

function collectMissing(page: Page): string[] {
  const missing: string[] = [];
  page.on("console", (msg) => {
    const text = msg.text();
    if (text.includes("MISSING_MESSAGE") || text.includes("validation.validation.")) {
      missing.push(text);
    }
  });
  page.on("pageerror", (error) => {
    if (
      error.message.includes("MISSING_MESSAGE") ||
      error.message.includes("validation.validation.")
    ) {
      missing.push(error.message);
    }
  });
  return missing;
}

async function createExpenseViaUi(page: Page, description: string, amount = "80") {
  await page.getByTestId("finance-add-expense").click();
  await page.locator("#finance-expense-amount").fill(amount);
  await page.locator("#finance-expense-description").fill(description);
  await page.getByRole("button", { name: /حفظ المصروف|Save expense/ }).click();
  await expect(page.getByTestId("finance-notice")).toBeVisible({ timeout: 30_000 });
}

async function openExpenseFromLedger(page: Page, description: string) {
  const ledger = page.getByTestId("finance-ledger");
  await ledger.getByLabel(/^(الحركة|Movement)$/).click();
  await page.getByRole("option", { name: /^(مصروف|Expense)$/ }).click();
  const row = ledger.getByTestId("finance-ledger-row").filter({ hasText: description });
  await expect(row).toBeVisible({ timeout: 30_000 });
  await row.getByTestId("finance-view-expense").click();
  await expect(page.getByTestId("finance-expense-detail")).toBeVisible({ timeout: 30_000 });
}

test.describe("Finance V1", () => {
  test("Arabic desktop overview and KPI semantics", async ({ page }) => {
    const missing: string[] = [];
    page.on("console", (msg) => {
      const text = msg.text();
      if (text.includes("MISSING_MESSAGE")) missing.push(text);
    });
    page.on("pageerror", (error) => {
      if (error.message.includes("MISSING_MESSAGE")) missing.push(error.message);
    });

    await staffLogin(page);
    await page.goto("/ar/finance");
    await waitForFinanceReady(page);

    await expect(page.getByRole("heading", { name: "المالية", exact: true })).toBeVisible();
    await expect(page.getByTestId("finance-kpis").getByText("تم التحصيل", { exact: true })).toBeVisible();
    await expect(page.getByTestId("finance-kpis").getByText("مستحق التحصيل", { exact: true })).toBeVisible();
    await expect(page.getByTestId("finance-kpis").getByText("المصروفات", { exact: true })).toBeVisible();
    await expect(page.getByTestId("finance-kpis").getByText("صافي الحركة", { exact: true })).toBeVisible();
    await expect(page.getByText("Revenue")).toHaveCount(0);
    await expect(page.getByText("Profit")).toHaveCount(0);
    await expect(page.getByTestId("finance-open-receivables")).toBeVisible();
    await expect(page.getByTestId("finance-open-receivables").getByText("UNPAID", { exact: true })).toHaveCount(0);
    await expect(page.getByTestId("finance-open-receivables").getByText("PROCESSING", { exact: true })).toHaveCount(0);
    await expect(page.getByTestId("finance-analytics")).toBeVisible();
    await expect(page.getByTestId("finance-ledger")).toBeVisible();
    const sectionOrder = await page.getByTestId("finance-screen").evaluate((root) => {
      const ids = [
        "finance-kpis",
        "finance-ledger",
        "finance-analytics",
        "finance-open-receivables",
      ];
      return ids.map((id) => {
        const el = root.querySelector(`[data-testid="${id}"]`);
        if (!el) return -1;
        return [...root.querySelectorAll("[data-testid]")].indexOf(el);
      });
    });
    expect(sectionOrder.every((index) => index >= 0)).toBeTruthy();
    expect(sectionOrder[0]).toBeLessThan(sectionOrder[1]!);
    expect(sectionOrder[1]).toBeLessThan(sectionOrder[2]!);
    expect(sectionOrder[2]).toBeLessThan(sectionOrder[3]!);
    await expect(page.getByTestId("finance-add-expense")).toBeVisible();
    await expect(page.getByRole("button", { name: /Mark Paid|تحصيل نقدي/i })).toHaveCount(0);

    await page.getByTestId("finance-period-today").click();
    await page.getByTestId("finance-period-week").click();
    await page.getByTestId("finance-period-month").click();
    await page.getByTestId("finance-period-custom").click();
    await expect(page.getByText("الفترة الزمنية", { exact: true })).toBeVisible();
    await expect(page.getByText("حدد الفترة الزمنية", { exact: true })).toBeVisible();
    expect(missing).toEqual([]);

    await page.screenshot({
      path: "e2e/__screens__/finance/ar-desktop-1440.png",
      animations: "disabled",
      timeout: 15_000,
    });
    await page.setViewportSize({ width: 1366, height: 768 });
    await page.screenshot({
      path: "e2e/__screens__/finance/ar-desktop-1366.png",
      animations: "disabled",
      timeout: 15_000,
    });
  });

  test("period presets and English LTR", async ({ page }) => {
    const missing: string[] = [];
    page.on("console", (msg) => {
      const text = msg.text();
      if (text.includes("MISSING_MESSAGE")) missing.push(text);
    });
    page.on("pageerror", (error) => {
      if (error.message.includes("MISSING_MESSAGE")) missing.push(error.message);
    });

    await staffLogin(page);
    await page.goto("/en/finance");
    await waitForFinanceReady(page);

    await expect(page.getByRole("heading", { name: "Finance", exact: true })).toBeVisible();
    await expect(page.getByTestId("finance-kpis")).toBeVisible();
    await expect(page.getByTestId("finance-open-receivables")).toBeVisible();
    await expect(page.getByTestId("finance-open-receivables").getByText("UNPAID", { exact: true })).toHaveCount(0);
    await expect(page.getByTestId("finance-analytics")).toBeVisible();
    await expect(page.getByTestId("finance-ledger")).toBeVisible();

    await page.getByTestId("finance-period-today").click();
    await expect(page.getByTestId("finance-period-today")).toHaveClass(/segmentActive/);
    await page.getByTestId("finance-period-week").click();
    await page.getByTestId("finance-period-month").click();
    await page.getByTestId("finance-period-custom").click();
    await expect(page.getByText("Date range", { exact: true })).toBeVisible();
    await expect(page.getByText("Select date range", { exact: true })).toBeVisible();
    await page.getByRole("button", { name: "Date range" }).click();
    await expect(page.getByRole("button", { name: "Apply", exact: true })).toBeVisible();
    await page.getByRole("button", { name: "Clear", exact: true }).last().click();
    expect(missing).toEqual([]);
  });

  test("mobile layout", async ({ page }) => {
    await staffLogin(page);
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/ar/finance");
    await waitForFinanceReady(page);
    await page.screenshot({
      path: "e2e/__screens__/finance/ar-mobile-390.png",
      animations: "disabled",
      timeout: 15_000,
    });
  });

  test("Add Expense amount validation is localized", async ({ page }) => {
    const missing: string[] = [];
    page.on("console", (msg) => {
      if (msg.text().includes("MISSING_MESSAGE")) missing.push(msg.text());
    });
    page.on("pageerror", (error) => {
      if (error.message.includes("MISSING_MESSAGE")) missing.push(error.message);
    });

    await staffLogin(page);
    await page.goto("/ar/finance");
    await waitForFinanceReady(page);
    await page.getByTestId("finance-add-expense").click();
    await expect(page.getByRole("heading", { name: "إضافة مصروف" })).toBeVisible();

    await page.getByRole("button", { name: "حفظ المصروف" }).click();
    await expect(page.getByRole("alert").filter({ hasText: "هذا الحقل مطلوب" }).first()).toBeVisible();

    await page.locator("#finance-expense-amount").fill("0");
    await page.locator("#finance-expense-description").fill("تنظيف");
    await page.getByRole("button", { name: "حفظ المصروف" }).click();
    await expect(page.getByText("يجب أن يكون المبلغ أكبر من صفر.")).toBeVisible();

    await page.locator("#finance-expense-amount").fill("80.5");
    await page.getByRole("button", { name: "حفظ المصروف" }).click();
    await expect(page.getByText("يجب إدخال المبلغ كرقم صحيح بالدرهم.")).toBeVisible();

    await page.locator("#finance-expense-amount").fill("80");
    await page.getByRole("button", { name: "حفظ المصروف" }).click();
    await expect(page.getByText("يجب إدخال المبلغ كرقم صحيح بالدرهم.")).toHaveCount(0);
    await expect(page.getByText("يجب أن يكون المبلغ أكبر من صفر.")).toHaveCount(0);
    await expect(page.getByText("هذا الحقل مطلوب")).toHaveCount(0);
    await page.getByRole("button", { name: "إلغاء" }).click();
    expect(missing).toEqual([]);

    await page.goto("/en/finance");
    await waitForFinanceReady(page);
    await page.getByTestId("finance-add-expense").click();
    await page.locator("#finance-expense-amount").fill("80.5");
    await page.locator("#finance-expense-description").fill("Wash");
    await page.getByRole("button", { name: "Save expense" }).click();
    await expect(page.getByText("Enter the amount as a whole AED value.")).toBeVisible();
    expect(missing).toEqual([]);
  });

  test("Correct and Void Expense validation is localized against a real expense", async ({
    page,
  }) => {
    test.setTimeout(180_000);
    const missing = collectMissing(page);
    const marker = `E2E-I18N-${Date.now()}`;

    await staffLogin(page);
    await page.goto("/ar/finance");
    await waitForFinanceReady(page);

    await createExpenseViaUi(page, marker);
    await openExpenseFromLedger(page, marker);

    await page.getByTestId("finance-correct-expense").click();
    await expect(page.getByRole("heading", { name: "تصحيح المصروف" })).toBeVisible();
    await expect(page.locator("#finance-correct-void-reason")).toHaveCount(0);
    await expect(page.getByTestId("shared-dialog").getByText("سبب الإلغاء")).toHaveCount(0);

    await page.getByTestId("shared-dialog").getByLabel("مسح الاختيار").click();
    await page.locator("#finance-correct-amount").fill("");
    await page.locator("#finance-correct-date").fill("");
    await page.locator("#finance-correct-description").fill("");
    await page.getByRole("button", { name: "حفظ التصحيح" }).click();
    await expect(page.getByRole("alert").filter({ hasText: "هذا الحقل مطلوب" }).first()).toBeVisible();
    await expect(page.getByText("validation.validation.")).toHaveCount(0);
    await expect(page.getByText("validation.required")).toHaveCount(0);

    await page.locator("#finance-correct-amount").fill("0");
    await page.getByRole("button", { name: "حفظ التصحيح" }).click();
    await expect(page.getByText("يجب أن يكون المبلغ أكبر من صفر.")).toBeVisible();

    await page.locator("#finance-correct-amount").fill("-5");
    await page.getByRole("button", { name: "حفظ التصحيح" }).click();
    await expect(page.getByText("يجب إدخال المبلغ كرقم صحيح بالدرهم.")).toBeVisible();

    await page.locator("#finance-correct-amount").fill("80.5");
    await page.getByRole("button", { name: "حفظ التصحيح" }).click();
    await expect(page.getByText("يجب إدخال المبلغ كرقم صحيح بالدرهم.")).toBeVisible();

    await page.locator("#finance-correct-description").fill("x".repeat(501));
    await page.getByRole("button", { name: "حفظ التصحيح" }).click();
    await expect(page.getByText("القيمة أطول من المسموح")).toBeVisible();

    await page.locator("#finance-correct-amount").fill("81");
    await page.locator("#finance-correct-date").fill("2026-09-11T10:00");
    await page.locator("#finance-correct-description").fill(`${marker}-corrected`);
    await page.getByTestId("shared-dialog").getByLabel("الفئة").click();
    await page.getByRole("option", { name: "تنظيف المركبة" }).click();
    await page.getByRole("button", { name: "حفظ التصحيح" }).click();
    await expect(page.getByRole("heading", { name: "تصحيح المصروف" })).toHaveCount(0, {
      timeout: 30_000,
    });
    await expect(page.getByTestId("finance-expense-detail").getByText(`${marker}-corrected`)).toBeVisible();

    await page.getByTestId("finance-void-expense").click();
    await expect(page.getByRole("heading", { name: "إلغاء المصروف" })).toBeVisible();
    const voidDialog = page.getByTestId("shared-dialog");
    await voidDialog.getByRole("button", { name: "إلغاء المصروف" }).click();
    await expect(page.getByRole("alert").filter({ hasText: "هذا الحقل مطلوب" })).toBeVisible();
    await expect(page.getByText("validation.validation.")).toHaveCount(0);

    await page.locator("#finance-void-reason").fill("x".repeat(501));
    await voidDialog.getByRole("button", { name: "إلغاء المصروف" }).click();
    await expect(page.getByText("القيمة أطول من المسموح")).toBeVisible();

    await page.locator("#finance-void-reason").fill("إلغاء اختبار");
    await voidDialog.getByRole("button", { name: "إلغاء المصروف" }).click();
    await expect(page.getByRole("heading", { name: "إلغاء المصروف" })).toHaveCount(0, {
      timeout: 30_000,
    });
    await expect(page.getByTestId("finance-expense-detail").getByText("ملغى")).toBeVisible();
    expect(missing).toEqual([]);

    const enMarker = `${marker}-en`;
    await page.goto("/en/finance");
    await waitForFinanceReady(page);
    await createExpenseViaUi(page, enMarker);
    await openExpenseFromLedger(page, enMarker);
    await page.getByTestId("finance-correct-expense").click();
    await expect(page.getByRole("heading", { name: "Correct Expense" })).toBeVisible();
    await expect(page.locator("#finance-correct-void-reason")).toHaveCount(0);
    await expect(page.getByTestId("shared-dialog").getByText("Void reason")).toHaveCount(0);
    await expect(page.getByTestId("shared-dialog").getByText("Cancellation Reason")).toHaveCount(0);
    await page.getByRole("button", { name: "Cancel" }).click();
    expect(missing).toEqual([]);
  });

  test("voided expense is Voided with struck-through amount and Correct has no void reason", async ({
    page,
  }) => {
    test.setTimeout(180_000);
    const marker = `E2E-VOID-${Date.now()}`;
    await staffLogin(page);
    await page.goto("/ar/finance");
    await waitForFinanceReady(page);

    await createExpenseViaUi(page, marker, "100");
    const ledger = page.getByTestId("finance-ledger");
    await ledger.getByLabel("الحركة").click();
    await page.getByRole("option", { name: "مصروف", exact: true }).click();
    const activeRow = ledger.getByTestId("finance-ledger-row").filter({ hasText: marker });
    await expect(activeRow).toBeVisible({ timeout: 30_000 });
    await expect(activeRow).toHaveAttribute("data-movement", "EXPENSE");
    await expect(activeRow.getByTestId("finance-ledger-source")).toHaveText("مصروف يدوي");
    await expect(activeRow.getByTestId("finance-ledger-amount")).toContainText("- AED 100");
    await activeRow.getByTestId("finance-view-expense").click();
    await expect(page.getByTestId("finance-expense-detail")).toBeVisible();

    await page.getByTestId("finance-void-expense").click();
    await expect(page.getByRole("heading", { name: "إلغاء المصروف" })).toBeVisible();
    await expect(page.locator("#finance-void-reason")).toBeVisible();
    await page.locator("#finance-void-reason").fill("إلغاء اختبار عرض");
    await page.getByTestId("shared-dialog").getByRole("button", { name: "إلغاء المصروف" }).click();
    await expect(page.getByRole("heading", { name: "إلغاء المصروف" })).toHaveCount(0, {
      timeout: 30_000,
    });
    await expect(page.getByTestId("finance-expense-detail").getByText("ملغى")).toBeVisible();
    await page.getByTestId("shared-drawer").getByRole("button", { name: "إغلاق" }).click();

    await page.getByTestId("finance-ledger-clear").click();
    await ledger.getByLabel("الحركة").click();
    await page.getByRole("option", { name: "مصروف", exact: true }).click();
    await expect(ledger.getByTestId("finance-ledger-row").filter({ hasText: marker })).toHaveCount(0);

    await page.getByTestId("finance-ledger-clear").click();
    await ledger.getByLabel("الحركة").click();
    await page.getByRole("option", { name: "ملغى", exact: true }).click();
    const voidedRow = ledger
      .locator('[data-testid="finance-ledger-row"][data-movement="VOIDED"]')
      .filter({ hasText: marker });
    await expect(voidedRow).toBeVisible({ timeout: 30_000 });
    await expect(voidedRow).toHaveAttribute("data-movement", "VOIDED");
    await expect(voidedRow.getByTestId("finance-ledger-source")).toHaveText("مصروف يدوي");
    await expect(voidedRow.getByTestId("finance-ledger-amount")).toHaveText("AED 100");
    await expect(voidedRow.getByTestId("finance-ledger-amount")).not.toContainText("+ AED");
    await expect(
      ledger.locator('[data-testid="finance-ledger-row"][data-movement="EXPENSE_REVERSAL"]').filter({
        hasText: marker,
      }),
    ).toHaveCount(0);

    const correctMarker = `${marker}-fix`;
    await createExpenseViaUi(page, correctMarker, "100");
    await openExpenseFromLedger(page, correctMarker);
    await page.getByTestId("finance-correct-expense").click();
    await expect(page.getByRole("heading", { name: "تصحيح المصروف" })).toBeVisible();
    await expect(page.locator("#finance-correct-void-reason")).toHaveCount(0);
    await expect(page.getByTestId("shared-dialog").getByText("سبب الإلغاء")).toHaveCount(0);
    await page.locator("#finance-correct-amount").fill("80");
    await page.getByRole("button", { name: "حفظ التصحيح" }).click();
    await expect(page.getByRole("heading", { name: "تصحيح المصروف" })).toHaveCount(0, {
      timeout: 30_000,
    });
    await expect(page.getByTestId("finance-expense-detail").getByText("AED 80")).toBeVisible();
    await expect(page.getByTestId("finance-expense-detail").getByText("مصروف مصحح")).toBeVisible();

    await page.getByTestId("finance-void-expense").click();
    await expect(page.locator("#finance-void-reason")).toBeVisible();
    await page.getByTestId("shared-dialog").getByRole("button", { name: "إلغاء", exact: true }).click();
  });
});
