import { chromium } from "@playwright/test";

const email = process.env.PLAYWRIGHT_LOGIN_EMAIL ?? "admin@diamond.test";
const password = process.env.PLAYWRIGHT_LOGIN_PASSWORD ?? "Diamond123!";
const base = process.env.PLAYWRIGHT_BASE_URL ?? "http://localhost:3100";

const browser = await chromium.launch({ channel: "chrome" });
const page = await browser.newPage();
await page.goto(`${base}/ar/login`, { waitUntil: "domcontentloaded" });
await page.locator("#email").fill(email);
await page.locator("#password").fill(password);
await page.getByRole("button", { name: /دخول|login|sign in/i }).click();
await page.waitForURL((url) => !url.pathname.includes("/login"), { timeout: 60_000 });
await page.goto(`${base}/ar/vehicles`, { waitUntil: "load", timeout: 120_000 });
const fleetError = await page.getByText("تعذّر تحميل الأسطول").isVisible().catch(() => false);
const grid = await page
  .getByTestId("vehicles-grid")
  .waitFor({ timeout: 30_000 })
  .then(() => true)
  .catch(() => false);
const skeleton = await page.getByTestId("vehicles-grid-skeleton").isVisible().catch(() => false);
await browser.close();
console.log(JSON.stringify({ fleetError, gridVisible: grid, stillLoading: skeleton }));
