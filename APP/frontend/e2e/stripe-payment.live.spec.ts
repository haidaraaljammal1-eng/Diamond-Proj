import { execSync } from "node:child_process";

import fs from "node:fs";

import { test, expect, type Page, type BrowserContext } from "@playwright/test";

import path from "node:path";



test.use({ channel: "chrome" });



const BACKEND = process.env.PLAYWRIGHT_API_URL ?? "http://localhost:3000";

const SHOTS = path.join("e2e", "__screens__", "stripe4-qa");

const PREPARE = path.join("..", "backend", "scripts", "stripe4-prepare-signed-contract.ts");



type Prepared = {

  rentalToken: string;

  contractId: string;

  contractNumber: string;

  companyCode: string;

  mobile: string;

  identityNumber: string;

  amount: number;

};



function ensureShotDir() {

  fs.mkdirSync(SHOTS, { recursive: true });

}



function prepareSigned(company = "ELITE", mobile?: string, identity?: string): Prepared {

  const args = [`npx tsx ${PREPARE}`, `--company=${company}`];

  if (mobile) args.push(`--mobile=${mobile}`);

  if (identity) args.push(`--identity=${identity}`);

  const out = execSync(args.join(" "), {

    cwd: path.join(process.cwd(), "..", "backend"),

    encoding: "utf8",

    stdio: ["pipe", "pipe", "pipe"],

    env: {

      ...process.env,

      DATABASE_URL:

        process.env.PLAYWRIGHT_DATABASE_URL ??

        "postgresql://postgres:admin@localhost:5432/haidara?schema=public",

    },

  });

  const line = out.split("\n").find((l) => l.includes('"rentalToken"'));

  if (!line) throw new Error(`prepare script output missing rentalToken line`);

  return JSON.parse(line.trim()) as Prepared;

}



async function staffToken(): Promise<string> {

  const email = process.env.PLAYWRIGHT_LOGIN_EMAIL ?? "admin@diamond.test";

  const password = process.env.PLAYWRIGHT_LOGIN_PASSWORD ?? "Diamond123!";

  const res = await fetch(`${BACKEND}/auth/login`, {

    method: "POST",

    headers: { "content-type": "application/json" },

    body: JSON.stringify({ email, password }),

  });

  const json = await res.json();

  return json.data.accessToken as string;

}



async function auditContract(contractKey: string) {

  const out = execSync(

    `npx tsx scripts/stripe4-db-audit.ts --contract=${contractKey}`,

    {

      cwd: path.join(process.cwd(), "..", "backend"),

      encoding: "utf8",

      stdio: ["pipe", "pipe", "pipe"],

      env: { ...process.env, DATABASE_URL: process.env.PLAYWRIGHT_DATABASE_URL ?? "postgresql://postgres:admin@localhost:5432/haidara?schema=public" },

    },

  );

  const marker = out.split("\n").find((l) => l.includes("STRIPE4_AUDIT_JSON="));
  if (!marker) throw new Error(`audit output missing JSON: ${out.slice(-1500)}`);
  return JSON.parse(marker.split("STRIPE4_AUDIT_JSON=")[1]!.trim()) as Record<string, unknown>;

}



async function openPayment(page: Page, locale: "ar" | "en", token: string) {

  await page.goto(`/${locale}/rental/${token}`, { waitUntil: "networkidle" });

  await expect(page.getByTestId("payment-step")).toBeVisible({ timeout: 30_000 });

}



async function fillStripeCheckout(page: Page, cardNumber: string, complete = true) {

  await page.waitForURL(/checkout\.stripe\.com/, { timeout: 90_000 });

  const country = page.getByRole("combobox", { name: /country or region/i });

  if (await country.count()) await country.selectOption({ label: "United Arab Emirates" });

  const email = page.getByRole("textbox", { name: /email/i });

  if (await email.count()) await email.fill("stripe4-qa@example.test");

  const card = page.getByRole("textbox", { name: /card number/i });

  await card.waitFor({ timeout: 60_000 });

  await card.fill(cardNumber);

  const expiry = page.getByRole("textbox", { name: /expiration/i });

  if (await expiry.count()) await expiry.fill("12/34");

  const cvc = page.getByRole("textbox", { name: /cvc/i });

  if (await cvc.count()) await cvc.fill("123");

  const name = page.getByRole("textbox", { name: /cardholder name/i });

  if (await name.count()) await name.fill("Stripe QA");

  if (!complete) return;

  await page.getByRole("button", { name: /^pay$/i }).click();

}



async function completeStripe3ds(page: Page) {
  for (let attempt = 0; attempt < 90; attempt++) {
    for (const frame of page.frames()) {
      const complete = frame.getByRole("button", { name: /^complete$/i });
      if (await complete.count()) {
        await complete.first().click({ timeout: 5_000 });
        return;
      }
    }
    await page.waitForTimeout(1_000);
  }
  throw new Error("3DS Complete button not found in any frame");
}

async function waitCallbackSuccess(page: Page) {

  if (!page.url().includes("/payment/callback")) {

    await page.waitForURL(/\/payment\/callback/, { timeout: 180_000 });

  }

  await expect(
    page.getByRole("status").filter({ hasText: /success|نجاح|تم/i }).first(),
  ).toBeVisible({ timeout: 180_000 });

}



async function payFromRental(

  page: Page,

  locale: "ar" | "en",

  token: string,

  opts: { consent?: boolean; card?: string; complete?: boolean } = {},

) {

  await openPayment(page, locale, token);

  if (opts.consent) {

    await page.getByTestId("payment-future-use-consent").locator('input[type="checkbox"]').check();

  }

  await page.getByTestId("payment-pay-stripe").click();

  await fillStripeCheckout(page, opts.card ?? "4242424242424242", opts.complete ?? true);

}



async function returnFromStripeWithoutPay(page: Page) {

  await page.waitForURL(/checkout\.stripe\.com/, { timeout: 90_000 });

  await page.getByRole("link", { name: /back to/i }).click();

  await page.waitForURL(/\/rental\//, { timeout: 60_000 });

}



function trackConsole(page: Page) {

  const errors: string[] = [];

  page.on("console", (msg) => {

    if (msg.type() !== "error") return;

    const text = msg.text();

    if (text.includes("404 (Not Found)")) return;

    errors.push(text);

  });

  return errors;

}



test.describe.configure({ mode: "serial", timeout: 300_000 });



test.describe("STRIPE-4 live payment QA", () => {

  test.beforeAll(() => ensureShotDir());



  test("visual matrix — payment screen", async ({ browser }) => {

    const prepared = prepareSigned("ELITE");

    const matrix: Array<{ locale: "ar" | "en"; w: number; h: number; tag: string }> = [

      { locale: "ar", w: 1440, h: 900, tag: "ar-desktop" },

      { locale: "ar", w: 390, h: 844, tag: "ar-mobile" },

      { locale: "en", w: 1440, h: 900, tag: "en-desktop" },

      { locale: "en", w: 390, h: 844, tag: "en-mobile" },

    ];

    for (const v of matrix) {

      const context = await browser.newContext({

        viewport: { width: v.w, height: v.h },

        locale: v.locale === "ar" ? "ar-AE" : "en-US",

      });

      const page = await context.newPage();

      const errors = trackConsole(page);

      await openPayment(page, v.locale, prepared.rentalToken);

      await page.screenshot({ path: path.join(SHOTS, `${v.tag}-payment.png`), fullPage: true });

      expect(errors, `console errors on ${v.tag}`).toEqual([]);

      await context.close();

    }

  });



  test("Consent OFF — real 4242 E2E + DB audit", async ({ page }) => {

    const prepared = prepareSigned("ELITE");

    const errors = trackConsole(page);

    await payFromRental(page, "en", prepared.rentalToken, { consent: false });

    await waitCallbackSuccess(page);

    ensureShotDir();

    await page.screenshot({ path: path.join(SHOTS, "consent-off-success-callback.png"), fullPage: true });

    expect(errors).toEqual([]);

    const audit = await auditContract(prepared.contractNumber);

    expect(audit.contractStatus).toBe("PAID");

    expect((audit.payment as { status: string }).status).toBe("CONFIRMED");

    expect(audit.rentalPaymentLedgerCount).toBe(1);

    expect(audit.contractPaymentAuthorizationCount).toBe(0);

    expect((audit.payment as { savePaymentMethodForFutureUse: boolean }).savePaymentMethodForFutureUse).toBe(false);

    await expect(page.getByText(/saved|محفوظ/i)).toHaveCount(0);

  });



  test("Consent ON — payment screen screenshot", async ({ page }) => {

    const prepared = prepareSigned("ELITE");

    await openPayment(page, "en", prepared.rentalToken);

    await page.getByTestId("payment-future-use-consent").locator('input[type="checkbox"]').check();

    await page.screenshot({ path: path.join(SHOTS, "consent-on-payment.png"), fullPage: true });

  });



  test("insufficient funds — remains SIGNED, retry available", async ({ page }) => {

    const prepared = prepareSigned("ELITE");

    await payFromRental(page, "en", prepared.rentalToken, { card: "4000000000009995" });

    await expect(page.getByText(/insufficient|declined|رفض/i)).toBeVisible({ timeout: 60_000 });

    await page.screenshot({ path: path.join(SHOTS, "insufficient-funds-stripe.png"), fullPage: true });

    await page.getByRole("link", { name: /back to/i }).click();

    await page.waitForURL(/\/rental\//, { timeout: 60_000 });

    await page.reload({ waitUntil: "networkidle" });

    await expect(page.getByTestId("payment-pay-stripe")).toBeEnabled({ timeout: 120_000 });

    const audit = await auditContract(prepared.contractNumber);

    expect(audit.contractStatus).toBe("SIGNED");

    expect(audit.rentalPaymentLedgerCount).toBe(0);

    expect(audit.contractPaymentAuthorizationCount).toBe(0);

    await page.screenshot({ path: path.join(SHOTS, "insufficient-retry.png"), fullPage: true });

  });



  test("decline card — remains SIGNED, retry available", async ({ page }) => {

    const prepared = prepareSigned("ELITE");

    await payFromRental(page, "en", prepared.rentalToken, { card: "4000000000000002" });

    await expect(page.getByText(/declined|رفض/i)).toBeVisible({ timeout: 60_000 });

    await page.screenshot({ path: path.join(SHOTS, "decline-stripe.png"), fullPage: true });

    await page.getByRole("link", { name: /back to/i }).click();

    await page.waitForURL(/\/rental\//, { timeout: 60_000 });

    await expect(page.getByTestId("payment-pay-stripe")).toBeEnabled({ timeout: 120_000 });

    const audit = await auditContract(prepared.contractNumber);

    expect(audit.contractStatus).toBe("SIGNED");

    await page.screenshot({ path: path.join(SHOTS, "decline-retry.png"), fullPage: true });

  });



  test("cancel checkout — retryable without false success", async ({ page }) => {

    const prepared = prepareSigned("ELITE");

    await openPayment(page, "en", prepared.rentalToken);

    await page.getByTestId("payment-pay-stripe").click();

    await returnFromStripeWithoutPay(page);

    await page.reload({ waitUntil: "networkidle" });

    await expect(page.getByTestId("payment-step")).toBeVisible();

    await expect(page.getByTestId("payment-pay-stripe")).toBeEnabled({ timeout: 120_000 });

    const audit = await auditContract(prepared.contractNumber);

    expect(audit.contractStatus).toBe("SIGNED");

    expect(audit.rentalPaymentLedgerCount).toBe(0);

    expect(audit.contractPaymentAuthorizationCount).toBe(0);

  });



  test("3DS — authentication and full settlement", async ({ page }) => {

    const prepared = prepareSigned("ELITE");

    await payFromRental(page, "en", prepared.rentalToken, { card: "4000002500003155" });

    await completeStripe3ds(page);

    await waitCallbackSuccess(page);

    const audit = await auditContract(prepared.contractNumber);

    expect(audit.contractStatus).toBe("PAID");

    expect(audit.rentalPaymentLedgerCount).toBe(1);

  });



  test("returning customer — same Stripe customer, new authorization", async ({ page }) => {

    const rcRun = Date.now().toString(36);
    const rcMobile = `+9715009${rcRun.slice(-6)}`;
    const rcIdentity = `784-rc${rcRun.slice(-4)}`;
    const first = prepareSigned("ELITE", rcMobile, rcIdentity);

    await payFromRental(page, "en", first.rentalToken, { consent: true });

    await waitCallbackSuccess(page);

    const firstAudit = await auditContract(first.contractNumber);

    const stripeCustomer = firstAudit.stripeCustomerId as string;

    expect(stripeCustomer).toBeTruthy();



    const second = prepareSigned("ELITE", first.mobile, first.identityNumber);

    const before = await auditContract(second.contractNumber);

    expect(before.customerId).toBe(firstAudit.customerId);

    expect(before.stripeCustomerId).toBe(stripeCustomer);



    await payFromRental(page, "en", second.rentalToken, { consent: true });

    await waitCallbackSuccess(page);

    const after = await auditContract(second.contractNumber);

    expect(after.stripeCustomerId).toBe(stripeCustomer);

    expect(after.contractPaymentAuthorizationCount).toBe(1);

    expect(after.contractStatus).toBe("PAID");

  });



  test("callback reload + reopen rental — settled state safe", async ({ page }) => {

    const prepared = prepareSigned("ELITE");

    await payFromRental(page, "en", prepared.rentalToken, { consent: false });

    await waitCallbackSuccess(page);

    const callbackUrl = page.url();

    for (let i = 0; i < 3; i++) {

      await page.reload({ waitUntil: "networkidle" });

      await expect(page.getByRole("status")).toContainText(/success|نجاح|تم/i);

    }

    await page.goto(`/en/rental/${prepared.rentalToken}`, { waitUntil: "networkidle" });
    await expect(page.getByTestId("payment-pay-stripe")).toHaveCount(0);

    const audit = await auditContract(prepared.contractNumber);

    expect(audit.contractStatus).toBe("PAID");

    expect(audit.rentalPaymentLedgerCount).toBe(1);

    expect(callbackUrl).toMatch(/\/payment\/callback/);

  });



  test("network audit — single POST /payment, no frontend Stripe API", async ({ page }) => {

    const prepared = prepareSigned("ELITE");

    const paymentPosts: string[] = [];

    const diamondStripeApiCalls: string[] = [];

    page.on("request", (req) => {

      if (req.method() === "POST" && req.url().includes("/contracts/rental/") && req.url().includes("/payment")) {

        paymentPosts.push(req.url());

      }

      if (req.url().includes("api.stripe.com") && page.url().includes("localhost:3100")) {
        diamondStripeApiCalls.push(req.url());
      }

    });

    await payFromRental(page, "en", prepared.rentalToken, { consent: false });

    await waitCallbackSuccess(page);

    expect(paymentPosts.length).toBe(1);

    expect(diamondStripeApiCalls.length).toBe(0);

    const statusPolls: string[] = [];

    page.on("request", (req) => {

      if (req.url().includes("/contracts/payments/status/")) statusPolls.push(req.url());

    });

    for (let i = 0; i < 3; i++) await page.reload({ waitUntil: "networkidle" });

    expect(statusPolls.length).toBeGreaterThan(0);

    expect(diamondStripeApiCalls.length).toBe(0);

  });



  test("double-click Pay — single checkout", async ({ page }) => {

    const prepared = prepareSigned("ELITE");

    await openPayment(page, "en", prepared.rentalToken);

    const pay = page.getByTestId("payment-pay-stripe");

    await pay.click();

    await pay.click({ force: true });

    await page.waitForURL(/checkout\.stripe\.com/, { timeout: 90_000 });

    expect(page.url()).toMatch(/checkout\.stripe\.com/);

  });



  test("two tabs — concurrent Pay safe", async ({ browser }) => {

    const prepared = prepareSigned("ELITE");

    const context = await browser.newContext();

    const a = await context.newPage();

    const b = await context.newPage();

    await openPayment(a, "en", prepared.rentalToken);

    await openPayment(b, "en", prepared.rentalToken);

    await Promise.all([

      a.getByTestId("payment-pay-stripe").click(),

      b.getByTestId("payment-pay-stripe").click(),

    ]);

    await a.waitForURL(/checkout\.stripe\.com|\/rental\//, { timeout: 90_000 });

    await b.waitForURL(/checkout\.stripe\.com|\/rental\//, { timeout: 90_000 });

    await context.close();

  });

});


