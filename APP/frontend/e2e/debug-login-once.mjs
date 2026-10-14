import { chromium } from "@playwright/test";

const webPort = process.env.DEBUG_WEB_PORT ?? "3130";
const url = `http://127.0.0.1:${webPort}/en/login`;

const browser = await chromium.launch();
const page = await browser.newPage();
const failed = [];
page.on("console", (msg) => console.log("BROWSER:", msg.type(), msg.text()));
page.on("pageerror", (err) => console.log("PAGEERROR:", err.message));
page.on("requestfailed", (req) =>
  failed.push(`${req.failure()?.errorText} ${req.url()}`),
);
page.on("response", (res) => {
  if (res.status() >= 400) failed.push(`HTTP ${res.status()} ${res.url()}`);
});
await page.goto(url, { waitUntil: "load", timeout: 120_000 });
await page.waitForTimeout(30000);
console.log("failed requests", failed.slice(0, 20));
const nextAuth = await page.evaluate(async () => {
  const start = Date.now();
  for (let i = 0; i < 60; i++) {
    const r = await fetch("/api/auth/session");
    const body = await r.text();
    if (body !== "null" || i > 5) {
      return { ms: Date.now() - start, status: r.status, body, i };
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  return { timeout: true };
});
console.log("poll session", nextAuth);
console.log("has #login", await page.locator("#login").count());
console.log("visible #login", await page.locator("#login").isVisible().catch(() => false));
console.log("inputs", await page.locator("input").count());
const session = await page.evaluate(async () => {
  const r = await fetch("/api/auth/session");
  return { status: r.status, body: await r.text() };
});
console.log("client session", session);
await page.waitForTimeout(5000);
console.log("after 5s visible #login", await page.locator("#login").isVisible().catch(() => false));
console.log("after 5s inputs", await page.locator("input").count());
await browser.close();
