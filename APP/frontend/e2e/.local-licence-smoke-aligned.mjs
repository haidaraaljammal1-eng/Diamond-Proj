/**
 * TEMP: licence smoke — manual-style zoom to fill frame, production export, :8020
 */
import { chromium } from "@playwright/test";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { seedIsolatedPublicRental } from "./helpers/driving-license-ocr.ts";

const LICENCE =
  "C:/Users/Rw/.cursor/projects/c-Users-Rw-Documents-DIAMOND-SYSTEM/assets/c__Users_Rw_AppData_Roaming_Cursor_User_workspaceStorage_ed577a768a71940254545da375e80d22_images_image-3d3cbc29-70a7-4844-a532-49cb350c1cff.png";

function extractFile(body, boundary) {
  for (const part of body.toString("binary").split(`--${boundary}`)) {
    if (!part.includes('name="file"')) continue;
    const i = part.indexOf("\r\n\r\n");
    if (i < 0) continue;
    const raw = part.slice(i + 4);
    return Buffer.from(raw.endsWith("\r\n") ? raw.slice(0, -2) : raw, "binary");
  }
  return null;
}

async function post(bytes, mime) {
  const b = `----S${Date.now()}`;
  const body = Buffer.concat([
    Buffer.from(`--${b}\r\nContent-Disposition: form-data; name="image"; filename="x"\r\nContent-Type: ${mime}\r\n\r\n`),
    bytes,
    Buffer.from(`\r\n--${b}--\r\n`),
  ]);
  const j = await (await fetch("http://127.0.0.1:8020/extract-driving-license", {
    method: "POST",
    headers: { "Content-Type": `multipart/form-data; boundary=${b}` },
    body,
  })).json();
  const f = j.fields ?? {};
  return {
    document_status: String(j.document_status ?? "?").toUpperCase(),
    number: Boolean(String(f.license_number?.value ?? "").trim()),
    expiry: Boolean(String(f.expiry_date?.value ?? "").trim()),
  };
}

const seed = await seedIsolatedPublicRental(`smoke ${Date.now()}`);
const browser = await chromium.launch({ channel: "chrome" });
const context = await browser.newContext({ locale: "en-GB", viewport: { width: 1440, height: 900 } });
const page = await context.newPage();
let captured = null;
await page.route("**/contracts/rental/*/driving-license", async (route) => {
  if (route.request().method() === "POST") {
    const buf = route.request().postDataBuffer();
    const ct = route.request().headers()["content-type"] ?? "";
    const boundary = ct.split("boundary=")[1]?.trim();
    if (buf && boundary) captured = extractFile(buf, boundary);
  }
  await route.continue();
});
const base = process.env.PLAYWRIGHT_BASE_URL ?? "http://localhost:3100";
await page.goto(`${base}/en/rental/${seed.token}`, { waitUntil: "domcontentloaded", timeout: 90_000 });
await page.getByTestId("license-step").waitFor({ timeout: 90_000 });
await page.getByTestId("license-capture").waitFor({ timeout: 30_000 });
await page.locator('[data-testid="license-capture"] input[type="file"]').first().setInputFiles(LICENCE);
await page.getByTestId("document-alignment-dialog").waitFor();
await page.waitForFunction(
  () => document.querySelector('[data-testid="document-alignment-dialog"]')?.getAttribute("data-composition-ready") === "true",
);
const targetZoom = await page.evaluate(() => {
  const LICENSE_ASPECT = 546 / 341;
  const viewportEl = document.querySelector('[data-testid="document-alignment-viewport"]');
  const stage = viewportEl?.querySelector("div");
  const img = viewportEl?.querySelector("img");
  if (!img || !stage) return 1;
  const vw = stage.clientWidth;
  const vh = stage.clientHeight;
  const sw = img.naturalWidth;
  const sh = img.naturalHeight;
  const inset = 0.92;
  const maxGuideFraction = 0.88;
  const baseFit = Math.min((vw * inset) / sw, (vh * inset) / sh);
  let gW = vw * maxGuideFraction;
  let gH = gW / LICENSE_ASPECT;
  const maxH = vh * maxGuideFraction;
  if (gH > maxH) {
    gH = maxH;
    gW = gH * LICENSE_ASPECT;
  }
  const zoomW = gW / (sw * baseFit);
  const zoomH = gH / (sh * baseFit);
  return Math.min(4, Math.max(0.35, Math.max(zoomW, zoomH)));
});
const zoomSlider = page.getByRole("slider", { name: /zoom/i });
await zoomSlider.evaluate((el, z) => {
  el.value = String(z);
  el.dispatchEvent(new Event("input", { bubbles: true }));
  el.dispatchEvent(new Event("change", { bubbles: true }));
}, targetZoom);
await page.getByTestId("document-alignment-confirm").click();
await page.getByTestId("document-alignment-dialog").waitFor({ state: "hidden", timeout: 60_000 });
const licencePanel = await page
  .locator(
    '[data-testid="license-valid"], [data-testid="license-expired"], [data-testid="license-unreadable"], [data-testid="license-review"]',
  )
  .first()
  .waitFor({ timeout: 240_000 })
  .then(async () => {
    for (const id of ["license-valid", "license-expired", "license-unreadable", "license-review"]) {
      if (await page.getByTestId(id).isVisible()) return id;
    }
    return "unknown";
  })
  .catch(() => "timeout");
if (!captured) {
  await browser.close();
  console.log(JSON.stringify({ error: "no_capture" }));
  process.exit(1);
}
const exportAspect = await page.evaluate(async (arr) => {
  const blob = new Blob([new Uint8Array(arr)]);
  const bmp = await createImageBitmap(blob);
  return { width: bmp.width, height: bmp.height, aspect: bmp.width / bmp.height };
}, [...captured]);
await browser.close();
const mime = captured[0] === 0xff && captured[1] === 0xd8 ? "image/jpeg" : "image/png";
const ocr = await post(captured, mime);
const { readFile } = await import("node:fs/promises");
const raw = await post(await readFile(LICENCE), "image/png");
const aspect = exportAspect?.aspect ?? null;
console.log(
  JSON.stringify({
    licencePanel,
    exportAspect: aspect,
    expectedAspect: 546 / 341,
    bytes: captured.length,
    mime,
    ocr,
    raw,
  }),
);
