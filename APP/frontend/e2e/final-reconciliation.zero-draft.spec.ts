import fs from "node:fs";
import path from "node:path";
import { test, expect, type Page } from "@playwright/test";

/**
 * Zero-balance draft, fuel charge CRUD, custody difference display, explicit zero completion.
 * Requires frontend (:3100) and backend (:8000).
 */
test.use({ channel: "chrome" });
test.describe.configure({ timeout: 300_000, mode: "serial" });

const API = process.env.PLAYWRIGHT_API_URL ?? "http://localhost:8000";
const email = process.env.PLAYWRIGHT_LOGIN_EMAIL ?? "admin@diamond.test";
const password = process.env.PLAYWRIGHT_LOGIN_PASSWORD ?? "Diamond123!";
const shots = path.join(process.cwd(), "test-results");

type ReviewContract = {
  id: string;
  number: string;
  finalAmount: number;
  settled: boolean;
  fuelDifference: number | null;
  mileageDifference: number | null;
};

async function authToken(): Promise<string> {
  const response = await fetch(`${API}/auth/login`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  if (!response.ok) throw new Error(`login ${response.status}`);
  return ((await response.json()) as { data: { accessToken: string } }).data.accessToken;
}

async function api(auth: string, method: string, url: string, body?: unknown) {
  const response = await fetch(`${API}${url}`, {
    method,
    headers: {
      Authorization: `Bearer ${auth}`,
      ...(body ? { "content-type": "application/json" } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const json = (await response.json()) as { data?: unknown; error?: unknown };
  return { status: response.status, json };
}

async function findZeroDraft(auth: string): Promise<ReviewContract | null> {
  const list = await api(auth, "GET", "/contracts?status=REVIEW&pageSize=100");
  const rows = (list.json.data ?? []) as Array<{ id: string; contractNumber: string }>;
  for (const row of rows) {
    const rec = await api(auth, "GET", `/contracts/${row.id}/reconciliation`);
    if (rec.status !== 200) continue;
    const data = rec.json.data as {
      contract: { contractNumber: string };
      totals: { finalAmount: number };
      reconciliation: { settled: boolean };
      custody: { fuelDifference: number | null; mileageDifference: number | null };
      lines: Array<{ type: string; id: string }>;
    };
    if (data.totals.finalAmount !== 0 || data.reconciliation.settled) continue;
    for (const line of data.lines) {
      if (line.type === "FUEL" || line.type === "DAMAGE") {
        await api(auth, "DELETE", `/contracts/${row.id}/reconciliation/lines/${line.id}`);
      }
    }
    const fresh = await api(auth, "GET", `/contracts/${row.id}/reconciliation`);
    const next = fresh.json.data as typeof data;
    return {
      id: row.id,
      number: next.contract.contractNumber,
      finalAmount: next.totals.finalAmount,
      settled: next.reconciliation.settled,
      fuelDifference: next.custody.fuelDifference,
      mileageDifference: next.custody.mileageDifference,
    };
  }
  return null;
}

async function login(page: Page) {
  await page.goto("/ar/login");
  if (!page.url().includes("/login")) return;
  await page.locator("#email").fill(email);
  await page.locator("#password").fill(password);
  await page.getByRole("button", { name: /دخول|login|sign in/i }).click();
  await page.waitForURL((url) => !url.pathname.includes("/login"), { timeout: 25_000 });
}

async function openReconciliationForContract(page: Page, contractNumber: string) {
  await page.goto("/ar/contracts", { waitUntil: "domcontentloaded" });
  await expect(page.getByTestId("contracts-table")).toBeVisible({ timeout: 60_000 });
  await page.getByTestId("contract-search").fill(contractNumber);
  await page.getByTestId("data-search-submit").click();
  await page
    .getByRole("button", { name: "المطابقة", exact: true })
    .first()
    .click();
  await expect(page.getByTestId("final-reconciliation-dialog")).toBeVisible({ timeout: 30_000 });
  await expect(page.getByTestId("reconciliation-loading")).toBeHidden({ timeout: 30_000 });
  await page.getByTestId("reconciliation-return-charges").scrollIntoViewIfNeeded();
}

test.describe("Final Reconciliation zero draft", () => {
  let contract: ReviewContract;
  let token = "";

  test.beforeAll(async () => {
    fs.mkdirSync(shots, { recursive: true });
    token = await authToken();
    const found = await findZeroDraft(token);
    test.skip(!found, "No zero-balance REVIEW contract available");
    contract = found!;
  });

  test("zero draft shows editable state with custody differences", async ({ page }) => {
    await login(page);
    await openReconciliationForContract(page, contract.number);

    await expect(page.getByTestId("reconciliation-header")).toContainText(/قيد المراجعة|Draft/i);
    await expect(page.getByTestId("reconciliation-completed")).toHaveCount(0);
    await expect(page.getByTestId("reconciliation-add-damage")).toBeVisible();
    await expect(page.getByTestId("reconciliation-add-fuel")).toBeVisible();
    await expect(page.getByTestId("reconciliation-complete-without-charges")).toBeVisible();
    await expect(page.getByTestId("reconciliation-zero-draft")).toBeVisible();

    const mileageDiff = page.getByTestId("reconciliation-metric-mileage-difference");
    await expect(mileageDiff).toBeVisible();
    await expect(mileageDiff.locator('[data-danger="true"]')).toBeVisible();

    if (contract.fuelDifference != null && contract.fuelDifference < 0) {
      const fuelDiff = page.getByTestId("reconciliation-metric-fuel-difference");
      await expect(fuelDiff).toContainText(`${contract.fuelDifference}/8`);
      await expect(fuelDiff.locator('[data-danger="true"]')).toBeVisible();
    }

    await page.screenshot({ path: path.join(shots, "final-reconciliation-zero-draft.png"), fullPage: true });
  });

  test("add, edit, and delete fuel charge", async ({ page }) => {
    await login(page);
    await openReconciliationForContract(page, contract.number);

    await page.getByTestId("reconciliation-add-fuel").click();
    await expect(page.getByTestId("fuel-form")).toBeVisible();
    await page.getByTestId("fuel-form").locator("input").fill("150");
    await page.getByTestId("fuel-form").getByRole("button", { name: /إضافة سعر الوقود|Add fuel charge/i }).click();
    await expect(page.getByTestId("reconciliation-final-amount")).toContainText("150");
    await expect(page.getByTestId("reconciliation-collect")).toBeVisible();
    await page.screenshot({ path: path.join(shots, "final-reconciliation-fuel-added.png"), fullPage: true });

    await page.getByTestId("reconciliation-add-fuel").click();
    await page.getByTestId("fuel-form").locator("input").fill("180");
    await page.getByTestId("fuel-form").getByRole("button", { name: /حفظ رسوم الوقود|Save fuel charge/i }).click();
    await expect(page.getByTestId("reconciliation-final-amount")).toContainText("180");

    const fuelLine = page.locator('[data-testid^="fuel-line-"]').first();
    await fuelLine.getByRole("button", { name: /حذف|Delete/i }).click();
    await expect(page.getByTestId("reconciliation-final-amount")).toContainText("0");
    await expect(page.getByTestId("reconciliation-zero-draft")).toBeVisible();
    await expect(page.getByTestId("reconciliation-completed")).toHaveCount(0);
  });

  test("add damage from zero enables collect", async ({ page }) => {
    await login(page);
    await openReconciliationForContract(page, contract.number);

    await page.getByTestId("reconciliation-add-damage").click();
    await page.getByTestId("damage-form").locator("input").first().fill("Rear bumper");
    await page.getByTestId("damage-form").locator("input").nth(1).fill("300");
    await page.getByTestId("damage-form").getByRole("button", { name: /إضافة ضرر|Add vehicle damage/i }).click();
    await expect(page.getByTestId("reconciliation-final-amount")).toContainText("300");
    await expect(page.getByTestId("reconciliation-collect")).toBeVisible();

    const damageLine = page.locator('[data-testid^="damage-line-"]').first();
    await damageLine.getByRole("button", { name: /حذف|Delete/i }).click();
    await expect(page.getByTestId("reconciliation-zero-draft")).toBeVisible();
  });
});
