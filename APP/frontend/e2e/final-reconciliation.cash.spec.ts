import { execSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { test, expect, type Page } from "@playwright/test";

/**
 * Staff Arabic cash collection and real Stripe TEST checkout for Final Reconciliation.
 * Requires the live frontend (:3100) and backend (:8000).
 */
test.use({ channel: "chrome" });
test.describe.configure({ timeout: 300_000, mode: "serial" });

const API = process.env.PLAYWRIGHT_API_URL ?? "http://localhost:8000";
const email = process.env.PLAYWRIGHT_LOGIN_EMAIL ?? "admin@diamond.test";
const password = process.env.PLAYWRIGHT_LOGIN_PASSWORD ?? "Diamond123!";
const shots = path.join(process.cwd(), "test-results");

type ReviewRow = {
  id: string;
  number: string;
  finalAmount: number;
  finalizedAt: string | null;
  settledAt: string | null;
  settled: boolean;
  paymentStatus: string | null;
  paymentMethod: string | null;
  linkActive: boolean;
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
  const json = (await response.json()) as { data?: unknown; error?: { code?: string; context?: { reason?: string } } };
  return { status: response.status, json };
}

async function reviewRows(auth: string): Promise<ReviewRow[]> {
  const list = await api(auth, "GET", "/contracts?status=REVIEW&pageSize=100");
  const rows = (list.json.data ?? []) as Array<{ id: string; contractNumber: string }>;
  const detailed: ReviewRow[] = [];
  for (const row of rows) {
    const rec = await api(auth, "GET", `/contracts/${row.id}/reconciliation`);
    const data = rec.json.data as {
      contract: { contractNumber: string };
      totals: { finalAmount: number };
      reconciliation: { finalizedAt: string | null; settledAt: string | null; settled: boolean };
      collection: { paymentStatus: string | null; paymentMethod: string | null };
      paymentLink: { active: boolean };
    };
    detailed.push({
      id: row.id,
      number: data.contract.contractNumber,
      finalAmount: data.totals.finalAmount,
      finalizedAt: data.reconciliation.finalizedAt,
      settledAt: data.reconciliation.settledAt,
      settled: data.reconciliation.settled,
      paymentStatus: data.collection.paymentStatus,
      paymentMethod: data.collection.paymentMethod,
      linkActive: data.paymentLink.active,
    });
  }
  return detailed;
}

function checkoutStatus(contractId: string) {
  const out = execSync(`npx tsx scripts/reconciliation-checkout-status.ts ${contractId}`, {
    cwd: path.join(process.cwd(), "..", "backend"),
    encoding: "utf8",
  });
  const line = out.trim().split("\n").filter((item) => item.startsWith("{")).at(-1);
  if (!line) throw new Error("checkout status missing");
  return JSON.parse(line) as {
    contractStatus: string | null;
    paymentStatus: string | null;
    sessionStatus: string | null;
    settled: boolean;
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

async function confirmCash(page: Page) {
  await page.getByTestId("reconciliation-collect").click();
  const methodDialog = page.getByRole("dialog", { name: "اختر طريقة التحصيل" });
  await expect(methodDialog).toBeVisible();
  await methodDialog.getByRole("button", { name: /الدفع النقدي/ }).click();
  const cashSettle = page.waitForResponse(
    (response) =>
      response.url().includes("/reconciliation/cash/settle") && response.request().method() === "POST",
  );
  const reconciliationRead = page.waitForResponse((response) => {
    if (response.request().method() !== "GET") return false;
    const url = response.url();
    return /\/contracts\/[^/]+\/reconciliation(?:\?|$)/.test(url);
  });
  await page.getByRole("button", { name: "تأكيد التحصيل" }).click();
  const response = await cashSettle;
  if (response.status() !== 200) {
    const body = (await response.json().catch(() => null)) as {
      error?: { code?: string; context?: { reason?: string } };
    } | null;
    throw new Error(
      `cash settle ${response.status()} ${body?.error?.code ?? ""} ${body?.error?.context?.reason ?? ""}`.trim(),
    );
  }
  const recResponse = await reconciliationRead;
  if (recResponse.status() !== 200) {
    const body = (await recResponse.json().catch(() => null)) as {
      error?: { code?: string; context?: { reason?: string } };
    } | null;
    throw new Error(
      `reconciliation GET ${recResponse.status()} ${body?.error?.code ?? ""} ${body?.error?.context?.reason ?? ""}`.trim(),
    );
  }
  await expect(page.getByTestId("reconciliation-load-error")).toHaveCount(0);
}

async function expectClosed(page: Page, contractNumber: string) {
  await expect(page.getByTestId("reconciliation-completed").or(page.getByTestId("shared-dialog"))).toBeVisible({
    timeout: 20_000,
  });
  if (await page.getByTestId("shared-dialog").isVisible()) {
    const close = page.getByTestId("shared-dialog").getByRole("button", { name: /إغلاق|close/i }).first();
    if (await close.count()) await close.click();
  }
  await page.getByTestId("contract-search").fill(contractNumber);
  await page.getByTestId("data-search-submit").click();
  await expect(page.getByRole("button", { name: "المطابقة", exact: true })).toHaveCount(0, { timeout: 20_000 });
  await expect(page.getByText("مغلق").first()).toBeVisible();
}

test.describe("Final Reconciliation cash and Stripe", () => {
  test("cash A/B/C/D and electronic link states", async ({ page, context }) => {
    fs.mkdirSync(shots, { recursive: true });
    const auth = await token();
    const rows = await reviewRows(auth);
    const zeros = rows.filter(
      (row) =>
        row.finalAmount === 0 &&
        !row.settledAt &&
        !row.finalizedAt &&
        row.paymentStatus !== "PROCESSING" &&
        row.paymentStatus !== "PENDING" &&
        !row.linkActive,
    );
    const processing = rows.find(
      (row) => row.paymentStatus === "PROCESSING" && row.paymentMethod === "CARD" && row.finalAmount > 0,
    );
    const draftCandidate = rows.find(
      (row) =>
        row.finalAmount > 0 &&
        !row.finalizedAt &&
        !row.settled &&
        row.paymentStatus !== "PROCESSING" &&
        row.paymentStatus !== "PENDING",
    );
    expect(zeros.length, `editable zero-balance REVIEW contracts among ${rows.length}`).toBeGreaterThanOrEqual(3);

    const draft = draftCandidate ?? zeros[0]!;
    if (!draftCandidate) {
      const added = await api(auth, "POST", `/contracts/${draft.id}/reconcile`, {
        lines: [{ type: "DAMAGE", description: "scratch", amount: 120 }],
      });
      expect(added.status).toBe(200);
    }

    await login(page);
    await openReconciliation(page, draft.number);
    await page.screenshot({ path: path.join(shots, "cash-a-before.png"), fullPage: true });
    await confirmCash(page);
    await page.screenshot({ path: path.join(shots, "cash-a-after.png"), fullPage: true });
    await expectClosed(page, draft.number);

    const finalizedSource = zeros.find((row) => row.id !== draft.id)!;
    const damaged = await api(auth, "POST", `/contracts/${finalizedSource.id}/reconcile`, {
      lines: [{ type: "DAMAGE", description: "scratch", amount: 90 }],
    });
    expect(damaged.status).toBe(200);
    const fin = await api(auth, "POST", `/contracts/${finalizedSource.id}/reconciliation/finalize`);
    expect(fin.status).toBe(200);
    await openReconciliation(page, finalizedSource.number);
    await expect(page.getByTestId("reconciliation-collect")).toBeVisible();
    await page.screenshot({ path: path.join(shots, "cash-b-before.png"), fullPage: true });
    await confirmCash(page);
    await page.screenshot({ path: path.join(shots, "cash-b-after.png"), fullPage: true });
    await expectClosed(page, finalizedSource.number);

    const linkSource = zeros.find((row) => row.id !== draft.id && row.id !== finalizedSource.id);
    expect(linkSource, "no contract left for link-only cash").toBeTruthy();
    const linkDamage = await api(auth, "POST", `/contracts/${linkSource!.id}/reconcile`, {
      lines: [{ type: "DAMAGE", description: "scratch", amount: 70 }],
    });
    expect(linkDamage.status).toBe(200);
    await openReconciliation(page, linkSource!.number);
    await page.getByTestId("reconciliation-collect").click();
    const methodDialog = page.getByRole("dialog", { name: "اختر طريقة التحصيل" });
    await methodDialog.getByRole("button", { name: /الدفع الإلكتروني/ }).click();
    await expect(page.getByTestId("reconciliation-link-url")).toBeVisible({ timeout: 30_000 });
    const publicUrl = (await page.getByTestId("reconciliation-link-url").textContent())?.trim();
    expect(publicUrl).toBeTruthy();
    await page.screenshot({ path: path.join(shots, "cash-c-link.png"), fullPage: true });
    await confirmCash(page);
    await page.screenshot({ path: path.join(shots, "cash-c-after.png"), fullPage: true });
    await expectClosed(page, linkSource!.number);

    const publicPage = await context.newPage();
    await publicPage.goto(publicUrl!, { waitUntil: "domcontentloaded" });
    await expect(publicPage.getByRole("button", { name: /متابعة إلى الدفع|continue to payment/i })).toHaveCount(0);
    await publicPage.screenshot({ path: path.join(shots, "cash-c-old-link.png"), fullPage: true });
    await publicPage.close();

    expect(processing, "no active Stripe checkout contract").toBeTruthy();
    const before = checkoutStatus(processing!.id);
    expect(before.sessionStatus).toBe("open");
    expect(before.contractStatus).toBe("REVIEW");
    await openReconciliation(page, processing!.number);
    await page.screenshot({ path: path.join(shots, "cash-d-before.png"), fullPage: true });
    await confirmCash(page);
    await page.screenshot({ path: path.join(shots, "cash-d-after.png"), fullPage: true });
    await expectClosed(page, processing!.number);
    const after = checkoutStatus(processing!.id);
    expect(after.contractStatus).toBe("CLOSED");
    expect(after.settled).toBe(true);
    expect(after.paymentStatus).toBe("CANCELLED");
    expect(after.sessionStatus).toBe("expired");
    fs.writeFileSync(
      path.join(shots, "cash-d-stripe.json"),
      JSON.stringify({ before, after }, null, 2),
    );
  });
});
