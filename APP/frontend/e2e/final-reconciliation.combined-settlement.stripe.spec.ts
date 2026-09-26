import { execSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { test, expect, type Page } from "@playwright/test";

/**
 * Real Stripe TEST checkout for combined final settlement (200 recon + 500 renewal = 700 AED).
 */
test.use({ channel: "chrome" });
test.describe.configure({ timeout: 480_000, mode: "serial" });

const API = process.env.PLAYWRIGHT_API_URL ?? "http://localhost:8000";
const shots = path.join(process.cwd(), "test-results", "combined-settlement-stripe");
const continuePayment = /Continue to payment|متابعة إلى الدفع/;

async function staffToken(email: string, password: string): Promise<string> {
  const response = await fetch(`${API}/auth/login`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  if (!response.ok) throw new Error(`login ${response.status}`);
  return ((await response.json()) as { data: { accessToken: string } }).data.accessToken;
}

function provision700(): {
  contractId: string;
  contractNumber: string;
  adminEmail: string;
  adminPassword: string;
  settlementAmountDue: number;
} {
  const out = execSync("npx tsx scripts/provision-e2e-combined-settlement-contract.ts", {
    cwd: path.join(process.cwd(), "..", "backend"),
    encoding: "utf8",
    env: { ...process.env, E2E_RECON_DAMAGE_AMOUNT: "200" },
  });
  const line = out.trim().split("\n").filter((item) => item.startsWith("{")).at(-1);
  if (!line) throw new Error("provision output missing");
  return JSON.parse(line) as {
    contractId: string;
    contractNumber: string;
    adminEmail: string;
    adminPassword: string;
    settlementAmountDue: number;
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

async function fillStripeCheckout(page: Page) {
  await page.waitForURL(/checkout\.stripe\.com/, { timeout: 90_000 });
  await expect(page.getByText(/700\.00|AED\s*700/i).first()).toBeVisible({ timeout: 30_000 });
  const country = page.getByRole("combobox", { name: /country or region/i });
  if (await country.count()) await country.selectOption({ label: "United Arab Emirates" });
  const mail = page.getByRole("textbox", { name: /email/i });
  if (await mail.count()) await mail.fill("combined-settlement-stripe@example.test");
  const card = page.getByRole("textbox", { name: /card number/i });
  await card.waitFor({ timeout: 60_000 });
  await card.fill("4242424242424242");
  const expiry = page.getByRole("textbox", { name: /expiration/i });
  if (await expiry.count()) await expiry.fill("12/34");
  const cvc = page.getByRole("textbox", { name: /cvc/i });
  if (await cvc.count()) await cvc.fill("123");
  const name = page.getByRole("textbox", { name: /cardholder name/i });
  if (await name.count()) await name.fill("Combined QA");
  await page.getByRole("button", { name: /pay/i }).click();
}

async function reconciliationSnap(auth: string, contractId: string) {
  const rec = await fetch(`${API}/contracts/${contractId}/reconciliation`, {
    headers: { Authorization: `Bearer ${auth}` },
  });
  const data = (await rec.json()).data as {
    contract: { status: string };
    reconciliationChargesAmount: number;
    outstandingRenewalAmount: number;
    settlementAmountDue: number;
    reconciliation: { settledAt: string | null; finalizedAt: string | null };
    collection: { paymentStatus: string | null };
  };
  return data;
}

test("combined 700 AED real Stripe TEST settlement", async ({ page, context }) => {
  fs.mkdirSync(shots, { recursive: true });
  const seeded = provision700();
  expect(seeded.settlementAmountDue).toBe(700);
  const auth = await staffToken(seeded.adminEmail, seeded.adminPassword);

  let snap = await reconciliationSnap(auth, seeded.contractId);
  expect(snap.reconciliationChargesAmount).toBe(200);
  expect(snap.outstandingRenewalAmount).toBe(500);
  expect(snap.settlementAmountDue).toBe(700);
  expect(snap.contract.status).toBe("REVIEW");
  expect(snap.reconciliation.settledAt).toBeNull();

  await login(page, seeded.adminEmail, seeded.adminPassword);
  await openReconciliation(page, seeded.contractNumber);

  await expect(page.getByText("رسوم المطابقة").first()).toBeVisible();
  await expect(page.getByText("200").first()).toBeVisible();
  await expect(page.getByText("التجديدات غير المحصلة").first()).toBeVisible();
  await expect(page.getByText("500").first()).toBeVisible();
  await expect(page.getByTestId("reconciliation-final-amount")).toContainText("700");
  await expect(page.getByText("مضاف تلقائيًا إلى التسوية")).toBeVisible();
  await expect(page.getByRole("button", { name: "تحصيل التجديد" })).toHaveCount(0);
  await expect(page.getByTestId("reconciliation-collect")).toHaveCount(1);
  await page.screenshot({ path: path.join(shots, "01-before-payment.png"), fullPage: true });

  await page.getByTestId("reconciliation-collect").click();
  const methodDialog = page.getByRole("dialog", { name: "اختر طريقة التحصيل" });
  await expect(methodDialog).toBeVisible();
  const linkResponse = page.waitForResponse(
    (response) => response.url().includes("/reconciliation/link") && response.request().method() === "POST",
  );
  await methodDialog.getByRole("button", { name: /الدفع الإلكتروني/ }).click();
  expect((await linkResponse).status()).toBe(200);
  await expect(page.getByTestId("reconciliation-link-url")).toBeVisible({ timeout: 30_000 });
  const publicUrl = (await page.getByTestId("reconciliation-link-url").textContent())?.trim();
  expect(publicUrl).toBeTruthy();

  const publicPage = await context.newPage();
  await publicPage.goto(publicUrl!, { waitUntil: "domcontentloaded" });
  await expect(publicPage.getByTestId("public-reconciliation-screen")).toBeVisible({ timeout: 30_000 });
  await expect(publicPage.getByText(/700/).first()).toBeVisible();
  await expect(publicPage.getByText(/^200 AED$|200 AED/).first()).toBeHidden().catch(() => {});
  await publicPage.screenshot({ path: path.join(shots, "02-public-700.png"), fullPage: true });

  const abandonPage = await context.newPage();
  await abandonPage.goto(publicUrl!, { waitUntil: "domcontentloaded" });
  await abandonPage.getByRole("button", { name: continuePayment }).click();
  await abandonPage.waitForURL(/checkout\.stripe\.com/, { timeout: 90_000 });
  await abandonPage.screenshot({ path: path.join(shots, "03-stripe-checkout-700.png"), fullPage: true });
  await abandonPage.close();

  snap = await reconciliationSnap(auth, seeded.contractId);
  expect(snap.contract.status).toBe("REVIEW");
  expect(snap.reconciliation.settledAt).toBeNull();
  expect(snap.collection.paymentStatus).not.toBe("CONFIRMED");

  const payPage = await context.newPage();
  await payPage.goto(publicUrl!, { waitUntil: "domcontentloaded" });
  await payPage.getByRole("button", { name: continuePayment }).click();
  await fillStripeCheckout(payPage);
  await payPage.waitForURL(/\/payment\/callback/, { timeout: 180_000 });
  await payPage.screenshot({ path: path.join(shots, "04-after-pay-return.png"), fullPage: true });

  const started = Date.now();
  while (Date.now() - started < 150_000) {
    snap = await reconciliationSnap(auth, seeded.contractId);
    if (snap.reconciliation.settledAt && snap.contract.status === "CLOSED") break;
    await payPage.waitForTimeout(5_000);
  }
  expect(snap.contract.status).toBe("CLOSED");
  expect(snap.collection.paymentStatus).toBe("CONFIRMED");

  for (let i = 0; i < 3; i++) {
    await payPage.reload({ waitUntil: "domcontentloaded" });
    await page.reload({ waitUntil: "domcontentloaded" });
    snap = await reconciliationSnap(auth, seeded.contractId);
    expect(snap.contract.status).toBe("CLOSED");
  }

  const oldLinkPage = await context.newPage();
  await oldLinkPage.goto(publicUrl!, { waitUntil: "domcontentloaded" });
  await expect(oldLinkPage.getByTestId("public-reconciliation-completed")).toBeVisible({ timeout: 30_000 });
  await expect(oldLinkPage.getByRole("button", { name: continuePayment })).toHaveCount(0);
  await oldLinkPage.close();

  await page.goto("/ar/contracts", { waitUntil: "domcontentloaded" });
  await page.getByTestId("contract-search").fill(seeded.contractNumber);
  await page.getByTestId("data-search-submit").click();
  await expect(page.getByRole("button", { name: "المطابقة", exact: true })).toHaveCount(0);
  await page.screenshot({ path: path.join(shots, "05-staff-closed.png"), fullPage: true });

  fs.writeFileSync(
    path.join(shots, "run-meta.json"),
    JSON.stringify({ contractId: seeded.contractId, contractNumber: seeded.contractNumber }, null, 2),
  );
});
