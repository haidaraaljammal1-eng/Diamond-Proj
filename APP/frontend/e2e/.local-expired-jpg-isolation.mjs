import { chromium } from "@playwright/test";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { seedIsolatedPublicRental } from "./helpers/driving-license-ocr.ts";

const JPG = path.join(
  process.cwd(),
  "e2e/fixtures/driving-license/uae-driving-license-expired-corpus.jpg",
);
const ENGINE = "http://127.0.0.1:8020/extract-driving-license";
const FRONTEND = "http://127.0.0.1:3100";
const BACKEND = "http://127.0.0.1:8000";
const OUT = "C:/Users/Rw/AppData/Local/Temp/diamond-expired-jpg";
const JPEG_Q = 0.92;

async function post(bytes, filename, mime) {
  const b = `----EJ${Date.now()}`;
  const body = Buffer.concat([
    Buffer.from(`--${b}\r\nContent-Disposition: form-data; name="image"; filename="${filename}"\r\nContent-Type: ${mime}\r\n\r\n`),
    bytes,
    Buffer.from(`\r\n--${b}--\r\n`),
  ]);
  const j = await (await fetch(ENGINE, { method: "POST", headers: { "Content-Type": `multipart/form-data; boundary=${b}` }, body })).json();
  const f = j.fields ?? {};
  return {
    document_status: String(j.document_status ?? "?").toUpperCase(),
    number_extracted: Boolean(String(f.license_number?.value ?? "").trim()),
    expiry_extracted: Boolean(String(f.expiry_date?.value ?? "").trim()),
  };
}

async function dims(page, bytes) {
  return page.evaluate(async (a) => {
    const bmp = await createImageBitmap(new Blob([new Uint8Array(a)]));
    return { w: bmp.width, h: bmp.height };
  }, [...bytes]);
}

function extractMultipartFile(body, boundary) {
  const parts = body.toString("binary").split(`--${boundary}`);
  for (const part of parts) {
    if (!part.includes('name="file"')) continue;
    const headerEnd = part.indexOf("\r\n\r\n");
    if (headerEnd < 0) continue;
    const raw = part.slice(headerEnd + 4);
    const trimmed = raw.endsWith("\r\n") ? raw.slice(0, -2) : raw;
    return Buffer.from(trimmed, "binary");
  }
  return null;
}

await mkdir(OUT, { recursive: true });
const raw = await readFile(JPG);
const report = { fixture: JPG };

report.test1 = {
  dimensions: "506x305",
  mime: "image/jpeg",
  bytes: raw.length,
  ...(await post(raw, "raw.jpg", "image/jpeg")),
};

if (report.test1.document_status !== "ACCEPT") {
  console.log(JSON.stringify({ ...report, stop: "raw_not_accept" }, null, 2));
  process.exit(0);
}

const browser = await chromium.launch({ channel: "chrome" });
const context = await browser.newContext({ locale: "en-GB", viewport: { width: 1440, height: 900 } });
const page = await context.newPage();

const noop = await page.evaluate(
  async ({ arr, q }) => {
    const bmp = await createImageBitmap(new Blob([new Uint8Array(arr)], { type: "image/jpeg" }));
    const c = document.createElement("canvas");
    c.width = bmp.width;
    c.height = bmp.height;
    const ctx = c.getContext("2d");
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, c.width, c.height);
    ctx.drawImage(bmp, 0, 0);
    const out = await new Promise((r) => c.toBlob((b) => b.arrayBuffer().then((ab) => r(Array.from(new Uint8Array(ab)))), "image/jpeg", q));
    bmp.close();
    return { w: c.width, h: c.height, out };
  },
  { arr: [...raw], q: JPEG_Q },
);
const noopBytes = Buffer.from(noop.out);
await writeFile(path.join(OUT, "noop.jpg"), noopBytes);
report.test2 = {
  dimensions: `${noop.w}x${noop.h}`,
  mime: "image/jpeg",
  bytes: noopBytes.length,
  ...(await post(noopBytes, "noop.jpg", "image/jpeg")),
};

let actualBytes = null;
let captureError = null;
let uploadCaptured = null;
try {
  const seed = await seedIsolatedPublicRental(`expired jpg rc ${Date.now()}`);
  await page.route("**/contracts/rental/*/driving-license", async (route) => {
    if (route.request().method() === "POST") {
      const buf = route.request().postDataBuffer();
      const ct = route.request().headers()["content-type"] ?? "";
      const boundary = ct.split("boundary=")[1]?.trim();
      if (buf && boundary) uploadCaptured = extractMultipartFile(buf, boundary);
    }
    await route.continue();
  });
  await page.goto(`${FRONTEND}/en/rental/${seed.token}`, { waitUntil: "domcontentloaded", timeout: 60_000 });
  await page.getByTestId("license-step").waitFor({ timeout: 45_000 });
  const input = page.locator('[data-testid="license-capture"] input[type="file"]').first();
  await input.setInputFiles(JPG);
  await page.getByTestId("document-alignment-dialog").waitFor({ timeout: 20_000 });
  await page.waitForFunction(
    () => document.querySelector('[data-testid="document-alignment-dialog"]')?.getAttribute("data-composition-ready") === "true",
    { timeout: 20_000 },
  );
  await page.getByTestId("document-alignment-confirm").click();
  await page.getByTestId("document-alignment-dialog").waitFor({ state: "hidden", timeout: 60_000 });
  await page.waitForTimeout(2000);
  if (uploadCaptured) actualBytes = uploadCaptured;
  else {
    const preview = page.locator('[data-testid="license-capture-preview"]');
    await preview.waitFor({ state: "visible", timeout: 15_000 });
    const src = await preview.getAttribute("src");
    actualBytes = Buffer.from(await page.evaluate(async (u) => Array.from(new Uint8Array(await (await fetch(u)).arrayBuffer())), src));
    report.test3_capture = "preview_blob_fallback";
  }
} catch (e) {
  captureError = String(e);
  if (uploadCaptured) {
    actualBytes = uploadCaptured;
    report.test3_capture = "upload_multipart_despite_error";
  }
}

if (actualBytes) {
  await writeFile(path.join(OUT, "actual-dialog-export.jpg"), actualBytes);
  const d = await dims(page, actualBytes);
  const mime = actualBytes[0] === 0xff && actualBytes[1] === 0xd8 ? "image/jpeg" : "image/png";
  report.test3 = {
    dimensions: `${d.w}x${d.h}`,
    mime,
    bytes: actualBytes.length,
    aspect: (d.w / d.h).toFixed(3),
    capture: report.test3_capture ?? "upload_multipart_file",
    ...(await post(actualBytes, "actual.jpg", mime)),
  };

  const srcDims = { w: 506, h: 305 };
  const scaleW = d.w / srcDims.w;
  const scaleH = d.h / srcDims.h;
  report.test4 = {
    full_card_visible_estimate: "manual_inspect_file",
    source_edges_in_output: d.w < srcDims.w || d.h < srcDims.h ? "likely_cropped_or_resampled" : "same_or_larger_canvas",
    scale_factor_w: scaleW.toFixed(3),
    scale_factor_h: scaleH.toFixed(3),
    guide_aspect_output: (d.w / d.h).toFixed(3),
  };

  if (report.test3.document_status === "REJECT" && report.test2.document_status === "ACCEPT") {
    const png = await page.evaluate(async (arr) => {
      const bmp = await createImageBitmap(new Blob([new Uint8Array(arr)]));
      const c = document.createElement("canvas");
      c.width = bmp.width;
      c.height = bmp.height;
      c.getContext("2d").drawImage(bmp, 0, 0);
      bmp.close();
      return Array.from(new Uint8Array(await new Promise((r) => c.toBlob((b) => b.arrayBuffer().then((ab) => r(ab)), "image/png"))));
    }, [...actualBytes]);
    const pngBytes = Buffer.from(png);
    report.test5 = { mime: "image/png", bytes: pngBytes.length, ...(await post(pngBytes, "actual.png", "image/png")) };
  }
} else {
  report.test3 = { error: captureError };
}

await browser.close();
console.log(JSON.stringify(report, null, 2));
