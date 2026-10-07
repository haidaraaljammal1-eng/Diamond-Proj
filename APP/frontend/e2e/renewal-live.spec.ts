import { execSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { test, expect, type Page } from "@playwright/test";

/**
 * Live renewal lifecycle — real API, real Stripe TEST checkout, Arabic staff UI.
 */
test.use({ channel: "chrome" });
test.describe.configure({ timeout: 480_000, mode: "serial" });

const API = process.env.PLAYWRIGHT_API_URL ?? "http://localhost:8000";
const BACKEND_DIR = path.join(process.cwd(), "..", "backend");
const shots = path.join(process.cwd(), "test-results", "renewal-live");

type Provisioned = {
  contractId: string;
  contractNumber: string;
  endAt: string;
  rentalDays: number;
  agreedAmount: number;
  adminEmail: string;
  adminPassword: string;
};

let electronic: Provisioned;
let office: Provisioned;
let auth = "";

async function api(method: string, url: string, body?: unknown) {
  const response = await fetch(`${API}${url}`, {
    method,
    headers: {
      Authorization: `Bearer ${auth}`,
      ...(body ? { "content-type": "application/json" } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const json = (await response.json()) as { data?: unknown; error?: { context?: { reason?: string } } };
  return { status: response.status, json };
}

async function snap(id: string) {
  const res = await api("GET", `/contracts/${id}`);
  expect(res.status).toBe(200);
  return res.json.data as {
    endAt: string;
    rentalDays: number;
    agreedAmount: number;
    renewals: Array<{
      id: string;
      collectionState?: string;
      approvedAt: string | null;
      appliedAt: string | null;
      settledPaymentId: string | null;
    }>;
  };
}

async function login(page: Page, creds: { email: string; password: string }) {
  await page.goto("/ar/login");
  if (!page.url().includes("/login")) return;
  await page.locator("#email").fill(creds.email);
  await page.locator("#password").fill(creds.password);
  await page.getByRole("button", { name: /دخول|login|sign in/i }).click();
  await page.waitForURL((url) => !url.pathname.includes("/login"), { timeout: 25_000 });
}

async function openDrawer(page: Page, contractNumber: string) {
  await page.goto("/ar/contracts", { waitUntil: "domcontentloaded" });
  await expect(page.getByTestId("contracts-table")).toBeVisible({ timeout: 60_000 });
  await page.getByTestId("contract-search").fill(contractNumber);
  await page.getByTestId("data-search-submit").click();
  await page.locator(`[data-record-number="${contractNumber}"]`).click();
  await expect(page.getByTestId("contract-detail")).toBeVisible({ timeout: 30_000 });
}

async function pollProviderConfirmation(statusToken: string, timeoutMs = 180_000) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    const res = await fetch(`${API}/contracts/payments/status/${statusToken}`);
    if (res.status === 200) {
      const body = (await res.json()) as { data?: { status?: string } };
      if (body.data?.status === "CONFIRMED") return;
    }
    await new Promise((resolve) => setTimeout(resolve, 4_000));
  }
  throw new Error("Stripe renewal payment did not reach CONFIRMED via status poll");
}

async function startRenewalCheckoutViaApi(renewToken: string) {
  const res = await fetch(`${API}/contracts/renew/${renewToken}/payment`, {
    method: "POST",
    headers: { "accept-language": "ar" },
  });
  expect(res.status).toBe(200);
  const body = (await res.json()) as {
    data?: { statusToken?: string; checkoutUrl?: string; payment?: { checkoutUrl?: string } };
  };
  const statusToken = body.data?.statusToken;
  const checkoutUrl = body.data?.checkoutUrl ?? body.data?.payment?.checkoutUrl;
  expect(statusToken).toBeTruthy();
  expect(checkoutUrl).toBeTruthy();
  return { statusToken: statusToken!, checkoutUrl: checkoutUrl! };
}

async function fillStripeCheckout(page: Page, cardNumber: string) {
  await page.waitForURL(/checkout\.stripe\.com/, { timeout: 90_000 });
  const country = page.getByRole("combobox", { name: /country or region/i });
  if (await country.count()) await country.selectOption({ label: "United Arab Emirates" });
  const mail = page.getByRole("textbox", { name: /email/i });
  if (await mail.count()) await mail.fill("renewal-live-qa@example.test");
  const card = page.getByRole("textbox", { name: /card number/i });
  await card.waitFor({ timeout: 60_000 });
  await card.fill(cardNumber);
  const expiry = page.getByRole("textbox", { name: /expiration/i });
  if (await expiry.count()) await expiry.fill("12/34");
  const cvc = page.getByRole("textbox", { name: /cvc/i });
  if (await cvc.count()) await cvc.fill("123");
  const name = page.getByRole("textbox", { name: /cardholder name/i });
  if (await name.count()) await name.fill("Stripe QA");
  await page.getByRole("button", { name: /^pay$/i }).click();
}

function provision(tag: string): Provisioned {
  const raw = execSync(`npx tsx scripts/provision-e2e-renewal-contract.ts`, {
    cwd: BACKEND_DIR,
    env: { ...process.env, E2E_RENEWAL_TAG: tag, LOG_LEVEL: "silent" },
    encoding: "utf8",
  });
  const line = raw.trim().split("\n").pop();
  if (!line) throw new Error("provision script returned no JSON");
  return JSON.parse(line) as Provisioned;
}

test.beforeAll(async () => {
  test.setTimeout(300_000);
  fs.mkdirSync(shots, { recursive: true });
  const health = await fetch(`${API}/health`);
  expect(health.status).toBe(200);
  electronic = provision("E2E-REN-ELECTRONIC");
  office = provision("E2E-REN-OFFICE");
  const login = await fetch(`${API}/auth/login`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email: electronic.adminEmail, password: electronic.adminPassword }),
  });
  expect(login.status).toBe(200);
  auth = ((await login.json()) as { data: { accessToken: string } }).data.accessToken;
});

test("electronic: PENDING → AWAITING → abandon/decline → Stripe PAID", async ({ page, context }) => {
  const baseline = await snap(electronic.contractId);
  const link = await api("POST", `/contracts/${electronic.contractId}/renewal-link`, {
    additionalDays: 3,
    additionalAmount: 450,
  });
  expect(link.status).toBe(200);
  const renewToken = (link.json.data as { link: { token: string } }).link.token;
  const pending = await snap(electronic.contractId);
  expect(pending.endAt).toBe(baseline.endAt);
  expect(pending.renewals[0]?.approvedAt).toBeNull();

  await login(page, { email: electronic.adminEmail, password: electronic.adminPassword });
  await openDrawer(page, electronic.contractNumber);
  await expect(page.getByTestId("renewal-history")).toContainText("قيد الانتظار");
  await page.screenshot({ path: path.join(shots, "01-electronic-pending.png"), fullPage: true });

  await page.getByRole("button", { name: "إغلاق" }).click();

  const acceptPage = await context.newPage();
  await acceptPage.goto(`/ar/renew/${renewToken}`, { waitUntil: "domcontentloaded" });
  await acceptPage.getByTestId("renewal-confirm").click();
  await expect(acceptPage.getByTestId("renewal-pay")).toBeVisible({ timeout: 30_000 });
  await acceptPage.close();

  const awaiting = await snap(electronic.contractId);
  expect(awaiting.endAt).toBe(baseline.endAt);
  expect(awaiting.renewals[0]?.approvedAt).toBeTruthy();
  expect(awaiting.renewals[0]?.appliedAt).toBeNull();
  expect(awaiting.renewals[0]?.collectionState).toBe("AWAITING_PAYMENT");
  await openDrawer(page, electronic.contractNumber);
  await expect(page.getByTestId("renewal-history")).toContainText("بانتظار الدفع");
  await page.screenshot({ path: path.join(shots, "02-electronic-awaiting.png"), fullPage: true });

  const publicPage = await context.newPage();
  await publicPage.goto(`/ar/renew/${renewToken}`, { waitUntil: "domcontentloaded" });
  await publicPage.getByTestId("renewal-pay").click();
  await publicPage.waitForURL(/checkout\.stripe\.com/, { timeout: 90_000 });
  await publicPage.close();
  expect((await snap(electronic.contractId)).endAt).toBe(baseline.endAt);

  const decline = await context.newPage();
  await decline.goto(`/ar/renew/${renewToken}`, { waitUntil: "domcontentloaded" });
  await decline.getByTestId("renewal-pay").click();
  await fillStripeCheckout(decline, "4000000000000002");
  await decline.waitForTimeout(8_000);
  const afterDecline = await snap(electronic.contractId);
  expect(afterDecline.endAt).toBe(baseline.endAt);
  expect(afterDecline.renewals[0]?.appliedAt).toBeNull();
  expect(afterDecline.renewals[0]?.settledPaymentId).toBeNull();
  expect(afterDecline.renewals[0]?.collectionState).toBe("AWAITING_PAYMENT");
  await decline.close();

  const pay = await context.newPage();
  const { statusToken, checkoutUrl } = await startRenewalCheckoutViaApi(renewToken);
  await pay.goto(checkoutUrl, { waitUntil: "domcontentloaded" });
  await fillStripeCheckout(pay, "4242424242424242");
  await pay
    .waitForURL(/\/payment\/callback/, { timeout: 180_000, waitUntil: "domcontentloaded" })
    .catch(() => undefined);
  await pollProviderConfirmation(statusToken);
  await pay.close();

  const paid = await snap(electronic.contractId);
  expect(paid.renewals[0]?.settledPaymentId).toBeTruthy();
  expect(paid.endAt).not.toBe(baseline.endAt);
  await openDrawer(page, electronic.contractNumber);
  await expect(page.getByTestId("renewal-history")).toContainText("مؤكد ومدفوع");
  await page.screenshot({ path: path.join(shots, "03-electronic-paid.png"), fullPage: true });
});

test("office: register OFFICE_UNPAID → cash collect PAID", async ({ page }) => {
  const loginRes = await fetch(`${API}/auth/login`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email: office.adminEmail, password: office.adminPassword }),
  });
  auth = ((await loginRes.json()) as { data: { accessToken: string } }).data.accessToken;

  const baseline = await snap(office.contractId);
  await login(page, { email: office.adminEmail, password: office.adminPassword });
  await openDrawer(page, office.contractNumber);
  await page.getByRole("button", { name: "تجديد", exact: true }).click();
  await page.getByPlaceholder("أيام إضافية").fill("2");
  await page.getByPlaceholder("مبلغ إضافي (درهم)").fill("320");
  await page.getByRole("button", { name: "تسجيل في المكتب للتحصيل كاش" }).click();
  await page.getByRole("button", { name: "تسجيل التجديد" }).click();
  await expect(page.getByTestId("renewal-history")).toContainText("غير محصل", { timeout: 30_000 });
  await page.screenshot({ path: path.join(shots, "04-office-unpaid.png"), fullPage: true });

  const registered = await snap(office.contractId);
  expect(registered.endAt).not.toBe(baseline.endAt);
  const renewalId = registered.renewals[0]!.id;
  await page.getByTestId(`renewal-collect-${renewalId}`).click();
  await page.getByRole("button", { name: "تأكيد التحصيل" }).click();
  await expect(page.getByTestId("renewal-history")).toContainText("مؤكد ومدفوع", { timeout: 30_000 });
  const afterCash = await snap(office.contractId);
  expect(afterCash.endAt).toBe(registered.endAt);
  await page.screenshot({ path: path.join(shots, "05-office-paid.png"), fullPage: true });
});
