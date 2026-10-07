import { execSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { test, expect, type Page } from "@playwright/test";

/**
 * Combined final reconciliation settlement: unpaid office renewals auto-included in one Collect action.
 */
test.use({ channel: "chrome" });
test.describe.configure({ timeout: 300_000, mode: "serial" });

const API = process.env.PLAYWRIGHT_API_URL ?? "http://localhost:8000";
const shots = path.join(process.cwd(), "test-results", "combined-settlement");

async function staffToken(email: string, password: string): Promise<string> {
  const response = await fetch(`${API}/auth/login`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  if (!response.ok) throw new Error(`login ${response.status}`);
  return ((await response.json()) as { data: { accessToken: string } }).data.accessToken;
}

async function provisionCombinedContract(): Promise<{
  contractId: string;
  contractNumber: string;
  adminEmail: string;
  adminPassword: string;
}> {
  const out = execSync("npx tsx scripts/provision-e2e-combined-settlement-contract.ts", {
    cwd: path.join(process.cwd(), "..", "backend"),
    encoding: "utf8",
    env: process.env,
  });
  const line = out.trim().split("\n").filter((item) => item.startsWith("{")).at(-1);
  if (!line) throw new Error("provision output missing");
  return JSON.parse(line) as {
    contractId: string;
    contractNumber: string;
    adminEmail: string;
    adminPassword: string;
  };
}

async function login(page: Page, email: string, password: string) {
  await page.goto("/ar/login");
  if (!page.url().includes("/login")) return;
  await page.locator("#email").fill(email);
  await page.locator("#password").fill(password);
  await page.getByRole("button", { name: /دخول|login|sign in/i }).click();
  await page.waitForURL((url) => !url.pathname.includes("/login"), { timeout: 25_000 });
}

async function openReconciliation(page: Page, contractNumber: string) {
  await page.goto("/ar/contracts", { waitUntil: "domcontentloaded" });
  await expect(page.getByTestId("contracts-table")).toBeVisible({ timeout: 60_000 });
  await page.getByTestId("contract-search").fill(contractNumber);
  await page.getByTestId("data-search-submit").click();
  await page.getByRole("button", { name: "المطابقة", exact: true }).first().click();
  await expect(page.getByTestId("final-reconciliation-dialog")).toBeVisible({ timeout: 30_000 });
  await expect(page.getByTestId("reconciliation-loading")).toBeHidden({ timeout: 30_000 });
}

async function confirmCash(page: Page) {
  await page.getByTestId("reconciliation-collect").click();
  const methodDialog = page.getByRole("dialog", { name: "اختر طريقة التحصيل" });
  await expect(methodDialog).toBeVisible();
  await methodDialog.getByRole("button", { name: /الدفع النقدي/ }).click();
  const cashSettle = page.waitForResponse(
    (response) =>
      response.url().includes("/reconciliation/cash/settle") && response.request().method() === "POST",
  );
  await page.getByRole("button", { name: "تأكيد التحصيل" }).click();
  const response = await cashSettle;
  expect(response.status()).toBe(200);
}

async function expectClosed(authToken: string, contractId: string) {
  await expect
    .poll(async () => {
      const detail = await fetch(`${API}/contracts/${contractId}`, {
        headers: { Authorization: `Bearer ${authToken}` },
      });
      if (!detail.ok) return "";
      return ((await detail.json()) as { data: { status: string } }).data.status;
    }, { timeout: 20_000 })
    .toBe("CLOSED");
}

test.describe("Final Reconciliation combined settlement", () => {
  test("auto-includes unpaid renewal in one cash collection", async ({ page }) => {
    fs.mkdirSync(shots, { recursive: true });
    const seeded = await provisionCombinedContract();
    const authToken = await staffToken(seeded.adminEmail, seeded.adminPassword);
    await login(page, seeded.adminEmail, seeded.adminPassword);
    await openReconciliation(page, seeded.contractNumber);

    await expect(page.getByTestId("reconciliation-unpaid-renewals")).toBeVisible();
    await expect(page.getByText("مضاف تلقائيًا إلى التسوية")).toBeVisible();
    await expect(page.getByRole("button", { name: "تحصيل التجديد" })).toHaveCount(0);
    await expect(page.getByTestId("reconciliation-final-amount")).toContainText("500");

    await page.screenshot({ path: path.join(shots, "before-collect.png"), fullPage: true });

    await confirmCash(page);
    await expect(page.getByTestId("reconciliation-completed")).toBeVisible({ timeout: 30_000 });
    await page.screenshot({ path: path.join(shots, "after-collect.png"), fullPage: true });
    await expectClosed(authToken, seeded.contractId);
  });

  test("combined damage 200 and renewal 500 collects 700 cash", async ({ page }) => {
    fs.mkdirSync(shots, { recursive: true });
    const out = execSync("npx tsx scripts/provision-e2e-combined-settlement-contract.ts", {
      cwd: path.join(process.cwd(), "..", "backend"),
      encoding: "utf8",
      env: { ...process.env, E2E_RECON_DAMAGE_AMOUNT: "200" },
    });
    const line = out.trim().split("\n").filter((item) => item.startsWith("{")).at(-1);
    if (!line) throw new Error("provision output missing");
    const seeded = JSON.parse(line) as {
      contractId: string;
      contractNumber: string;
      adminEmail: string;
      adminPassword: string;
      settlementAmountDue: number;
    };
    expect(seeded.settlementAmountDue).toBe(700);

    const authToken = await staffToken(seeded.adminEmail, seeded.adminPassword);
    await login(page, seeded.adminEmail, seeded.adminPassword);
    await openReconciliation(page, seeded.contractNumber);
    await expect(page.getByTestId("reconciliation-final-amount")).toContainText("700");
    await page.screenshot({ path: path.join(shots, "combined-700-before.png"), fullPage: true });
    await confirmCash(page);
    await expect(page.getByTestId("reconciliation-completed")).toBeVisible({ timeout: 30_000 });
    await page.screenshot({ path: path.join(shots, "combined-700-after.png"), fullPage: true });
    await expectClosed(authToken, seeded.contractId);
  });
});
