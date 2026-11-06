import { expect, test } from "@playwright/test";
import { loginStaffWithCredentials } from "./helpers/rbac-v2";

/** Match `dev:bootstrap` admin (see `.env` / `NEXT_PUBLIC_DEV_ADMIN_*`). */
const email = process.env.PLAYWRIGHT_LOGIN_EMAIL ?? "admin@diamond.test";
const password = process.env.PLAYWRIGHT_LOGIN_PASSWORD ?? "Diamond123!";

test.describe("staff sidebar logout", () => {
  test("logout stays on login after reauth (no dashboard bounce)", async ({
    page,
  }) => {
    test.setTimeout(120_000);

    await loginStaffWithCredentials(page, "ar", email, password);
    await expect(page).toHaveURL(/\/ar\/dashboard/, { timeout: 60_000 });

    const accountRow = page.getByTestId("staff-account-row");
    await accountRow.hover();
    const logoutButton = page.getByTestId("staff-logout-button");
    await expect(logoutButton).toBeVisible({ timeout: 10_000 });
    await logoutButton.click();

    await page.waitForURL(/\/ar\/login\?reauth=1/, { timeout: 30_000 });
    await expect(page).toHaveURL(/\/ar\/login\?reauth=1/);
    await expect(page.getByTestId("login-shell")).toBeVisible({ timeout: 15_000 });

    await page.waitForTimeout(2_000);
    await expect(page).toHaveURL(/\/ar\/login/);
    await expect(page).not.toHaveURL(/\/dashboard/);

    await page.waitForFunction(
      async () => {
        const res = await fetch("/api/auth/session", {
          credentials: "include",
          cache: "no-store",
        });
        if (!res.ok) return true;
        const body = (await res.json()) as { accessToken?: string } | null;
        return !body?.accessToken;
      },
      undefined,
      { timeout: 15_000 },
    );
  });

  test("collapsed rail still exposes logout on account hover", async ({
    page,
  }) => {
    test.setTimeout(120_000);

    await loginStaffWithCredentials(page, "ar", email, password);
    await page.locator('[data-sidebar="collapsed"]').waitFor({ state: "attached", timeout: 30_000 }).catch(() => undefined);

    const accountRow = page.getByTestId("staff-account-row");
    await accountRow.hover();
    await expect(page.getByTestId("staff-logout-button")).toBeVisible({
      timeout: 10_000,
    });
  });
});
