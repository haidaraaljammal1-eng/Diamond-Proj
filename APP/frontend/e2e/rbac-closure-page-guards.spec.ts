/**
 * Light RBAC page guards — isolated stack only.
 * Requires backend on PLAYWRIGHT_API_URL (default :8000) + FE on PLAYWRIGHT_BASE_URL (default :3111).
 * Seed: backend `tsx scripts/rbac-closure.run.ts` (browser users in .rbac-closure-browser.env.json).
 */
import { test, expect } from "@playwright/test";
import { readFileSync } from "node:fs";
import path from "node:path";
import { loginStaffWithCredentials } from "./helpers/rbac-v2";

const enabled = process.env.PLAYWRIGHT_RBAC_CLOSURE === "true";
const seedPath = path.join(
  __dirname,
  "../../backend/scripts/.rbac-closure-browser.env.json",
);

type Seed = {
  password: string;
  emptyEmail: string;
  allPagesEmail: string;
  vehViewEmail: string;
};

function loadSeed(): Seed {
  const raw = JSON.parse(readFileSync(seedPath, "utf8")) as Seed;
  return {
    ...raw,
    emptyEmail: raw.emptyEmail.toLowerCase(),
    allPagesEmail: raw.allPagesEmail.toLowerCase(),
    vehViewEmail: raw.vehViewEmail.toLowerCase(),
  };
}

const PAGES: { path: string; nav: RegExp; screen?: RegExp; denied?: string }[] = [
  { path: "/dashboard", nav: /dashboard|لوحة/i },
  { path: "/vehicles", nav: /vehicles|المركبات|cars/i, screen: /vehicles-grid|vehicle-filters/i },
  { path: "/gps", nav: /gps/i },
  { path: "/maintenance", nav: /maintenance|صيانة/i },
  { path: "/archive", nav: /archive|أرشيف/i },
  { path: "/violations", nav: /violations|salik|مخالفات/i, denied: "road-liabilities-denied" },
  { path: "/finance", nav: /finance|مالية/i, denied: "finance-denied" },
  { path: "/invoices", nav: /invoices|فواتير/i, denied: "invoices-denied" },
  { path: "/contracts", nav: /contracts|عقود/i },
  { path: "/whatsapp", nav: /whatsapp/i },
  { path: "/users", nav: /users|موظفين|employees/i },
  { path: "/roles", nav: /roles|أدوار/i, denied: "roles-denied" },
];

test.describe.configure({ timeout: 180_000 });

test.describe("RBAC closure page guards", () => {
  test.skip(!enabled, "PLAYWRIGHT_RBAC_CLOSURE=true required");

  test("empty grants: sidebar hidden + URL denied (en)", async ({ page }) => {
    const seed = loadSeed();
    await loginStaffWithCredentials(page, "en", seed.emptyEmail, seed.password);
    for (const p of PAGES) {
      await expect(page.getByRole("link", { name: p.nav })).toHaveCount(0);
      await page.goto(`/en${p.path}`);
      if (p.denied) {
        await expect(page.getByTestId(p.denied)).toBeVisible({ timeout: 20_000 });
      } else {
        await expect(page.getByText(/access|denied|صلاحية|غير مسموح/i).first()).toBeVisible({
          timeout: 20_000,
        });
      }
    }
  });

  test("all page parents: sidebar visible + page opens (en)", async ({ page }) => {
    const seed = loadSeed();
    await loginStaffWithCredentials(page, "en", seed.allPagesEmail, seed.password);
    for (const p of PAGES) {
      await expect(page.getByRole("link", { name: p.nav }).first()).toBeVisible({
        timeout: 20_000,
      });
      await page.goto(`/en${p.path}`);
      if (p.denied) {
        await expect(page.getByTestId(p.denied)).toHaveCount(0);
      } else if (p.screen) {
        await expect(page.locator(p.screen).first()).toBeVisible({ timeout: 25_000 });
      } else {
        await expect(page.getByText(/access|denied|صلاحية/i)).toHaveCount(0);
      }
    }
  });

  test("vehicles view-only: add vehicle control absent", async ({ page }) => {
    const seed = loadSeed();
    await loginStaffWithCredentials(page, "en", seed.vehViewEmail, seed.password);
    await page.goto("/en/vehicles");
    await expect(page.getByTestId("vehicle-filters")).toBeVisible({ timeout: 25_000 });
    await expect(page.getByRole("button", { name: /add vehicle|إضافة مركبة/i })).toHaveCount(0);
  });
});
