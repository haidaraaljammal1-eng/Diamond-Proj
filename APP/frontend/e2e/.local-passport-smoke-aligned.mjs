/**
 * TEMP: passport smoke — licence valid then aligned passport upload + :8010
 */
import { chromium } from "@playwright/test";
import { readFile } from "node:fs/promises";
import { seedIsolatedPublicRental } from "./helpers/driving-license-ocr.ts";

const LICENCE =
  "C:/Users/Rw/.cursor/projects/c-Users-Rw-Documents-DIAMOND-SYSTEM/assets/c__Users_Rw_AppData_Roaming_Cursor_User_workspaceStorage_ed577a768a71940254545da375e80d22_images_image-3d3cbc29-70a7-4844-a532-49cb350c1cff.png";
const PASSPORT =
  "C:/Users/Rw/Documents/DIAMOND-SYSTEM/DOCUMENT-ENGINE/PASSPORT/.local-diag-focused-crop/A_original_mrz_box.png";

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

async function postPassport(bytes, mime) {
  const b = `----P${Date.now()}`;
  const body = Buffer.concat([
    Buffer.from(
      `--${b}\r\nContent-Disposition: form-data; name="image"; filename="x"\r\nContent-Type: ${mime}\r\n\r\n`,
    ),
    bytes,
    Buffer.from(`\r\n--${b}--\r\n`),
  ]);
  const res = await fetch("http://127.0.0.1:8010/extract-passport-number", {
    method: "POST",
    headers: { "Content-Type": `multipart/form-data; boundary=${b}` },
    body,
  });
  const j = await res.json().catch(() => ({}));
  return {
    http: res.status,
    status: String(j.status ?? "?").toUpperCase(),
    passport_number: j.passport_number ?? null,
  };
}

async function setCoverZoom(page, aspect) {
  const targetZoom = await page.evaluate((PASSPORT_ASPECT) => {
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
    let gH = gW / PASSPORT_ASPECT;
    const maxH = vh * maxGuideFraction;
    if (gH > maxH) {
      gH = maxH;
      gW = gH * PASSPORT_ASPECT;
    }
    const zoomW = gW / (sw * baseFit);
    const zoomH = gH / (sh * baseFit);
    return Math.min(4, Math.max(0.35, Math.max(zoomW, zoomH)));
  }, aspect);
  const zoomSlider = page.getByRole("slider", { name: /zoom/i });
  await zoomSlider.evaluate((el, z) => {
    el.value = String(z);
    el.dispatchEvent(new Event("input", { bubbles: true }));
    el.dispatchEvent(new Event("change", { bubbles: true }));
  }, targetZoom);
}

async function waitCompositionReady(page) {
  await page.waitForFunction(
    () =>
      document.querySelector('[data-testid="document-alignment-dialog"]')?.getAttribute("data-composition-ready") ===
      "true",
  );
}

const PASSPORT_ASPECT = 930 / 630;
const rawPassport = await readFile(PASSPORT);
const rawEngine = await postPassport(rawPassport, "image/png");

const seed = await seedIsolatedPublicRental(`passport smoke ${Date.now()}`);
const browser = await chromium.launch({ channel: "chrome" });
const context = await browser.newContext({ locale: "en-GB", viewport: { width: 1440, height: 900 } });
const page = await context.newPage();
let captured = null;
await page.route("**/contracts/rental/*/passport", async (route) => {
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
await page.locator('[data-testid="license-capture"] input[type="file"]').first().setInputFiles(LICENCE);
await page.getByTestId("document-alignment-dialog").waitFor();
await waitCompositionReady(page);
await setCoverZoom(page, 546 / 341);
await page.getByTestId("document-alignment-confirm").click();
await page.getByTestId("document-alignment-dialog").waitFor({ state: "hidden", timeout: 120_000 });
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
  });
if (licencePanel !== "license-valid" && licencePanel !== "license-expired") {
  await browser.close();
  console.log(JSON.stringify({ error: "licence_gate_failed", licencePanel, rawEngine }));
  process.exit(1);
}

await page.getByTestId("passport-step").waitFor({ timeout: 60_000 });
await page.locator('[data-testid="passport-capture"] input[type="file"]').first().setInputFiles(PASSPORT);
await page.getByTestId("document-alignment-dialog").waitFor();
await waitCompositionReady(page);
const guideAspect = await page.evaluate(() => {
  const viewportEl = document.querySelector('[data-testid="document-alignment-viewport"]');
  const guide = viewportEl?.querySelector('[class*="guideFrame"]') ?? viewportEl?.querySelectorAll("div")[2];
  const el = viewportEl?.querySelector('[aria-hidden="true"][class*="guideFrame"]');
  const frame = viewportEl?.querySelector("div[style*='width']");
  const guides = viewportEl?.querySelectorAll("div");
  let best = null;
  guides?.forEach((node) => {
    const w = node.clientWidth;
    const h = node.clientHeight;
    if (w > 100 && h > 100 && node.className.includes("guide")) best = node;
  });
  const target = el ?? best;
  if (!target) return null;
  return target.clientWidth / target.clientHeight;
});
await setCoverZoom(page, PASSPORT_ASPECT);
await page.getByTestId("document-alignment-confirm").click();
await page.getByTestId("document-alignment-dialog").waitFor({ state: "hidden", timeout: 120_000 });

const uiReady = await page
  .getByTestId("passport-ready")
  .waitFor({ timeout: 180_000 })
  .then(() => true)
  .catch(() => false);
const uiFailed = await page.getByTestId("passport-not-recognized").isVisible().catch(() => false);

if (!captured) {
  await browser.close();
  console.log(JSON.stringify({ error: "no_passport_capture", rawEngine }));
  process.exit(1);
}

const exportMeta = await page.evaluate(async (arr) => {
  const blob = new Blob([new Uint8Array(arr)]);
  const bmp = await createImageBitmap(blob);
  return { width: bmp.width, height: bmp.height, aspect: bmp.width / bmp.height };
}, [...captured]);
await browser.close();

const mime = captured[0] === 0xff && captured[1] === 0xd8 ? "image/jpeg" : "image/png";
const ocr = await postPassport(captured, mime);

console.log(
  JSON.stringify({
    guideAspectInDialog: guideAspect,
    expectedGuideAspect: PASSPORT_ASPECT,
    exportAspect: exportMeta.aspect,
    uiReady,
    uiFailed,
    rawEngine,
    exportEngine: ocr,
    bytes: captured.length,
  }),
);
