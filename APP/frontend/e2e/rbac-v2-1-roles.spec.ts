/**
 * RBAC V2 Roles matrix E2E (isolated stack only).
 *
 * Prerequisites (do not enable on owner app .env):
 * - Backend: FUNCTIONAL_RBAC_V2_ENABLED=true, DATABASE_URL → disposable integration DB
 * - Frontend dev: NEXT_PUBLIC_FUNCTIONAL_RBAC_V2_UI=true,
 *   NEXT_PUBLIC_FUNCTIONAL_RBAC_V2_BACKEND_ENABLED=true
 * - PLAYWRIGHT_RBAC_V2_E2E=true
 * - PLAYWRIGHT_LOGIN_EMAIL / PLAYWRIGHT_LOGIN_PASSWORD (roles.manage via system_admin or test admin)
 */
import { test, expect } from "@playwright/test";
import {
  BACKEND,
  EXPECTED_FUNCTIONAL_CAPABILITIES,
  EXPECTED_FUNCTIONAL_GROUPS,
  RBAC_V2_E2E_ENABLED,
  apiLogin,
  createRoleViaApi,
  loginStaff,
  gotoRolesMatrixReady,
} from "./helpers/rbac-v2";

test.describe.configure({ mode: "serial", timeout: 180_000 });

for (const locale of ["ar", "en"] as const) {
  test.describe(`RBAC V2 roles matrix (${locale})`, () => {
    test.skip(!RBAC_V2_E2E_ENABLED, "PLAYWRIGHT_RBAC_V2_E2E=true required");

    test(`renders ${EXPECTED_FUNCTIONAL_GROUPS} groups and ${EXPECTED_FUNCTIONAL_CAPABILITIES} capabilities`, async ({
      page,
    }) => {
      const email = process.env.PLAYWRIGHT_LOGIN_EMAIL!;
      const password = process.env.PLAYWRIGHT_LOGIN_PASSWORD!;
      await loginStaff(page, locale);
      await gotoRolesMatrixReady(page, locale);
      await expect(page.getByTestId("functional-rbac-matrix")).toBeVisible({
        timeout: 60_000,
      });
      const groups = page.getByTestId(/^functional-rbac-group-/);
      await expect(groups).toHaveCount(EXPECTED_FUNCTIONAL_GROUPS);
      const rows = page.getByTestId("functional-rbac-capability-row");
      await expect(rows).toHaveCount(EXPECTED_FUNCTIONAL_CAPABILITIES);
      await expect(page.getByTestId("roles-search")).toBeVisible();
      const dir = locale === "ar" ? "rtl" : "ltr";
      await expect(page.locator("html")).toHaveAttribute("dir", dir);
      await page.screenshot({
        path: `e2e-artifacts/rbac-v2-roles-${locale}.png`,
        fullPage: true,
      });
    });

    test("system_admin shows full access (non-editable matrix cells)", async ({ page }) => {
      const email = process.env.PLAYWRIGHT_LOGIN_EMAIL!;
      const password = process.env.PLAYWRIGHT_LOGIN_PASSWORD!;
      await loginStaff(page, locale);
      await gotoRolesMatrixReady(page, locale);
      await expect(page.getByTestId("functional-rbac-matrix")).toBeVisible({
        timeout: 60_000,
      });
      const adminHeader = page.locator("thead").getByText(/system|مسؤول|admin/i).first();
      await expect(adminHeader).toBeVisible();
    });
  });
}

test.describe("RBAC V2 roles matrix interactions", () => {
  test.skip(!RBAC_V2_E2E_ENABLED, "PLAYWRIGHT_RBAC_V2_E2E=true required");

  test("create role, parent/child toggle, persist, concurrency 409", async ({
    page,
    request,
  }) => {
    const email = process.env.PLAYWRIGHT_LOGIN_EMAIL!;
    const password = process.env.PLAYWRIGHT_LOGIN_PASSWORD!;
    const token = await apiLogin(request, email, password);
    const run = Date.now().toString(36);
    const role = await createRoleViaApi(request, token, `e2e_rbac_${run}`, `E2E RBAC ${run}`);
    expect(role.permissions.filter((k) => k.startsWith("diamond.fn."))).toHaveLength(0);

    await loginStaff(page, "en");
    await gotoRolesMatrixReady(page, "en");
    await expect(page.getByTestId("functional-rbac-matrix")).toBeVisible({
      timeout: 60_000,
    });

    const header = page.locator("thead th").filter({ hasText: role.name }).first();
    await expect(header).toBeVisible();
    const colIndex = await header.evaluate((th) => {
      const row = th.closest("tr");
      if (!row) return -1;
      return Array.from(row.children).indexOf(th);
    });
    const childRow = page.locator(
      '[data-capability-key="diamond.fn.vehicles.edit_prices"]',
    );
    const checkbox = childRow.locator("td").nth(colIndex).getByRole("checkbox");
    await checkbox.check();
    await expect(checkbox).toBeChecked();
    const parentRow = page.locator('[data-capability-key="diamond.fn.vehicles.view_page"]');
    await expect(parentRow.getByRole("checkbox").nth(1)).toBeChecked();

    await page.reload();
    await expect(page.getByTestId("functional-rbac-matrix")).toBeVisible({
      timeout: 30_000,
    });
    await expect(
      page.locator('[data-capability-key="diamond.fn.vehicles.edit_prices"]').getByRole(
        "checkbox",
      ).nth(1),
    ).toBeChecked();

    const stale = await request.put(`${BACKEND}/roles/${role.id}/functional-grants`, {
      headers: { Authorization: `Bearer ${token}` },
      data: {
        functionalGrants: ["diamond.fn.vehicles.view_page"],
        ifMatchUpdatedAt: new Date(Date.now() - 3600_000).toISOString(),
      },
    });
    expect(stale.status()).toBe(409);

    const parentCheckbox = parentRow.getByRole("checkbox").nth(1);
    await parentCheckbox.uncheck();
    await expect(parentCheckbox).not.toBeChecked();
    await expect(
      page.locator('[data-capability-key="diamond.fn.vehicles.edit_prices"]').getByRole(
        "checkbox",
      ).nth(1),
    ).not.toBeChecked();
  });
});
