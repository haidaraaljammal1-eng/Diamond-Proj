/**
 * Sidebar / URL guards under RBAC V2 — requires seeded employee credentials:
 * PLAYWRIGHT_RBAC_V2_LIMITED_EMAIL / PLAYWRIGHT_RBAC_V2_LIMITED_PASSWORD
 */
import { test, expect, type Page } from "@playwright/test";
import {
  RBAC_V2_E2E_ENABLED,
  loginStaff,
  loginStaffWithCredentials,
} from "./helpers/rbac-v2";

async function loginLimitedEmployee(
  page: Page,
  locale: "ar" | "en",
  email: string,
  password: string,
) {
  await loginStaffWithCredentials(page, locale, email, password);
}

test.describe.configure({ timeout: 120_000 });

test.describe("RBAC V2 limited employee navigation", () => {
  test.skip(!RBAC_V2_E2E_ENABLED, "PLAYWRIGHT_RBAC_V2_E2E=true required");

  const limitedEmail = process.env.PLAYWRIGHT_RBAC_V2_LIMITED_EMAIL;
  const limitedPassword = process.env.PLAYWRIGHT_RBAC_V2_LIMITED_PASSWORD;

  test.skip(
    !limitedEmail || !limitedPassword,
    "Set PLAYWRIGHT_RBAC_V2_LIMITED_EMAIL/PASSWORD for limited-role sidebar tests",
  );

  for (const locale of ["ar", "en"] as const) {
    test(`parent-only vehicles: sidebar + URL guard (${locale})`, async ({ page }) => {
      await loginLimitedEmployee(page, locale, limitedEmail!, limitedPassword!);

      await page.goto(`/${locale}/vehicles`);
      await expect(page.getByTestId("vehicles-screen")).toBeVisible({ timeout: 20_000 });

      await page.goto(`/${locale}/roles`);
      const denied = page.locator(
        '[data-testid="roles-denied"], [role="status"]',
      ).filter({ hasText: /access|صلاحية|denied|غير مسموح/i });
      await expect(denied.first()).toBeVisible({ timeout: 15_000 });
    });
  }
});

test.describe("RBAC V2 system admin navigation", () => {
  test.skip(!RBAC_V2_E2E_ENABLED, "PLAYWRIGHT_RBAC_V2_E2E=true required");

  test("admin sees roles in navigation (en)", async ({ page }) => {
    await loginStaff(page, "en");
    await page.goto("/en/dashboard");
    const rolesLink = page.getByRole("link", { name: /roles|الأدوار/i });
    await expect(rolesLink).toBeVisible({ timeout: 15_000 });
  });
});
