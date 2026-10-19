import { test, expect } from "@playwright/test";
import { readFileSync } from "node:fs";
import path from "node:path";
import { loginStaffWithCredentials } from "./helpers/rbac-v2";

const enabled = process.env.PLAYWRIGHT_RBAC_BROWSER_CERT === "true";
const seedPath = path.join(
  __dirname,
  "../../backend/scripts/.rbac-browser-cert.env.json",
);

type Seed = {
  password: string;
  emptyEmail: string;
  allPagesEmail: string;
  vehViewEmail: string;
  vehFleetEmail: string;
  usersEditEmail: string;
  financeViewEmail: string;
  rolesMatrixEmail: string;
  contractsOpsEmail: string;
  editTargetEmail: string;
  contractNumber: string;
};

function loadSeed(): Seed {
  const raw = JSON.parse(readFileSync(seedPath, "utf8")) as Seed;
  const lower = (e: string) => e.toLowerCase();
  return {
    ...raw,
    emptyEmail: lower(raw.emptyEmail),
    allPagesEmail: lower(raw.allPagesEmail),
    vehViewEmail: lower(raw.vehViewEmail),
    vehFleetEmail: lower(raw.vehFleetEmail),
    usersEditEmail: lower(raw.usersEditEmail),
    financeViewEmail: lower(raw.financeViewEmail),
    rolesMatrixEmail: lower(raw.rolesMatrixEmail),
    contractsOpsEmail: lower(raw.contractsOpsEmail),
    editTargetEmail: lower(raw.editTargetEmail),
  };
}

const PAGES: {
  key: string;
  path: string;
  nav: RegExp;
  screen?: string;
  denied?: string;
}[] = [
  { key: "dashboard", path: "/dashboard", nav: /dashboard|لوحة/i },
  {
    key: "vehicles",
    path: "/vehicles",
    nav: /vehicles|المركبات|cars/i,
    screen: "vehicle-filters",
  },
  { key: "gps", path: "/gps", nav: /gps/i, screen: "gps-map" },
  { key: "maintenance", path: "/maintenance", nav: /maintenance|صيانة/i },
  { key: "archive", path: "/archive", nav: /archive|أرشيف/i },
  {
    key: "violations",
    path: "/violations",
    nav: /violations|salik|مخالفات/i,
    denied: "road-liabilities-denied",
  },
  {
    key: "finance",
    path: "/finance",
    nav: /finance|مالية/i,
    denied: "finance-denied",
    screen: "finance-screen",
  },
  {
    key: "invoices",
    path: "/invoices",
    nav: /invoices|فواتير/i,
    denied: "invoices-denied",
  },
  { key: "contracts", path: "/contracts", nav: /contracts|عقود/i },
  { key: "whatsapp", path: "/whatsapp", nav: /whatsapp/i },
  { key: "users", path: "/users", nav: /users|موظفين|employees/i },
  {
    key: "roles",
    path: "/roles",
    nav: /roles|أدوار/i,
    denied: "roles-denied",
  },
];

test.describe.configure({ timeout: 240_000 });

test.describe("RBAC browser certification", () => {
  test.skip(!enabled, "PLAYWRIGHT_RBAC_BROWSER_CERT=true required");

  test("frontend login smoke", async ({ page }) => {
    const seed = loadSeed();
    await loginStaffWithCredentials(page, "en", seed.allPagesEmail, seed.password);
    await expect(page).toHaveURL(/\/en\/dashboard/, { timeout: 60_000 });
  });

  test("empty: sidebar hidden + direct URL denied (12 pages)", async ({ page }) => {
    const seed = loadSeed();
    await loginStaffWithCredentials(page, "en", seed.emptyEmail, seed.password);
    let deniedCount = 0;
    for (const p of PAGES) {
      await expect(page.getByRole("link", { name: p.nav })).toHaveCount(0);
      await page.goto(`/en${p.path}`);
      if (p.denied) {
        await expect(page.getByTestId(p.denied)).toBeVisible({ timeout: 25_000 });
      } else {
        await expect(page.getByText(/access|denied|صلاحية|غير مسموح/i).first()).toBeVisible({
          timeout: 25_000,
        });
      }
      deniedCount += 1;
    }
    expect(deniedCount).toBe(12);
  });

  test("granted: sidebar visible + page opens (12 pages)", async ({ page }) => {
    const seed = loadSeed();
    await loginStaffWithCredentials(page, "en", seed.allPagesEmail, seed.password);
    let openCount = 0;
    for (const p of PAGES) {
      await expect(page.getByRole("link", { name: p.nav }).first()).toBeVisible({
        timeout: 25_000,
      });
      await page.goto(`/en${p.path}`);
      if (p.denied) {
        await expect(page.getByTestId(p.denied)).toHaveCount(0);
      } else if (p.screen) {
        await expect(page.getByTestId(p.screen).first()).toBeVisible({ timeout: 30_000 });
      } else {
        await expect(page.getByText(/access|denied|صلاحية/i)).toHaveCount(0);
      }
      openCount += 1;
    }
    expect(openCount).toBe(12);
  });

  test("child: vehicles add control", async ({ page }) => {
    const seed = loadSeed();
    await loginStaffWithCredentials(page, "en", seed.vehViewEmail, seed.password);
    await page.goto("/en/vehicles");
    await expect(page.getByTestId("vehicle-filters")).toBeVisible({ timeout: 30_000 });
    await expect(page.getByRole("button", { name: /add vehicle|إضافة مركبة/i })).toHaveCount(0);

    await loginStaffWithCredentials(page, "en", seed.vehFleetEmail, seed.password);
    await page.goto("/en/vehicles");
    await expect(page.getByTestId("vehicle-filters")).toBeVisible({ timeout: 30_000 });
    await expect(page.getByRole("button", { name: /add vehicle|إضافة مركبة/i }).first()).toBeVisible({
      timeout: 30_000,
    });
  });

  test("users.edit: edit dialog + role field", async ({ page }) => {
    const seed = loadSeed();
    await loginStaffWithCredentials(page, "en", seed.usersEditEmail, seed.password);
    await page.goto("/en/users");
    await expect(page.getByTestId("users-search")).toBeVisible({ timeout: 30_000 });
    const targetCard = page.locator('[data-testid="user-card"]').filter({
      has: page.locator(`text=${seed.editTargetEmail}`),
    });
    await expect(targetCard).toBeVisible({ timeout: 30_000 });
    await targetCard.getByRole("button", { name: /edit|تعديل/i }).click();
    await expect(page.getByRole("dialog")).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText(/role|دور/i).first()).toBeVisible();
  });

  test("contracts.operations_closure: car-out action", async ({ page }) => {
    const seed = loadSeed();
    await loginStaffWithCredentials(page, "en", seed.contractsOpsEmail, seed.password);
    await page.goto("/en/contracts");
    await expect(page.getByText(seed.contractNumber).first()).toBeVisible({ timeout: 45_000 });
    await page.getByText(seed.contractNumber).first().click();
    await expect(page.getByTestId("contract-detail")).toBeVisible({ timeout: 30_000 });
    await expect(page.getByRole("button", { name: /car out|تسليم/i })).toBeVisible({
      timeout: 15_000,
    });
  });

  test("roles.manage_permissions: matrix toggles enabled", async ({ page }) => {
    const seed = loadSeed();
    await loginStaffWithCredentials(page, "en", seed.rolesMatrixEmail, seed.password);
    await page.goto("/en/roles");
    await expect(page.getByTestId("functional-rbac-matrix")).toBeVisible({ timeout: 60_000 });
    const checkbox = page
      .getByTestId("functional-rbac-matrix")
      .locator('input[type="checkbox"]')
      .first();
    await expect(checkbox).toBeVisible();
    await expect(checkbox).toBeEnabled();
  });

  test("finance.view_page: screen without add expense", async ({ page }) => {
    const seed = loadSeed();
    await loginStaffWithCredentials(page, "en", seed.financeViewEmail, seed.password);
    await page.goto("/en/finance");
    await expect(page.getByTestId("finance-screen")).toBeVisible({ timeout: 30_000 });
    await expect(page.getByTestId("finance-add-expense")).toHaveCount(0);
  });
});
