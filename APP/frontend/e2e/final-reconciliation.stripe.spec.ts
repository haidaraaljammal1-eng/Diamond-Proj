import fs from "node:fs";
import path from "node:path";
import { test, expect, type Page } from "@playwright/test";

/**
 * Real Stripe TEST checkout for Final Reconciliation.
 * Payment success is read from the contract API, not from the browser return URL.
 */
test.use({ channel: "chrome" });
test.describe.configure({ timeout: 420_000 });

const API = process.env.PLAYWRIGHT_API_URL ?? "http://localhost:8000";
const email = process.env.PLAYWRIGHT_LOGIN_EMAIL ?? "admin@diamond.test";
const password = process.env.PLAYWRIGHT_LOGIN_PASSWORD ?? "Diamond123!";
const shots = path.join(process.cwd(), "test-results");

type Snap = {
  contractStatus: string;
  finalized: boolean;
  settled: boolean;
  paymentStatus: string | null;
  paymentMethod: string | null;
  finalAmount: number;
  vehicleStatus: string | null;
};

async function token(): Promise<string> {
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
  const json = (await response.json()) as { data?: unknown; error?: { code?: string } };
  return { status: response.status, json };
}

async function snap(auth: string, id: string): Promise<Snap> {
  const rec = await api(auth, "GET", `/contracts/${id}/reconciliation`);
  const detail = await api(auth, "GET", `/contracts/${id}`);
  const data = rec.json.data as {
    contract: { status: string };
    totals: { finalAmount: number };
    reconciliation: { finalizedAt: string | null; settledAt: string | null };
    collection: { paymentStatus: string | null; paymentMethod: string | null };
  };
  const vehicle = (
    detail.json.data as { vehicle?: { operationalStatus?: string } } | undefined
  )?.vehicle;
  return {
    contractStatus: data.contract.status,
    finalized: Boolean(data.reconciliation.finalizedAt),
    settled: Boolean(data.reconciliation.settledAt),
    paymentStatus: data.collection.paymentStatus,
    paymentMethod: data.collection.paymentMethod,
    finalAmount: data.totals.finalAmount,
    vehicleStatus: vehicle?.operationalStatus ?? null,
  };
}

async function login(page: Page) {
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
  const action = page.getByRole("button", { name: "المطابقة", exact: true }).first();
  await expect(action).toBeVisible({ timeout: 20_000 });
  await action.click();
  await expect(page.getByTestId("final-reconciliation-dialog")).toBeVisible({ timeout: 30_000 });
  await expect(page.getByTestId("reconciliation-loading")).toBeHidden({ timeout: 30_000 });
}

async function fillStripeCheckout(page: Page, cardNumber: string) {
  await page.waitForURL(/checkout\.stripe\.com/, { timeout: 90_000 });
  const country = page.getByRole("combobox", { name: /country or region/i });
  if (await country.count()) await country.selectOption({ label: "United Arab Emirates" });
  const mail = page.getByRole("textbox", { name: /email/i });
  if (await mail.count()) await mail.fill("stripe-reconciliation-qa@example.test");
  const card = page.getByRole("textbox", { name: /card number/i });
  await card.waitFor({ timeout: 60_000 });
  await card.fill(cardNumber);
  const expiry = page.getByRole("textbox", { name: /expiration/i });
  if (await expiry.count()) await expiry.fill("12/34");
  const cvc = page.getByRole("textbox", { name: /cvc/i });
  if (await cvc.count()) await cvc.fill("123");
  const name = page.getByRole("textbox", { name: /cardholder name/i });
  if (await name.count()) await name.fill("Stripe QA");
  await page.getByRole("button", { name: /pay/i }).click();
}

test("electronic link, abandon, decline, and real Stripe TEST success", async ({ page, context }) => {
  fs.mkdirSync(shots, { recursive: true });
  const auth = await token();
  const list = await api(auth, "GET", "/contracts?status=REVIEW&pageSize=100");
  const rows = (list.json.data ?? []) as Array<{ id: string; contractNumber: string }>;
  const detailed: Array<{
    id: string;
    number: string;
    finalAmount: number;
    settledAt: string | null;
    finalizedAt: string | null;
    paymentStatus: string | null;
    pendingLiabilities: number;
  }> = [];
  for (const row of rows) {
    const rec = await api(auth, "GET", `/contracts/${row.id}/reconciliation`);
    const data = rec.json.data as {
      totals: { finalAmount: number };
      reconciliation: { finalizedAt: string | null; settledAt: string | null };
      collection: { paymentStatus: string | null };
      roadLiabilities: { available: unknown[] };
    };
    detailed.push({
      id: row.id,
      number: row.contractNumber,
      finalAmount: data.totals.finalAmount,
      settledAt: data.reconciliation.settledAt,
      finalizedAt: data.reconciliation.finalizedAt,
      paymentStatus: data.collection.paymentStatus,
      pendingLiabilities: data.roadLiabilities.available.length,
    });
  }
  const target = detailed.find(
    (row) =>
      row.finalAmount > 0 &&
      !row.settledAt &&
      row.pendingLiabilities === 0 &&
      row.paymentStatus !== "PROCESSING" &&
      row.paymentStatus !== "PENDING",
  );
  expect(target, `collectable REVIEW contracts among ${detailed.length}`).toBeTruthy();

  const continuePayment = /Continue to payment|متابعة إلى الدفع/;
  const timeline: Record<string, Snap> = {};
  const writeTimeline = () => {
    fs.writeFileSync(path.join(shots, "stripe-timeline.json"), JSON.stringify(timeline, null, 2));
  };
  timeline.beforeLink = await snap(auth, target!.id);
  expect(timeline.beforeLink.contractStatus).toBe("REVIEW");
  expect(timeline.beforeLink.settled).toBe(false);
  writeTimeline();

  await login(page);
  await openReconciliation(page, target!.number);
  if (timeline.beforeLink.finalized) {
    await expect(page.getByTestId("reconciliation-reissue-link")).toBeVisible();
  }
  await page.getByTestId("reconciliation-collect").click();
  const methodDialog = page.getByRole("dialog", { name: "اختر طريقة التحصيل" });
  await expect(methodDialog).toBeVisible();
  const linkResponse = page.waitForResponse(
    (response) => response.url().includes("/reconciliation/link") && response.request().method() === "POST",
  );
  await methodDialog.getByRole("button", { name: /الدفع الإلكتروني/ }).click();
  const issued = await linkResponse;
  if (issued.status() !== 200) {
    const body = (await issued.json().catch(() => null)) as {
      error?: { code?: string; context?: { reason?: string } };
    } | null;
    throw new Error(
      `link ${issued.status()} ${body?.error?.code ?? ""} ${body?.error?.context?.reason ?? ""}`.trim(),
    );
  }
  await expect(page.getByTestId("reconciliation-link-url")).toBeVisible({ timeout: 30_000 });
  const publicUrl = (await page.getByTestId("reconciliation-link-url").textContent())?.trim();
  expect(publicUrl).toBeTruthy();
  await expect(page.getByTestId("reconciliation-completed")).toHaveCount(0);
  await expect(page.getByTestId("reconciliation-collect")).toBeVisible();
  await page.screenshot({ path: path.join(shots, "stripe-e-link.png"), fullPage: true });

  timeline.afterLink = await snap(auth, target!.id);
  expect(timeline.afterLink.contractStatus).toBe("REVIEW");
  expect(timeline.afterLink.finalized).toBe(true);
  expect(timeline.afterLink.settled).toBe(false);
  expect(timeline.afterLink.paymentStatus).not.toBe("CONFIRMED");
  writeTimeline();

  await page.reload({ waitUntil: "domcontentloaded" });
  await openReconciliation(page, target!.number);
  await expect(page.getByTestId("reconciliation-collect")).toBeVisible();
  await expect(page.getByTestId("reconciliation-reissue-link")).toBeVisible();
  await expect(page.getByTestId("reconciliation-completed")).toHaveCount(0);
  await page.screenshot({ path: path.join(shots, "stripe-f-refresh.png"), fullPage: true });

  const publicPage = await context.newPage();
  await publicPage.goto(publicUrl!, { waitUntil: "domcontentloaded" });
  await expect(publicPage.getByTestId("public-reconciliation-screen")).toBeVisible({ timeout: 30_000 });
  await expect(publicPage.getByRole("button", { name: continuePayment })).toBeVisible();
  await publicPage.screenshot({ path: path.join(shots, "stripe-g-public.png"), fullPage: true });
  await publicPage.close();
  timeline.afterPublicOpen = await snap(auth, target!.id);
  expect(timeline.afterPublicOpen.contractStatus).toBe("REVIEW");
  expect(timeline.afterPublicOpen.settled).toBe(false);

  const checkoutPage = await context.newPage();
  await checkoutPage.goto(publicUrl!, { waitUntil: "domcontentloaded" });
  await checkoutPage.getByRole("button", { name: continuePayment }).click();
  await checkoutPage.waitForURL(/checkout\.stripe\.com/, { timeout: 90_000 });
  await checkoutPage.screenshot({ path: path.join(shots, "stripe-h-checkout.png"), fullPage: true });
  timeline.afterCheckout = await snap(auth, target!.id);
  expect(timeline.afterCheckout.contractStatus).toBe("REVIEW");
  expect(timeline.afterCheckout.settled).toBe(false);
  expect(timeline.afterCheckout.paymentStatus).not.toBe("CONFIRMED");
  await checkoutPage.close();
  timeline.afterAbandon = await snap(auth, target!.id);
  expect(timeline.afterAbandon.contractStatus).toBe("REVIEW");
  expect(timeline.afterAbandon.settled).toBe(false);
  expect(timeline.afterAbandon.paymentStatus).not.toBe("CONFIRMED");

  await openReconciliation(page, target!.number);
  await expect(page.getByTestId("reconciliation-collect")).toBeVisible();
  await expect(page.getByTestId("reconciliation-completed")).toHaveCount(0);
  await page.screenshot({ path: path.join(shots, "stripe-h-staff-awaiting.png"), fullPage: true });

  const declinePage = await context.newPage();
  await declinePage.goto(publicUrl!, { waitUntil: "domcontentloaded" });
  await declinePage.getByRole("button", { name: continuePayment }).click();
  await fillStripeCheckout(declinePage, "4000000000000002");
  await expect(declinePage.getByText(/declined/i).first()).toBeVisible({ timeout: 60_000 });
  await declinePage.screenshot({ path: path.join(shots, "stripe-i-declined.png"), fullPage: true });
  timeline.afterDecline = await snap(auth, target!.id);
  expect(timeline.afterDecline.contractStatus).toBe("REVIEW");
  expect(timeline.afterDecline.settled).toBe(false);
  expect(timeline.afterDecline.paymentStatus).not.toBe("CONFIRMED");
  expect(timeline.afterDecline.finalAmount).toBe(timeline.afterLink.finalAmount);
  await declinePage.close();

  const payPage = await context.newPage();
  await payPage.goto(publicUrl!, { waitUntil: "domcontentloaded" });
  await payPage.getByRole("button", { name: continuePayment }).click();
  await fillStripeCheckout(payPage, "4242424242424242");
  await payPage.waitForURL(/\/payment\/callback/, { timeout: 180_000 });
  await payPage.screenshot({ path: path.join(shots, "stripe-j-return.png"), fullPage: true });

  const started = Date.now();
  let confirmed = await snap(auth, target!.id);
  while (!confirmed.settled && Date.now() - started < 150_000) {
    await payPage.waitForTimeout(5_000);
    confirmed = await snap(auth, target!.id);
  }
  timeline.afterProviderConfirmation = confirmed;
  fs.writeFileSync(path.join(shots, "stripe-timeline.json"), JSON.stringify(timeline, null, 2));
  expect(confirmed.contractStatus).toBe("CLOSED");
  expect(confirmed.settled).toBe(true);
  expect(confirmed.paymentStatus).toBe("CONFIRMED");
  expect(confirmed.paymentMethod).toBe("CARD");
  expect(confirmed.vehicleStatus).toBe(timeline.beforeLink.vehicleStatus);

  await page.goto("/ar/contracts", { waitUntil: "domcontentloaded" });
  await expect(page.getByTestId("contracts-table")).toBeVisible({ timeout: 60_000 });
  await page.getByTestId("contract-search").fill(target!.number);
  await page.getByTestId("data-search-submit").click();
  await expect(page.getByRole("button", { name: "المطابقة", exact: true })).toHaveCount(0);
  await expect(page.getByText("مغلق").first()).toBeVisible();
  await page.screenshot({ path: path.join(shots, "stripe-k-closed.png"), fullPage: true });
});

test("closed reconciliation row has no reconcile action", async ({ page }) => {
  fs.mkdirSync(shots, { recursive: true });
  await login(page);
  await page.goto("/ar/contracts", { waitUntil: "domcontentloaded" });
  await expect(page.getByTestId("contracts-table")).toBeVisible({ timeout: 60_000 });
  await page.getByTestId("contract-search").fill("E2E41-REC2-MUEXNXTH");
  await page.getByTestId("data-search-submit").click();
  await expect(page.getByRole("button", { name: "المطابقة", exact: true })).toHaveCount(0);
  await expect(page.getByText("مغلق").first()).toBeVisible();
  await page.locator("[data-record-number='E2E41-REC2-MUEXNXTH']").click();
  await expect(page.getByTestId("contract-detail")).toBeVisible({ timeout: 30_000 });
  await expect(page.getByTestId("contract-final-reconciliation")).toBeVisible();
  await expect(page.getByTestId("reconciliation-collect")).toHaveCount(0);
  await page.screenshot({ path: path.join(shots, "stripe-k-closed.png"), fullPage: true });
});
